import type { BoardColumn, Hero, Quest, QuestStage, SetupResult, Sprint } from '../shared/types';
import { BOARD_CACHE_MS, StoreError, withBoardCache, type QuestStore } from './store';
import { allowedHostsFrom, hostRefusal, isAllowedJiraHost } from './jira/hosts';
import { adfToText, textToAdf } from './jira/adf';
import {
  COLUMNS_TTL_MS,
  COMMENT_PAGE,
  DEFAULT_FIELDS,
  FAILED_COLUMNS_RETRY_MS,
  MAX_BOARD_ISSUES,
  REQUEST_TIMEOUT_MS,
  MAX_RETRIES,
  STAGE_BY_CATEGORY,
  type FieldIds,
  type JiraBoardConfig,
  type JiraBoardSummary,
  type JiraComment,
  type JiraFieldInfo,
  type JiraIssue,
  type JiraSprint,
  type JiraTransition,
  type JiraUser,
} from './jira/types';
import {
  ISSUE_KEY,
  MY_ISSUES_JQL,
  MY_PAGE,
  STAGE_JQL,
  columnsFromIssues,
  discoverFields,
  kindOf,
  mostCommonProject,
  myIssuesJql,
  pickDoneTransition,
  retryDelayMs,
  toComment,
  toIsoTime,
} from './jira/mapping';

// The host allowlist and the ADF converters live in their own modules; re-exported so every import site
// and server/jira.test.ts keep using server/jira as the one entry point.
export { allowedHostsFrom, isAllowedJiraHost, isValidAllowedHost } from './jira/hosts';
export { adfToText, textToAdf } from './jira/adf';
export { MAX_BOARD_ISSUES, type FieldIds, type JiraComment, type JiraFieldInfo, type JiraIssue, type JiraTransition, type JiraUser } from './jira/types';
export { columnsFromIssues, discoverFields, kindOf, mostCommonProject, myIssuesJql, pickDoneTransition, retryDelayMs, toComment, toIsoTime } from './jira/mapping';

export interface JiraConfig {
  baseUrl: string;
  email: string;
  token: string;
  jql: string;
  projectKey: string | null;
  issueType: string;
  /** Story points field id; null finds it on the site. */
  pointsField: string | null;
  /** Sprint field id; null finds it on the site. */
  sprintField: string | null;
  /** The Jira board whose columns to show; null finds the project's board automatically. */
  boardId: number | null;
  /** Hosts besides Atlassian Cloud's that may receive the token, e.g. a custom domain. */
  allowedHosts?: string[];
}

export function jiraConfigFromEnv(env = process.env): JiraConfig | null {
  const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_JQL } = env;
  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_JQL) return null;
  return {
    baseUrl: JIRA_BASE_URL.replace(/\/+$/, ''),
    email: JIRA_EMAIL,
    token: JIRA_API_TOKEN,
    jql: JIRA_JQL,
    projectKey: env.JIRA_PROJECT_KEY || null,
    issueType: env.JIRA_ISSUE_TYPE || 'Task',
    pointsField: env.JIRA_POINTS_FIELD || null,
    sprintField: env.JIRA_SPRINT_FIELD || null,
    boardId: Number(env.JIRA_BOARD_ID) || null,
    allowedHosts: allowedHostsFrom(env.JIRA_ALLOWED_HOSTS),
  };
}

const basicAuth = (email: string, token: string) => `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;

/** What the Jira code needs from the outside world, so tests can pass a fake. */
export interface JiraDeps {
  fetch?: typeof fetch;
  /** Waits between retries. */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const isTimeout = (err: unknown) => err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');

/** Checks Jira credentials and returns the account's display name. */
export async function verifyJiraLogin(baseUrl: string, email: string, token: string, { fetch: fetchImpl = fetch }: JiraDeps = {}): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/rest/api/3/myself`, {
      headers: { Authorization: basicAuth(email, token), Accept: 'application/json' },
      // A redirect could lead the token somewhere else, so it's treated as a failure.
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (isTimeout(err)) throw new StoreError(504, `${baseUrl} took too long to answer. Check the Jira site address.`);
    throw new StoreError(400, `Couldn't reach ${baseUrl}. Check the Jira site address.`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new StoreError(
      res.status,
      'Jira rejected the email or API token. Use the email of the Atlassian account that created the token, and a token made with "Create API token" (not "with scopes").',
    );
  }
  if (res.status === 404) throw new StoreError(400, `${baseUrl} doesn't look like a Jira Cloud site. Check the address.`);
  if (!res.ok) throw new StoreError(res.status, `Jira returned ${res.status}`);
  const me = (await res.json().catch(() => null)) as { accountId?: string; displayName?: string } | null;
  if (!me?.accountId) throw new StoreError(400, `${baseUrl} doesn't look like a Jira Cloud site. Check the address.`);
  return me.displayName ?? email;
}

/** Jira connection details from the setup guide, checked and normalized. */
export interface JiraSetup {
  baseUrl: string;
  email: string;
  token: string;
  jql: string;
  projectKey: string | null;
}

/** Accepts "your-team", "your-team.atlassian.net" or any URL on the site, and returns https://host. */
export function normalizeSiteUrl(value: string): string {
  let text = value.trim();
  if (!text) return '';
  if (!/^https?:\/\//i.test(text)) text = text.includes('.') ? `https://${text}` : `https://${text}.atlassian.net`;
  try {
    return `https://${new URL(text).host}`;
  } catch {
    return '';
  }
}

/** Validates the setup guide's form. An empty token falls back to the saved one. */
export function parseSetupInput(input: unknown, savedToken: string | null, allowedHosts: string[] = []): JiraSetup {
  const fields = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const text = (key: string) => {
    const value = fields[key];
    return typeof value === 'string' ? value.trim() : '';
  };

  const baseUrl = normalizeSiteUrl(text('baseUrl'));
  const email = text('email');
  const token = text('token') || savedToken || '';
  const jql = text('jql');
  const projectKey = text('projectKey').toUpperCase();

  if (!baseUrl) throw new StoreError(400, 'Enter your Jira site, like your-team.atlassian.net');
  if (!isAllowedJiraHost(baseUrl, allowedHosts)) throw hostRefusal(baseUrl);
  if (!email.includes('@')) throw new StoreError(400, 'Enter the email you log into Jira with');
  if (!token) throw new StoreError(400, 'Paste your Jira API token');
  if (projectKey && !/^[A-Z][A-Z0-9_]*$/.test(projectKey)) throw new StoreError(400, 'A project key looks like ABC, the letters before issue numbers');
  if (!jql) throw new StoreError(400, 'Enter a project key or a JQL query');
  return { baseUrl, email, token, jql, projectKey: projectKey || null };
}

/** Checks the login and that Jira accepts the JQL, before anything is saved. */
export async function verifyJiraSetup(setup: JiraSetup, deps: JiraDeps = {}): Promise<SetupResult> {
  const name = await verifyJiraLogin(setup.baseUrl, setup.email, setup.token, deps);
  const fetchImpl = deps.fetch ?? fetch;

  let res: Response;
  try {
    res = await fetchImpl(`${setup.baseUrl}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { Authorization: basicAuth(setup.email, setup.token), Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jql: setup.jql, fields: ['summary'], maxResults: 1 }),
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new StoreError(400, `Couldn't reach ${setup.baseUrl}. Check the Jira site address.`);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { errorMessages?: string[] } | null;
    throw new StoreError(400, `Jira didn't accept the JQL: ${body?.errorMessages?.join(' ') || `status ${res.status}`}`);
  }
  const page = (await res.json()) as { issues?: unknown[] };
  return { name, matchedIssues: (page.issues?.length ?? 0) > 0 };
}
/** Jira's own error text from a failed response, kept short. */
function jiraMessage(text: string): string {
  try {
    const body = JSON.parse(text) as { errorMessages?: string[]; errors?: Record<string, string> };
    const parts = [...(body.errorMessages ?? []), ...Object.values(body.errors ?? {})];
    if (parts.length > 0) return parts.join(' ').slice(0, 300);
  } catch {
    // Not JSON; use the raw text.
  }
  return text.slice(0, 300);
}

/** POSTs that only read, so they're safe to retry after a dropped connection. */
const READ_ONLY_POST = /^\/rest\/api\/3\/search\//;

export function createJiraStore(cfg: JiraConfig, { fetch: fetchImpl = fetch, sleep = realSleep }: JiraDeps = {}): QuestStore {
  const auth = basicAuth(cfg.email, cfg.token);
  const issuePath = (key: string) => `/rest/api/3/issue/${encodeURIComponent(key)}`;
  // Checked here too, since settings can be edited by hand without going through the setup guide.
  const hostAllowed = isAllowedJiraHost(cfg.baseUrl, cfg.allowedHosts);

  /**
   * One Jira request, with a timeout. Rate limits (429) are retried for every request; dropped connections and 503s
   * only for reads, since a write may already have happened.
   */
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!hostAllowed) throw hostRefusal(cfg.baseUrl);
    const isRead = method === 'GET' || READ_ONLY_POST.test(path);
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetchImpl(cfg.baseUrl + path, {
          method,
          headers: {
            Authorization: auth,
            Accept: 'application/json',
            ...(body !== undefined && { 'Content-Type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          redirect: 'error',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        if (isTimeout(err)) throw new StoreError(504, `Jira took more than ${REQUEST_TIMEOUT_MS / 1000}s to answer ${method} ${path}`);
        if (isRead && attempt < MAX_RETRIES) {
          await sleep(retryDelayMs(attempt, null));
          continue;
        }
        throw new StoreError(502, `Couldn't reach Jira at ${cfg.baseUrl}: ${err instanceof Error ? err.message : err}`);
      }

      if ((res.status === 429 || (res.status === 503 && isRead)) && attempt < MAX_RETRIES) {
        await res.body?.cancel().catch(() => undefined);
        await sleep(retryDelayMs(attempt, res.headers.get('Retry-After')));
        continue;
      }

      const text = await res.text();
      if (res.status === 401) {
        throw new StoreError(401, 'Jira rejected the saved API token. It may have expired or been revoked. Connect Jira again with a new token.');
      }
      if (!res.ok) throw new StoreError(res.status, `Jira ${method} ${path} failed (${res.status}): ${jiraMessage(text)}`);
      return (text ? JSON.parse(text) : undefined) as T;
    }
  }

  let fieldIds: Promise<FieldIds> | undefined;
  /** The points and sprint fields: the configured ids, else found on the site once per store. */
  function fields(): Promise<FieldIds> {
    if (cfg.pointsField && cfg.sprintField) return Promise.resolve({ points: [cfg.pointsField], sprint: cfg.sprintField });
    const withConfig = (found: FieldIds): FieldIds => ({
      points: cfg.pointsField ? [cfg.pointsField] : found.points,
      sprint: cfg.sprintField ?? found.sprint,
    });
    fieldIds ??= call<JiraFieldInfo[]>('GET', '/rest/api/3/field').then(
      (all) => withConfig(discoverFields(all)),
      (err: unknown) => {
        fieldIds = undefined;
        console.warn(`JiraPlay couldn't read the Jira site's fields, so it uses the usual ids: ${err instanceof Error ? err.message : err}`);
        return withConfig(DEFAULT_FIELDS);
      },
    );
    return fieldIds;
  }

  const issueFieldsFor = (ids: FieldIds) => [
    'summary',
    'status',
    'issuetype',
    'assignee',
    'priority',
    'duedate',
    'resolutiondate',
    'description',
    ...ids.points,
    ...(ids.sprint ? [ids.sprint] : []),
  ];

  function toQuest(issue: JiraIssue, ids: FieldIds): Quest {
    const f = issue.fields;
    const points = ids.points.map((id) => f[id]).find((value) => typeof value === 'number');
    const stage = STAGE_BY_CATEGORY[f.status.statusCategory.key] ?? 'todo';
    return {
      key: issue.key,
      summary: f.summary,
      kind: kindOf(f.issuetype),
      status: f.status.name,
      statusId: f.status.id,
      stage,
      done: stage === 'done',
      points: typeof points === 'number' ? points : null,
      priority: f.priority?.name ?? null,
      dueDate: f.duedate,
      description: adfToText(f.description).trim(),
      url: `${cfg.baseUrl}/browse/${issue.key}`,
      assigneeId: f.assignee?.accountId ?? null,
      resolvedAt: stage === 'done' ? toIsoTime(f.resolutiondate) : null,
    };
  }

  /** Collects the active sprints across issues, ordered by how many issues are in each. */
  function activeSprints(issues: JiraIssue[], sprintField: string | null): Sprint[] {
    if (!sprintField) return [];
    const counts = new Map<number, { sprint: Sprint; count: number }>();
    for (const issue of issues) {
      const value = issue.fields[sprintField];
      if (!Array.isArray(value)) continue;
      for (const s of value as JiraSprint[]) {
        if (s.state !== 'active') continue;
        const entry = counts.get(s.id) ?? {
          sprint: { id: s.id, name: s.name, goal: s.goal || null, startDate: s.startDate ?? null, endDate: s.endDate ?? null },
          count: 0,
        };
        entry.count++;
        counts.set(s.id, entry);
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).map((e) => e.sprint);
  }

  async function countIssues(jql: string): Promise<number> {
    const { count } = await call<{ count: number }>('POST', '/rest/api/3/search/approximate-count', { jql });
    return count;
  }

  /** The board's issues, up to MAX_BOARD_ISSUES. `truncated` is true when Jira had more. */
  async function searchIssues(ids: FieldIds): Promise<{ issues: JiraIssue[]; truncated: boolean }> {
    const issues: JiraIssue[] = [];
    let nextPageToken: string | undefined;
    do {
      const page = await call<{ issues: JiraIssue[]; nextPageToken?: string }>('POST', '/rest/api/3/search/jql', {
        jql: cfg.jql,
        fields: issueFieldsFor(ids),
        maxResults: Math.min(100, MAX_BOARD_ISSUES - issues.length),
        nextPageToken,
      });
      issues.push(...page.issues);
      nextPageToken = page.nextPageToken;
    } while (nextPageToken && issues.length < MAX_BOARD_ISSUES);
    return { issues: issues.slice(0, MAX_BOARD_ISSUES), truncated: Boolean(nextPageToken) || issues.length > MAX_BOARD_ISSUES };
  }

  let statusCategories: Promise<Map<string, QuestStage>> | undefined;
  /** Every status's category, to colour board columns that have no issues in them. */
  function statusStages(): Promise<Map<string, QuestStage>> {
    statusCategories ??= call<{ id: string; statusCategory: { key: string } }[]>('GET', '/rest/api/3/status').then(
      (statuses) => new Map(statuses.map((s) => [s.id, STAGE_BY_CATEGORY[s.statusCategory.key] ?? 'todo'])),
      (err: unknown) => {
        statusCategories = undefined;
        throw err;
      },
    );
    return statusCategories;
  }

  /** The configured board, else the project's board, preferring a scrum board when the JQL uses sprints. */
  async function findBoardId(issues: JiraIssue[]): Promise<number | null> {
    if (cfg.boardId) return cfg.boardId;
    const projectKey = cfg.projectKey ?? mostCommonProject(issues);
    if (!projectKey) return null;
    const { values } = await call<{ values: JiraBoardSummary[] }>(
      'GET',
      `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}&maxResults=50`,
    );
    const wantsScrum = /sprint/i.test(cfg.jql);
    return (values.find((b) => (b.type === 'scrum') === wantsScrum) ?? values[0])?.id ?? null;
  }

  async function loadBoardLayout(issues: JiraIssue[]): Promise<{ name: string; columns: BoardColumn[] } | null> {
    const boardId = await findBoardId(issues);
    if (boardId === null) return null;
    const [config, stages] = await Promise.all([
      call<JiraBoardConfig>('GET', `/rest/agile/1.0/board/${boardId}/configuration`),
      statusStages(),
    ]);
    const columns = config.columnConfig.columns
      .filter((c) => c.statuses.length > 0)
      .map((c) => ({ name: c.name, statusIds: c.statuses.map((s) => s.id), stage: stages.get(c.statuses[0].id) ?? 'todo' }));
    return columns.length > 0 ? { name: config.name, columns } : null;
  }

  let boardLayout: { at: number; value: Promise<{ name: string; columns: BoardColumn[] } | null> } | undefined;
  /** The Jira board's columns, cached. Falls back to the issues' statuses when there's no usable board. */
  async function boardColumns(issues: JiraIssue[]): Promise<{ name: string | null; columns: BoardColumn[] }> {
    if (!boardLayout || Date.now() - boardLayout.at > COLUMNS_TTL_MS) {
      const entry: NonNullable<typeof boardLayout> = {
        at: Date.now(),
        value: loadBoardLayout(issues).catch((err: unknown) => {
          // A failure is only remembered briefly, so one bad moment doesn't hide the board's columns for ten minutes.
          entry.at = Date.now() - COLUMNS_TTL_MS + FAILED_COLUMNS_RETRY_MS;
          console.warn(`JiraPlay couldn't read the Jira board's columns, so it shows statuses instead: ${err instanceof Error ? err.message : err}`);
          return null;
        }),
      };
      boardLayout = entry;
    }
    const layout = await boardLayout.value;
    return layout ?? { name: null, columns: columnsFromIssues(issues) };
  }

  let myAccount: Promise<Hero> | undefined;
  /** The signed-in account never changes for a store, so it's fetched once. */
  function myself(): Promise<Hero> {
    myAccount ??= call<JiraUser>('GET', '/rest/api/3/myself').then(
      (me) => ({ id: me.accountId, name: me.displayName, avatarUrl: me.avatarUrls?.['48x48'] ?? null }),
      (err: unknown) => {
        myAccount = undefined;
        throw err;
      },
    );
    return myAccount;
  }

  return withBoardCache({
    async getBoard() {
      const ids = await fields();
      const [{ issues, truncated }, me] = await Promise.all([
        searchIssues(ids),
        // The profile is a nice-to-have; the board still loads without it.
        myself().catch((err: unknown) => {
          console.warn(`JiraPlay couldn't load your Jira profile: ${err instanceof Error ? err.message : err}`);
          return null;
        }),
      ]);
      const layout = await boardColumns(issues);

      const heroes = new Map<string, Hero>();
      for (const { fields: f } of issues) {
        if (f.assignee && !heroes.has(f.assignee.accountId)) {
          heroes.set(f.assignee.accountId, {
            id: f.assignee.accountId,
            name: f.assignee.displayName,
            avatarUrl: f.assignee.avatarUrls?.['48x48'] ?? null,
          });
        }
      }

      return {
        source: 'jira',
        columns: layout.columns,
        boardName: layout.name,
        truncatedAt: truncated ? MAX_BOARD_ISSUES : null,
        sprints: activeSprints(issues, ids.sprint),
        heroes: [...heroes.values()].sort((a, b) => a.name.localeCompare(b.name)),
        quests: issues.map((issue) => toQuest(issue, ids)),
        me,
        progress: {},
      };
    },

    async completeQuest(key) {
      const [{ transitions }, layout] = await Promise.all([
        call<{ transitions: JiraTransition[] }>('GET', `${issuePath(key)}/transitions?expand=transitions.fields`),
        boardLayout?.value ?? null,
      ]);
      const done = pickDoneTransition(transitions, layout?.columns.at(-1)?.statusIds);
      if (!done) throw new StoreError(409, `No transition to a Done status is available for ${key}`);
      await call('POST', `${issuePath(key)}/transitions`, { transition: { id: done.id } });
    },

    async assignQuest(key, accountId) {
      await call('PUT', `${issuePath(key)}/assignee`, { accountId });
    },

    async getComments(key) {
      const page = await call<{ comments: JiraComment[]; total: number }>(
        'GET',
        `${issuePath(key)}/comment?orderBy=-created&maxResults=${COMMENT_PAGE}`,
      );
      return { comments: page.comments.map(toComment).reverse(), total: page.total };
    },

    async addComment(key, body) {
      return toComment(await call<JiraComment>('POST', `${issuePath(key)}/comment`, { body: textToAdf(body) }));
    },

    async getTransitions(key) {
      const { transitions } = await call<{ transitions: JiraTransition[] }>('GET', `${issuePath(key)}/transitions`);
      return transitions.map((t) => ({
        id: t.id,
        name: t.name,
        toStatus: t.to.name,
        toStatusId: t.to.id,
        toStage: STAGE_BY_CATEGORY[t.to.statusCategory.key] ?? 'todo',
      }));
    },

    async transitionQuest(key, transitionId) {
      await call('POST', `${issuePath(key)}/transitions`, { transition: { id: transitionId } });
    },

    async getMyCounts() {
      const [total, todo, doing, done, overdue] = await Promise.all(
        [
          MY_ISSUES_JQL,
          `${MY_ISSUES_JQL} AND ${STAGE_JQL.todo}`,
          `${MY_ISSUES_JQL} AND ${STAGE_JQL.doing}`,
          `${MY_ISSUES_JQL} AND ${STAGE_JQL.done}`,
          `${MY_ISSUES_JQL} AND duedate < startOfDay() AND statusCategory != Done`,
        ].map(countIssues),
      );
      return { total, todo, doing, done, overdue };
    },

    async getMyQuests({ stage, search, cursor }) {
      const key = ISSUE_KEY.test(search) ? search.toUpperCase() : null;
      const ids = await fields();
      const run = (withKey: string | null) =>
        call<{ issues: JiraIssue[]; nextPageToken?: string }>('POST', '/rest/api/3/search/jql', {
          jql: myIssuesJql(stage, search, withKey),
          fields: issueFieldsFor(ids),
          maxResults: MY_PAGE,
          nextPageToken: cursor ?? undefined,
        });

      let page: Awaited<ReturnType<typeof run>>;
      try {
        page = await run(key);
      } catch (err) {
        // Jira rejects the whole query when a typed key doesn't exist, so fall back to searching titles.
        if (!key || !(err instanceof StoreError) || err.status !== 400) throw err;
        page = await run(null);
      }
      return { quests: page.issues.map((issue) => toQuest(issue, ids)), cursor: page.nextPageToken ?? null };
    },

    async createQuest(summary, assigneeId, description = '') {
      if (!cfg.projectKey) {
        throw new StoreError(400, 'Set a Jira project key (JIRA_PROJECT_KEY, or jiraPlay.projectKey in VS Code) to create issues');
      }
      const created = await call<{ key: string }>('POST', '/rest/api/3/issue', {
        fields: {
          project: { key: cfg.projectKey },
          summary,
          issuetype: { name: cfg.issueType },
          ...(description && { description: textToAdf(description) }),
          ...(assigneeId && { assignee: { id: assigneeId } }),
        },
      });
      return {
        key: created.key,
        summary,
        kind: 'task',
        status: 'To Do',
        statusId: '',
        stage: 'todo',
        done: false,
        points: null,
        priority: null,
        dueDate: null,
        description,
        url: `${cfg.baseUrl}/browse/${created.key}`,
        assigneeId,
        resolvedAt: null,
      };
    },
  }, BOARD_CACHE_MS);
}
