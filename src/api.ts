import type {
  Board,
  CommentPage,
  MyIssueCounts,
  MyQuestQuery,
  Quest,
  QuestComment,
  QuestPage,
  QuestTransition,
  SetupInfo,
  SetupInput,
  SetupResult,
  XpEntry,
} from '../shared/types';
import type { SavedView } from '../shared/views';

/** The saved views and the query running now. */
export interface ViewsInfo {
  views: SavedView[];
  jql: string;
}
import { vscodeApi } from './lib/host';
import { parseAvatarChoice, type AvatarChoice } from '../shared/avatar';
import { isThemePref, type ThemePref } from '../shared/themes';

interface BoardApi {
  board(): Promise<Board>;
  complete(key: string): Promise<unknown>;
  assign(key: string, accountId: string | null): Promise<unknown>;
  create(summary: string, assigneeId: string | null, description?: string): Promise<Quest>;
  comments(key: string): Promise<CommentPage>;
  addComment(key: string, body: string): Promise<QuestComment>;
  transitions(key: string): Promise<QuestTransition[]>;
  transition(key: string, transitionId: string): Promise<unknown>;
  /** Everything assigned to the signed-in user in Jira, beyond the board. */
  myCounts(): Promise<MyIssueCounts>;
  myQuests(query: MyQuestQuery): Promise<QuestPage>;
  /** Named JQL queries the board can switch between, plus the one running now. */
  views(): Promise<ViewsInfo>;
  /** Replaces the saved views, and switches the board when `jql` is given. */
  saveViews(views: SavedView[], jql?: string): Promise<ViewsInfo>;
  /** The saved XP history for this board, for the recap and the personal trends. */
  history(): Promise<XpEntry[]>;
  /** The saved Jira connection, to prefill the setup guide. */
  setup(): Promise<SetupInfo>;
  /** Checks the details against Jira and saves them. */
  connect(input: SetupInput): Promise<SetupResult>;
}

/** How long to wait for an answer before giving up. Loading the board can take many Jira requests. */
const DEADLINE_MS = 30_000;
const SLOW_DEADLINE_MS = 90_000;

const timeoutError = (what: string, ms: number) =>
  new Error(`JiraPlay didn't answer ${what} within ${ms / 1000} seconds. Jira may be slow or unreachable; try again.`);

async function request<T>(method: string, path: string, body?: unknown, deadlineMs = DEADLINE_MS): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(deadlineMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') throw timeoutError(`${method} ${path}`, deadlineMs);
    throw new Error("Can't reach the JiraPlay server. Is `npm run dev` still running?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

const questPath = (key: string) => `/quests/${encodeURIComponent(key)}`;

/** Talks to the Express server when the board runs in a browser. */
const httpApi: BoardApi = {
  board: () => request<Board>('GET', '/board', undefined, SLOW_DEADLINE_MS),
  complete: (key) => request('POST', `${questPath(key)}/complete`),
  assign: (key, accountId) => request('PUT', `${questPath(key)}/assignee`, { accountId }),
  create: (summary, assigneeId, description) => request<Quest>('POST', '/quests', { summary, assigneeId, description }),
  comments: (key) => request<CommentPage>('GET', `${questPath(key)}/comments`),
  addComment: (key, body) => request<QuestComment>('POST', `${questPath(key)}/comments`, { body }),
  transitions: (key) => request<QuestTransition[]>('GET', `${questPath(key)}/transitions`),
  transition: (key, transitionId) => request('POST', `${questPath(key)}/transitions`, { transitionId }),
  myCounts: () => request<MyIssueCounts>('GET', '/me/counts', undefined, SLOW_DEADLINE_MS),
  myQuests: ({ stage, search, cursor }) =>
    request<QuestPage>('GET', `/me/quests?${new URLSearchParams({ stage, search, ...(cursor ? { cursor } : {}) })}`, undefined, SLOW_DEADLINE_MS),
  views: () => request<ViewsInfo>('GET', '/views'),
  saveViews: (views, jql) => request<ViewsInfo>('PUT', '/views', { views, jql }, SLOW_DEADLINE_MS),
  history: () => request<XpEntry[]>('GET', '/history'),
  setup: () => request<SetupInfo>('GET', '/setup'),
  connect: (input) => request<SetupResult>('POST', '/setup', input, SLOW_DEADLINE_MS),
};

/** Extension methods that can take many Jira requests. */
const SLOW_METHODS = new Set(['getBoard', 'getMyCounts', 'getMyQuests', 'connect']);

const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
const refreshListeners = new Set<() => void>();
const setupListeners = new Set<() => void>();
const themeListeners = new Set<(pref: ThemePref) => void>();
const openQuestListeners = new Set<(key: string) => void>();
let nextRequestId = 1;

if (vscodeApi) {
  window.addEventListener('message', (event: MessageEvent) => {
    const message = event.data as { type?: string; id?: number; result?: unknown; error?: string; theme?: unknown; key?: unknown } | null;
    if (message?.type === 'openQuest') {
      const { key } = message;
      if (typeof key === 'string') openQuestListeners.forEach((listener) => listener(key));
      return;
    }
    if (message?.type === 'theme') {
      const { theme } = message;
      if (isThemePref(theme)) themeListeners.forEach((listener) => listener(theme));
      return;
    }
    if (message?.type === 'refresh') {
      refreshListeners.forEach((listener) => listener());
      return;
    }
    if (message?.type === 'showSetup') {
      setupListeners.forEach((listener) => listener());
      return;
    }
    if (message?.type !== 'response' || typeof message.id !== 'number') return;
    const call = pending.get(message.id);
    if (!call) return;
    pending.delete(message.id);
    clearTimeout(call.timer);
    if (message.error !== undefined) call.reject(new Error(message.error));
    else call.resolve(message.result);
  });
}

/** Sends a request to the extension. It fails after a deadline, e.g. when the extension host restarted and forgot it. */
function callHost<T>(method: string, ...params: unknown[]): Promise<T> {
  const host = vscodeApi;
  if (!host) return Promise.reject(new Error('Not running inside VS Code'));
  return new Promise<T>((resolve, reject) => {
    const id = nextRequestId++;
    const deadlineMs = SLOW_METHODS.has(method) ? SLOW_DEADLINE_MS : DEADLINE_MS;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(timeoutError(method, deadlineMs));
    }, deadlineMs);
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
    host.postMessage({ type: 'request', id, method, params });
  });
}

/** Talks to the JiraPlay extension when the board runs in a VS Code webview. */
const hostApi: BoardApi = {
  board: () => callHost<Board>('getBoard'),
  complete: (key) => callHost('completeQuest', key),
  assign: (key, accountId) => callHost('assignQuest', key, accountId),
  create: (summary, assigneeId, description) => callHost<Quest>('createQuest', summary, assigneeId, description),
  comments: (key) => callHost<CommentPage>('getComments', key),
  addComment: (key, body) => callHost<QuestComment>('addComment', key, body),
  transitions: (key) => callHost<QuestTransition[]>('getTransitions', key),
  transition: (key, transitionId) => callHost('transitionQuest', key, transitionId),
  myCounts: () => callHost<MyIssueCounts>('getMyCounts'),
  myQuests: (query) => callHost<QuestPage>('getMyQuests', query),
  views: () => callHost<ViewsInfo>('getViews'),
  saveViews: (views, jql) => callHost<ViewsInfo>('saveViews', views, jql ?? null),
  history: () => callHost<XpEntry[]>('getHistory'),
  setup: () => callHost<SetupInfo>('getSetup'),
  connect: (input) => callHost<SetupResult>('connect', input),
};

export const api: BoardApi = vscodeApi ? hostApi : httpApi;

/** Inside VS Code, the extension asks the board to reload after sign-in or a settings change. */
export function onRefreshRequest(listener: () => void): () => void {
  refreshListeners.add(listener);
  return () => {
    refreshListeners.delete(listener);
  };
}

const AVATAR_PREF = 'jiraPlay.avatar';

/** Your chosen avatar. Inside VS Code the extension keeps it, since webview state is lost when the board closes. */
export async function loadAvatarChoice(): Promise<AvatarChoice | null> {
  if (vscodeApi) return parseAvatarChoice(await callHost('getAvatar'));
  try {
    return parseAvatarChoice(JSON.parse(localStorage.getItem(AVATAR_PREF) ?? 'null'));
  } catch {
    return null;
  }
}

export async function saveAvatarChoice(choice: AvatarChoice | null): Promise<void> {
  if (vscodeApi) {
    await callHost('setAvatar', choice);
    return;
  }
  try {
    if (choice) localStorage.setItem(AVATAR_PREF, JSON.stringify(choice));
    else localStorage.removeItem(AVATAR_PREF);
  } catch {
    throw new Error("Your browser didn't let JiraPlay save the avatar here.");
  }
}

/** Inside VS Code, the sidebar asks the board to open an issue by key. */
export function onOpenQuestRequest(listener: (key: string) => void): () => void {
  openQuestListeners.add(listener);
  return () => {
    openQuestListeners.delete(listener);
  };
}

/** Inside VS Code, the extension reports changes to the jiraPlay.theme setting. */
export function onThemeChange(listener: (pref: ThemePref) => void): () => void {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

/**
 * Inside VS Code, the "Sign in to Jira" command asks the board to open the setup guide.
 * Subscribing tells the extension the board is ready to receive that request.
 */
export function onSetupRequest(listener: () => void): () => void {
  setupListeners.add(listener);
  vscodeApi?.postMessage({ type: 'ready' });
  return () => {
    setupListeners.delete(listener);
  };
}
