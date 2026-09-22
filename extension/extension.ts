import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as vscode from 'vscode';
import { parseAvatarChoice } from '../shared/avatar';
import { withProgress } from '../shared/ledger';
import type { Board, SetupInfo, SetupResult, XpEntry } from '../shared/types';
import { DEFAULT_THEME, isThemePref, resolveThemePref, type ThemeId, type ThemePref } from '../shared/themes';
import { heroStats } from '../shared/xp';
import { createJiraStore, isAllowedJiraHost, isValidAllowedHost, parseSetupInput, verifyJiraSetup, type JiraConfig } from '../server/jira';
import { createMockStore } from '../server/mock';
import { parseCommentBody, parseMyQuestQuery, StoreError, type QuestStore } from '../server/store';
import { boardPage, type BoardEntry } from './boardHtml';
import { parseViews, type SavedView } from '../shared/views';
import { TodoCodeLensProvider } from './codeLens';
import { boardLookup } from './todoLens';
import { codeIssue, findTodos, projectsOf } from '../shared/codeIssues';
import { sidebarModel, type SidebarNode } from './sidebarModel';

const TOKEN_KEY = 'jiraPlay.apiToken';
/** Set on the first start after install, when the board opens with the setup guide. */
const WELCOMED_KEY = 'jiraPlay.welcomed';
/** How often the status bar refreshes on its own when the board isn't open. */
const STATUS_REFRESH_MS = 5 * 60_000;

export function activate(context: vscode.ExtensionContext) {
  const jiraPlay = new JiraPlay(context);
  context.subscriptions.push(
    jiraPlay,
    vscode.commands.registerCommand('jiraPlay.openBoard', () => jiraPlay.openBoard()),
    vscode.commands.registerCommand('jiraPlay.signIn', () => jiraPlay.signIn()),
    vscode.commands.registerCommand('jiraPlay.signOut', () => jiraPlay.signOut()),
    vscode.commands.registerCommand('jiraPlay.openIssue', (key: unknown) => jiraPlay.openIssue(key)),
    vscode.commands.registerCommand('jiraPlay.refresh', () => jiraPlay.refreshStatus()),
    vscode.commands.registerCommand('jiraPlay.createIssueFromCode', (uri?: vscode.Uri, line?: number) => jiraPlay.createIssueFromCode(uri, line)),
    // Brings an open board tab back after VS Code restarts.
    vscode.window.registerWebviewPanelSerializer(BOARD_VIEW_TYPE, {
      deserializeWebviewPanel: async (panel) => jiraPlay.adoptPanel(panel),
    }),
  );
  fireAndForget(jiraPlay.refreshStatus(), 'the first status refresh');
  jiraPlay.welcomeIfNew().catch((err: unknown) => console.error('JiraPlay welcome failed', err));
}

const BOARD_VIEW_TYPE = 'jiraPlay.board';

/**
 * Fires a VS Code promise we don't await. `void` alone leaves a rejection unhandled: postMessage rejects once a
 * webview is disposed, and executeCommand and openExternal can reject too. The RPC reply path uses this as well,
 * so a failed post is logged instead of leaving the board waiting out its request deadline.
 */
function fireAndForget(promise: Thenable<unknown>, what: string): void {
  Promise.resolve(promise).then(undefined, (err: unknown) => console.error(`JiraPlay: ${what} failed`, err));
}

/**
 * Saves a JiraPlay setting where it takes effect: in the workspace when the workspace already overrides it,
 * otherwise for the user. Writing only to user settings would be silently shadowed by a workspace value.
 */
async function updateSetting(key: string, value: unknown) {
  const config = vscode.workspace.getConfiguration('jiraPlay');
  const scopes = config.inspect(key);
  const target =
    scopes?.workspaceValue !== undefined && vscode.workspace.workspaceFolders ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
  await config.update(key, value, target);
}

export function deactivate() {}

interface Connection {
  store: QuestStore;
  /** False when showing demo data because the user hasn't signed in. */
  live: boolean;
  /** Where this Jira site's XP ledger is saved in globalState, or null for the demo. */
  ledgerKey: string | null;
}

const LEDGER_KEY_PREFIX = 'jiraPlay.ledger:';
/** The avatar you picked or uploaded on the board, kept here because webview state is lost when the board closes. */
const AVATAR_KEY = 'jiraPlay.avatar';

class JiraPlay implements vscode.Disposable {
  private readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  private readonly disposables: vscode.Disposable[] = [this.status];
  private connection: Promise<Connection> | null = null;
  private panel: vscode.WebviewPanel | null = null;
  /** A new webview can't receive messages until it has loaded, so the setup guide waits for its "ready" message. */
  private setupOnReady = false;
  /** An issue to open once a new board webview is ready, e.g. clicked in the sidebar. */
  private openKeyOnReady: string | null = null;
  /** The last board loaded, which the sidebar shows. */
  private lastBoard: Board | null = null;
  private readonly sidebarChanged = new vscode.EventEmitter<void>();
  private readonly sidebar: vscode.TreeDataProvider<SidebarNode> = {
    onDidChangeTreeData: this.sidebarChanged.event,
    getChildren: (node) => node?.children ?? (node ? [] : sidebarModel(this.lastBoard, currentTheme())),
    getTreeItem: (node) => treeItem(node),
  };
  private lastBoardAt = 0;
  /** Lenses over TODO comments, refreshed whenever a new board lands. */
  private readonly todoLenses = new TodoCodeLensProvider(boardLookup(() => this.lastBoard));
  private myLevel: number | null = null;
  /** XP history for the demo, kept only for this session. */
  private demoLedger: XpEntry[] = [];
  private resetTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    // The open board polls every 30s and keeps the status bar fresh; this covers the time it's closed.
    const timer = setInterval(() => {
      if (Date.now() - this.lastBoardAt > STATUS_REFRESH_MS / 2) fireAndForget(this.refreshStatus(), 'a status refresh');
    }, STATUS_REFRESH_MS);

    // The Activity Bar view: your progress and issues once connected; welcome buttons before that (the tree is empty).
    const home = vscode.window.createTreeView('jiraPlay.home', { treeDataProvider: this.sidebar });

    this.disposables.push(
      home,
      this.sidebarChanged,
      this.todoLenses,
      vscode.languages.registerCodeLensProvider({ scheme: 'file' }, this.todoLenses),
      { dispose: () => clearInterval(timer) },
      vscode.workspace.onDidChangeConfiguration((e) => {
        // The theme is only looks, so it's passed to the board without reconnecting to Jira.
        if (e.affectsConfiguration('jiraPlay.theme')) {
          fireAndForget(this.panel?.webview.postMessage({ type: 'theme', theme: themeSetting() }) ?? Promise.resolve(), 'sending the theme');
          this.sidebarChanged.fire();
        } else if (e.affectsConfiguration('jiraPlay')) {
          this.reset();
        }
      }),
      // With the theme set to `system`, the sidebar's wording follows the editor's colour theme; the board watches <body> itself.
      vscode.window.onDidChangeActiveColorTheme(() => {
        if (themeSetting() === 'system') this.sidebarChanged.fire();
      }),
      context.secrets.onDidChange((e) => {
        if (e.key === TOKEN_KEY) this.reset();
      }),
    );
    this.status.show();
  }

  dispose() {
    clearTimeout(this.resetTimer);
    this.panel?.dispose();
    for (const disposable of this.disposables) disposable.dispose();
  }

  openBoard() {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(BOARD_VIEW_TYPE, 'JiraPlay', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    this.adoptPanel(panel);
  }

  /** Loads the board into a panel, new or restored after a restart. */
  adoptPanel(panel: vscode.WebviewPanel) {
    if (this.panel && this.panel !== panel) {
      // Only one board at a time; a restored duplicate is closed.
      panel.dispose();
      this.panel.reveal();
      return;
    }
    const distUri = vscode.Uri.joinPath(this.context.extensionUri, 'dist');
    panel.webview.options = { enableScripts: true, localResourceRoots: [distUri] };
    panel.webview.html = boardHtml(panel.webview, distUri);
    const listener = panel.webview.onDidReceiveMessage((message) =>
      fireAndForget(this.handleMessage(panel.webview, message), 'handling a message from the board'),
    );
    panel.onDidDispose(() => {
      listener.dispose();
      if (this.panel === panel) this.panel = null;
    });
    this.panel = panel;
  }

  /** Opens the board's setup guide, where the user connects or updates their Jira account. */
  signIn() {
    if (this.panel) {
      this.panel.reveal();
      fireAndForget(this.panel.webview.postMessage({ type: 'showSetup' }), 'opening the setup guide');
      return;
    }
    this.setupOnReady = true;
    this.openBoard();
  }

  /** Opens an issue on the board, e.g. from the sidebar. */
  openIssue(key: unknown) {
    if (typeof key !== 'string' || !key) return;
    if (this.panel) {
      this.panel.reveal();
      fireAndForget(this.panel.webview.postMessage({ type: 'openQuest', key }), 'opening an issue');
      return;
    }
    this.openKeyOnReady = key;
    this.openBoard();
  }

  /**
   * Creates a Jira issue from the editor: the selection, or the TODO comment a CodeLens was clicked on.
   * The summary is editable before anything is sent, and the code goes into the description with its location.
   */
  async createIssueFromCode(uri?: vscode.Uri, line?: number) {
    const editor = vscode.window.activeTextEditor;
    const document = uri ? await vscode.workspace.openTextDocument(uri) : editor?.document;
    if (!document) {
      fireAndForget(vscode.window.showInformationMessage('JiraPlay: open a file first.'), 'the no-file notice');
      return;
    }

    // A lens passes its own line; otherwise use the selection, falling back to the cursor's line.
    const fromLens = line !== undefined;
    const selection = !fromLens && editor?.document === document && !editor.selection.isEmpty ? editor.selection : undefined;
    const startLine = fromLens ? line : (selection?.start.line ?? editor?.selection.active.line ?? 0);
    const endLine = fromLens ? line : (selection?.end.line ?? startLine);
    const code = selection ? document.getText(selection) : document.getText(document.lineAt(startLine).range);
    const todo = fromLens ? findTodos(document.getText(), this.projectKeys()).find((t) => t.line === line) : undefined;

    const draft = codeIssue({
      code,
      file: vscode.workspace.asRelativePath(document.uri),
      startLine: startLine + 1,
      endLine: endLine + 1,
      language: document.languageId,
      note: todo?.text,
    });

    const summary = await vscode.window.showInputBox({
      title: 'Create Jira issue',
      prompt: 'The selected code goes into the description.',
      value: draft.summary,
      valueSelection: [0, draft.summary.length],
      validateInput: (value) => (value.trim() ? undefined : 'A summary is required'),
    });
    if (summary === undefined) return; // Escaped.

    try {
      const { store } = await this.connect();
      const quest = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'JiraPlay: creating the issue…' },
        () => store.createQuest(summary.trim(), null, draft.description),
      );
      this.afterCreate(quest.key, document, fromLens ? line : undefined);
    } catch (err: unknown) {
      fireAndForget(vscode.window.showErrorMessage(`JiraPlay: ${errorText(err)}`), 'the create-issue error');
    }
  }

  /** Offers the two things you'd want right after creating an issue: see it, or leave its key in the code. */
  private afterCreate(key: string, document: vscode.TextDocument, line: number | undefined) {
    const actions = line === undefined ? ['Open on board'] : ['Open on board', 'Add key to the TODO'];
    fireAndForget(
      vscode.window.showInformationMessage(`JiraPlay: created ${key}.`, ...actions).then(async (choice) => {
        if (choice === 'Open on board') this.openIssue(key);
        if (choice === 'Add key to the TODO' && line !== undefined) await stampKey(document, line, key);
      }),
      'the created-issue notice',
    );
    fireAndForget(this.refreshStatus(), 'a status refresh');
  }

  /** Project prefixes on the last board, so a TODO's key is only linked when it's one of ours. */
  private projectKeys(): string[] {
    return projectsOf(this.lastBoard?.quests.map((q) => q.key) ?? []);
  }

  /** On the first start after install, walks the user through connecting Jira. */
  async welcomeIfNew() {
    if (this.context.globalState.get(WELCOMED_KEY)) return;
    await this.context.globalState.update(WELCOMED_KEY, true);
    const { live } = await this.connect();
    if (!live) this.signIn();
  }

  async signOut() {
    await this.context.secrets.delete(TOKEN_KEY);
    fireAndForget(vscode.window.showInformationMessage('JiraPlay: Signed out. Your API token was removed from this computer.'), 'the sign-out notice');
  }

  async refreshStatus() {
    try {
      const connection = await this.connect();
      if (!connection.live) {
        this.showSignedOut();
        return;
      }
      this.onBoard(await this.loadBoard(connection));
    } catch (err) {
      this.status.text = '$(warning) JiraPlay';
      this.status.tooltip = `JiraPlay couldn't load Jira: ${errorText(err)}`;
      this.status.command = 'jiraPlay.openBoard';
    }
  }

  /** Reconnects after sign-in, sign-out or a settings change. Debounced because saving settings fires several events. */
  private reset() {
    clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => {
      this.connection = null;
      this.myLevel = null;
      fireAndForget(this.panel?.webview.postMessage({ type: 'refresh' }) ?? Promise.resolve(), 'asking the board to refresh');
      fireAndForget(this.refreshStatus(), 'a status refresh');
    }, 300);
  }

  /** The current store. A failure to set it up isn't kept, so the next request tries again. */
  private connect(): Promise<Connection> {
    if (!this.connection) {
      const attempt = this.createConnection().catch((err: unknown) => {
        if (this.connection === attempt) this.connection = null;
        throw err;
      });
      this.connection = attempt;
    }
    return this.connection;
  }

  private async createConnection(): Promise<Connection> {
    const config = vscode.workspace.getConfiguration('jiraPlay');
    const setting = (key: string) => config.get<string>(key, '').trim();
    const baseUrl = setting('jiraBaseUrl').replace(/\/+$/, '');
    const email = setting('email');
    const jql = setting('jql');
    const token = await this.context.secrets.get(TOKEN_KEY);
    if (!baseUrl || !email || !jql || !token) return { store: createMockStore(), live: false, ledgerKey: null };

    const jira: JiraConfig = {
      allowedHosts: allowedHostsSetting(),
      baseUrl,
      email,
      token,
      jql,
      projectKey: setting('projectKey') || null,
      issueType: setting('issueType') || 'Task',
      pointsField: setting('pointsField') || null,
      sprintField: setting('sprintField') || null,
      boardId: Number(setting('boardId')) || null,
    };
    return { store: createJiraStore(jira), live: true, ledgerKey: `${LEDGER_KEY_PREFIX}${baseUrl}` };
  }

  /** Loads the board with everyone's progress, merged into the XP ledger saved for this Jira site. */
  private async loadBoard({ store, ledgerKey }: Connection): Promise<Board> {
    const board = await store.getBoard();
    if (!ledgerKey) {
      const result = withProgress(board, this.demoLedger);
      this.demoLedger = result.ledger;
      return result.board;
    }
    const saved = this.context.globalState.get<XpEntry[]>(ledgerKey, []);
    const result = withProgress(board, saved);
    if (result.ledger !== saved) await this.context.globalState.update(ledgerKey, result.ledger);
    return result.board;
  }

  /** Named JQL queries the board can switch between, plus the one running now. */
  private views(): { views: SavedView[]; jql: string } {
    const config = vscode.workspace.getConfiguration('jiraPlay');
    return { views: parseViews(config.get('savedViews')), jql: config.get<string>('jql', '').trim() };
  }

  /**
   * Replaces the saved views, and optionally switches the board to one of them. Switching writes jiraPlay.jql
   * and drops the cached connection, so the next board load runs the new query.
   */
  private async saveViews(rawViews: unknown, rawJql: unknown): Promise<{ views: SavedView[]; jql: string }> {
    const views = parseViews(rawViews);
    await updateSetting('savedViews', views);
    const jql = optionalString(rawJql, 'jql');
    if (jql !== null) {
      if (!jql.trim()) throw new StoreError(400, 'jql must be a non-empty string');
      await updateSetting('jql', jql.trim());
      this.reset();
    }
    return this.views();
  }

  /** The saved XP history for this board: what the recap and the personal trends are drawn from. */
  private async history(): Promise<XpEntry[]> {
    const { ledgerKey } = await this.connect();
    return ledgerKey ? this.context.globalState.get<XpEntry[]>(ledgerKey, []) : this.demoLedger;
  }

  private async setupInfo(): Promise<SetupInfo> {
    const config = vscode.workspace.getConfiguration('jiraPlay');
    const setting = (key: string) => config.get<string>(key, '').trim();
    const [{ live }, token] = await Promise.all([this.connect(), this.context.secrets.get(TOKEN_KEY)]);
    return {
      live,
      baseUrl: setting('jiraBaseUrl'),
      email: setting('email'),
      jql: setting('jql'),
      projectKey: setting('projectKey'),
      hasToken: Boolean(token),
    };
  }

  /** Checks the setup guide's details against Jira, then saves them: the token in the keychain, the rest in settings. */
  private async saveSetup(input: unknown): Promise<SetupResult> {
    const setup = parseSetupInput(input, (await this.context.secrets.get(TOKEN_KEY)) ?? null, allowedHostsSetting());
    const result = await verifyJiraSetup(setup);

    await updateSetting('jiraBaseUrl', setup.baseUrl);
    await updateSetting('email', setup.email);
    await updateSetting('jql', setup.jql);
    await updateSetting('projectKey', setup.projectKey ?? '');
    await this.context.secrets.store(TOKEN_KEY, setup.token);

    // Drop the old connection now so the board's next request already uses the new account.
    this.connection = null;
    this.reset();
    return result;
  }

  private async handleMessage(webview: vscode.Webview, message: unknown) {
    if (!isRecord(message)) return;

    if (message.type === 'ready') {
      if (this.setupOnReady) {
        this.setupOnReady = false;
        fireAndForget(webview.postMessage({ type: 'showSetup' }), 'opening the setup guide');
      }
      if (this.openKeyOnReady) {
        fireAndForget(webview.postMessage({ type: 'openQuest', key: this.openKeyOnReady }), 'opening an issue');
        this.openKeyOnReady = null;
      }
      return;
    }

    if (message.type === 'setTheme') {
      if (isThemePref(message.theme)) fireAndForget(updateSetting('theme', message.theme), 'saving the theme');
      return;
    }

    if (message.type === 'openExternal') {
      // Only Atlassian pages (issues, the API token page) and allowed Jira hosts open from the board.
      // 'atlassian.com' is wider than the token allowlist on purpose: the setup guide links to Atlassian's
      // own docs and token page, which don't live on the Jira site itself.
      if (typeof message.url === 'string' && (isAllowedJiraHost(message.url, [...allowedHostsSetting(), 'atlassian.com']))) {
        fireAndForget(vscode.env.openExternal(vscode.Uri.parse(message.url)), 'opening a link');
      }
      return;
    }

    if (message.type !== 'request' || typeof message.id !== 'number') return;
    const params = Array.isArray(message.params) ? message.params : [];
    try {
      const result = await this.dispatch(String(message.method), params);
      fireAndForget(webview.postMessage({ type: 'response', id: message.id, result }), 'replying to the board');
    } catch (err) {
      fireAndForget(webview.postMessage({ type: 'response', id: message.id, error: errorText(err) }), 'replying to the board');
    }
  }

  private async dispatch(method: string, [first, second, third]: unknown[]) {
    if (method === 'getSetup') return this.setupInfo();
    if (method === 'connect') return this.saveSetup(first);
    if (method === 'getHistory') return this.history();
    if (method === 'getViews') return this.views();
    if (method === 'saveViews') return this.saveViews(first, second);
    if (method === 'getAvatar') return parseAvatarChoice(this.context.globalState.get(AVATAR_KEY));
    if (method === 'setAvatar') {
      const choice = parseAvatarChoice(first);
      if (first !== null && !choice) throw new StoreError(400, "That avatar can't be used. Choose a PNG, JPG or WebP image.");
      await this.context.globalState.update(AVATAR_KEY, choice ?? undefined);
      return { ok: true };
    }

    const connection = await this.connect();
    const { store } = connection;
    switch (method) {
      case 'getBoard': {
        const board = await this.loadBoard(connection);
        this.onBoard(board);
        return board;
      }
      case 'completeQuest':
        await store.completeQuest(requireString(first, 'key'));
        return { ok: true };
      case 'assignQuest':
        await store.assignQuest(requireString(first, 'key'), optionalString(second, 'accountId'));
        return { ok: true };
      case 'getMyCounts':
        return store.getMyCounts();
      case 'getMyQuests':
        return store.getMyQuests(parseMyQuestQuery(first));
      case 'getTransitions':
        return store.getTransitions(requireString(first, 'key'));
      case 'transitionQuest':
        await store.transitionQuest(requireString(first, 'key'), requireString(second, 'transitionId'));
        return { ok: true };
      case 'getComments':
        return store.getComments(requireString(first, 'key'));
      case 'addComment':
        return store.addComment(requireString(first, 'key'), parseCommentBody(second));
      case 'createQuest':
        return store.createQuest(requireString(first, 'summary').trim(), optionalString(second, 'assigneeId'), optionalString(third, 'description') ?? '');
      default:
        throw new StoreError(400, `Unknown request ${method}`);
    }
  }

  /** Shows the signed-in user's level in the status bar, and celebrates when it goes up. */
  private onBoard(board: Board) {
    this.lastBoardAt = Date.now();
    this.lastBoard = board;
    this.sidebarChanged.fire();
    this.todoLenses.refresh();
    if (board.source === 'mock') {
      this.showSignedOut();
      return;
    }
    fireAndForget(vscode.commands.executeCommand('setContext', 'jiraPlay.connected', true), 'setting the connected context');

    const mine = board.quests.filter((q) => q.assigneeId === board.me?.id);
    const progress = board.me ? board.progress[board.me.id] : undefined;
    const stats = heroStats(mine, progress?.xp);
    const open = mine.filter((q) => !q.done).length;
    const sprint = board.sprints[0]?.name ?? 'Jira';
    const streak = progress?.streak ?? 0;

    this.status.text = `⚔ LVL ${stats.level} · ${open} open${streak >= 2 ? ` · 🔥${streak}` : ''}`;
    this.status.tooltip = new vscode.MarkdownString(
      [
        `**JiraPlay · ${sprint}**`,
        `Level ${stats.level} · ${stats.xp} XP (${stats.toNext} XP to level ${stats.level + 1})`,
        `${open} open · ${mine.length - open} done${streak > 0 ? ` · ${streak}-day streak` : ''}`,
        'Click to open the board',
      ].join('\n\n'),
    );
    this.status.command = 'jiraPlay.openBoard';

    if (this.myLevel !== null && stats.level > this.myLevel) {
      fireAndForget(
        vscode.window.showInformationMessage(`🎉 Level up! You reached level ${stats.level} in ${sprint}.`, 'Open board').then((choice) => {
          if (choice) this.openBoard();
        }),
        'the level-up notice',
      );
    }
    this.myLevel = stats.level;
  }

  private showSignedOut() {
    this.myLevel = null;
    if (this.lastBoard?.source === 'jira') {
      this.lastBoard = null;
      this.sidebarChanged.fire();
    }
    fireAndForget(vscode.commands.executeCommand('setContext', 'jiraPlay.connected', false), 'clearing the connected context');
    this.status.text = '$(account) JiraPlay: Connect Jira';
    this.status.tooltip = 'JiraPlay is showing demo data. Click for a short guide to connect your Jira account.';
    this.status.command = 'jiraPlay.signIn';
  }
}

function treeItem(node: SidebarNode): vscode.TreeItem {
  const state = node.children
    ? node.expanded
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.Collapsed
    : vscode.TreeItemCollapsibleState.None;
  const item = new vscode.TreeItem(node.label, state);
  item.id = node.id;
  item.description = node.description;
  item.tooltip = node.tooltip;
  if (node.icon) item.iconPath = new vscode.ThemeIcon(node.icon);
  item.command = node.command;
  return item;
}

/**
 * Extra hosts the token may go to. The setting is user-only, so a workspace can't add a host. Values are hand-typed,
 * so anything that isn't a plain hostname is dropped: these end up in the board's CSP header as well as in the
 * allowlist, and a value carrying a quote would otherwise break out of the content="..." attribute.
 */
export function allowedHostsSetting(): string[] {
  const value = vscode.workspace.getConfiguration('jiraPlay').get<unknown>('allowedHosts');
  if (!Array.isArray(value)) return [];
  return value
    .filter((h): h is string => typeof h === 'string')
    .map((h) => h.trim().toLowerCase())
    .filter(isValidAllowedHost);
}

function themeSetting(): ThemePref {
  const value = vscode.workspace.getConfiguration('jiraPlay').get('theme');
  return isThemePref(value) ? value : DEFAULT_THEME;
}

/** The theme to show right now: the setting, or with `system` the one that fits the editor's colour theme. */
function currentTheme(): ThemeId {
  const { kind } = vscode.window.activeColorTheme;
  const dark = kind !== vscode.ColorThemeKind.Light && kind !== vscode.ColorThemeKind.HighContrastLight;
  return resolveThemePref(themeSetting(), dark);
}

/**
 * Builds the webview page from the Vite build, with a Content Security Policy that only allows the bundled files.
 * The theme goes on <html> so the board's first paint already uses it.
 */
function boardHtml(webview: vscode.Webview, distUri: vscode.Uri): string {
  let entry: BoardEntry | undefined;
  const manifestPath = vscode.Uri.joinPath(distUri, 'manifest.json').fsPath;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, BoardEntry | undefined>;
    entry = manifest['index.html'];
  } catch (err: unknown) {
    // A corrupt or unreadable manifest looks the same as an unbuilt dist to the user, so say which it was here.
    console.error(`JiraPlay: could not read ${manifestPath}`, err);
    entry = undefined;
  }

  return boardPage({
    entry,
    asset: (path) => webview.asWebviewUri(vscode.Uri.joinPath(distUri, path)).toString(),
    cspSource: webview.cspSource,
    theme: currentTheme(),
    themePref: themeSetting(),
    allowedHosts: allowedHostsSetting(),
    nonce: randomBytes(16).toString('base64'),
  });
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new StoreError(400, `${name} is required`);
  return value;
}

function optionalString(value: unknown, name: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new StoreError(400, `${name} must be a string or null`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Writes the new key into the TODO marker, turning `// TODO: thing` into `// TODO(PD-918): thing`, so the
 * comment and the issue stay tied together and the CodeLens links them from now on.
 */
async function stampKey(document: vscode.TextDocument, line: number, key: string): Promise<void> {
  const text = document.lineAt(line).text;
  const marker = /\b(TODO|FIXME|HACK|XXX|BUG)\b(\([^)]*\))?/.exec(text);
  if (!marker) return;
  const edit = new vscode.WorkspaceEdit();
  const start = marker.index + marker[1].length;
  const range = new vscode.Range(line, start, line, start + (marker[2]?.length ?? 0));
  edit.replace(document.uri, range, `(${key})`);
  await vscode.workspace.applyEdit(edit);
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
