import { describe, expect, it, vi } from 'vitest';
import {
  adfToText,
  allowedHostsFrom,
  columnsFromIssues,
  isAllowedJiraHost,
  isValidAllowedHost,
  createJiraStore,
  discoverFields,
  kindOf,
  MAX_BOARD_ISSUES,
  mostCommonProject,
  myIssuesJql,
  normalizeSiteUrl,
  parseSetupInput,
  pickDoneTransition,
  retryDelayMs,
  textToAdf,
  toIsoTime,
  type JiraConfig,
  type JiraIssue,
  type JiraTransition,
} from './jira';
import { StoreError } from './store';

const config: JiraConfig = {
  baseUrl: 'https://team.atlassian.net',
  email: 'me@example.com',
  token: 'secret-token',
  jql: 'project = PD',
  projectKey: null,
  issueType: 'Task',
  pointsField: 'customfield_10016',
  sprintField: 'customfield_10020',
  boardId: null,
};

function jiraIssue(key: string, fields: Partial<JiraIssue['fields']> = {}): JiraIssue {
  return {
    key,
    fields: {
      summary: `Summary of ${key}`,
      status: { id: '1', name: 'To Do', statusCategory: { key: 'new' } },
      issuetype: { name: 'Task', subtask: false },
      assignee: null,
      priority: { name: 'Medium' },
      duedate: null,
      description: null,
      ...fields,
    },
  };
}

type Handler = (body: unknown, url: URL) => unknown;

/** A fetch that answers "METHOD /path" routes with JSON; a handler can return { status, body } to fail. */
function fakeFetch(routes: Record<string, Handler | object>) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const route = routes[`${init?.method ?? 'GET'} ${url.pathname}`];
    if (!route) return new Response('{"errorMessages":["No such route"]}', { status: 404 });
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const result = typeof route === 'function' ? (route as Handler)(body, url) : route;
    if (result && typeof result === 'object' && 'status' in result && typeof result.status === 'number') {
      const { body: errorBody, headers } = result as { body?: unknown; headers?: Record<string, string> };
      return new Response(JSON.stringify(errorBody ?? {}), { status: result.status, headers });
    }
    return new Response(result === undefined ? '' : JSON.stringify(result), { status: 200 });
  });
}

describe('normalizeSiteUrl', () => {
  it.each([
    ['your-team', 'https://your-team.atlassian.net'],
    ['team.atlassian.net', 'https://team.atlassian.net'],
    ['https://team.atlassian.net/jira/software/projects/PD/boards/1', 'https://team.atlassian.net'],
    ['http://team.atlassian.net', 'https://team.atlassian.net'],
    ['', ''],
  ])('turns %j into %j', (input, expected) => {
    expect(normalizeSiteUrl(input)).toBe(expected);
  });
});

describe('parseSetupInput', () => {
  const valid = { baseUrl: 'team', email: 'me@example.com', token: 'tok', jql: 'project = PD', projectKey: 'pd' };

  it('normalizes a valid form', () => {
    expect(parseSetupInput(valid, null)).toEqual({
      baseUrl: 'https://team.atlassian.net',
      email: 'me@example.com',
      token: 'tok',
      jql: 'project = PD',
      projectKey: 'PD',
    });
  });

  it('keeps the saved token when the field is empty', () => {
    expect(parseSetupInput({ ...valid, token: '' }, 'saved').token).toBe('saved');
  });

  it('explains what is missing or wrong', () => {
    expect(() => parseSetupInput({ ...valid, baseUrl: '' }, null)).toThrow(/Jira site/);
    expect(() => parseSetupInput({ ...valid, email: 'nope' }, null)).toThrow(/email/);
    expect(() => parseSetupInput({ ...valid, token: '' }, null)).toThrow(/API token/);
    expect(() => parseSetupInput({ ...valid, projectKey: 'p-d' }, null)).toThrow(/project key/);
    expect(() => parseSetupInput({ ...valid, jql: '' }, null)).toThrow(/JQL/);
  });
});

describe('isAllowedJiraHost', () => {
  it.each([
    ['https://team.atlassian.net', true],
    ['https://team.jira.com', true],
    ['https://atlassian.net', false],
    ['https://atlassian.net.evil.example', false],
    ['https://evilatlassian.net', false],
    ['http://team.atlassian.net', false],
    ['https://user:pass@team.atlassian.net', false],
    ['not a url', false],
  ])('%s → %s', (url, allowed) => {
    expect(isAllowedJiraHost(url)).toBe(allowed);
  });

  it('accepts extra hosts and their subdomains', () => {
    expect(isAllowedJiraHost('https://jira.example.com', ['example.com'])).toBe(true);
    expect(isAllowedJiraHost('https://jira.example.com', ['jira.example.com'])).toBe(true);
    expect(isAllowedJiraHost('https://example.com.evil.io', ['example.com'])).toBe(false);
    expect(allowedHostsFrom(' Jira.Example.com , ,other.io')).toEqual(['jira.example.com', 'other.io']);
  });

  it('drops configured hosts that are not plain hostnames', () => {
    // These reach the extension's CSP header as well as the token allowlist, so a quote or a space must not survive.
    for (const bad of ['bad"host', 'has space.com', 'http://example.com', 'example.com/path', '.example.com', 'example.com.', '-example.com']) {
      expect(isValidAllowedHost(bad)).toBe(false);
    }
    // A bare TLD would allowlist every host under it, because isAllowedJiraHost matches on suffix.
    expect(isValidAllowedHost('com')).toBe(false);
    expect(isValidAllowedHost('example.com')).toBe(true);
    expect(isValidAllowedHost('jira-dev.example.co.uk')).toBe(true);
    expect(allowedHostsFrom('example.com, com, bad"host, ok.io')).toEqual(['example.com', 'ok.io']);
  });

  it('refuses to save a site outside Atlassian Cloud', () => {
    const form = { baseUrl: 'https://jira.evil.example', email: 'me@example.com', token: 'tok', jql: 'project = PD', projectKey: '' };
    expect(() => parseSetupInput(form, null)).toThrow(/won't send your API token/);
    expect(parseSetupInput(form, null, ['evil.example']).baseUrl).toBe('https://jira.evil.example');
  });

  it('never sends the token to a hand-edited site that is not allowed', async () => {
    const fetch = fakeFetch({});
    await expect(createJiraStore({ ...config, baseUrl: 'https://jira.evil.example' }, { fetch }).getComments('PD-1')).rejects.toMatchObject({
      status: 400,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Atlassian Document Format', () => {
  it('flattens paragraphs, mentions and line breaks', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hi ' }, { type: 'mention', attrs: { text: '@Ravi' } }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }] },
      ],
    };
    expect(adfToText(doc)).toBe('Hi @Ravi\na\nb\n');
    expect(adfToText(null)).toBe('');
    expect(adfToText('plain')).toBe('plain');
  });

  it('writes one paragraph per line, keeping blank lines', () => {
    const doc = textToAdf('first\n\nthird');
    expect(doc.content).toHaveLength(3);
    expect(doc.content[1].content).toEqual([]);
    expect(adfToText(doc).trim()).toBe('first\n\nthird');
  });
});

describe('myIssuesJql', () => {
  it('narrows by status group and title words, stripping JQL syntax', () => {
    expect(myIssuesJql('done', 'login "page"', null)).toBe(
      'assignee = currentUser() AND statusCategory = Done AND summary ~ "login page" ORDER BY updated DESC',
    );
  });

  it('adds a prefix wildcard to single words and ORs in an issue key', () => {
    expect(myIssuesJql('all', 'PD-12', 'PD-12')).toBe('assignee = currentUser() AND (summary ~ "PD 12" OR key = "PD-12") ORDER BY updated DESC');
    expect(myIssuesJql('all', 'consent', null)).toContain('summary ~ "consent*"');
  });
});

describe('toIsoTime', () => {
  it("reads Jira's timestamp format as UTC", () => {
    expect(toIsoTime('2026-09-14T10:22:33.123+0100')).toBe('2026-09-14T09:22:33.123Z');
    expect(toIsoTime('2026-09-14T10:22:33.000Z')).toBe('2026-09-14T10:22:33.000Z');
    expect(toIsoTime('nonsense')).toBeNull();
    expect(toIsoTime(null)).toBeNull();
  });
});

describe('issue helpers', () => {
  it('maps issue types to kinds', () => {
    expect(kindOf({ name: 'Sub-task', subtask: true })).toBe('subtask');
    expect(kindOf({ name: 'Bug', subtask: false })).toBe('bug');
    expect(kindOf({ name: 'Feature', subtask: false })).toBe('story');
    expect(kindOf({ name: 'Epic', subtask: false })).toBe('epic');
    expect(kindOf({ name: 'Chore', subtask: false })).toBe('task');
  });

  it('finds the most common project', () => {
    expect(mostCommonProject([jiraIssue('PD-1'), jiraIssue('OPS-1'), jiraIssue('PD-2')])).toBe('PD');
    expect(mostCommonProject([])).toBeNull();
  });

  it('builds columns from statuses in category order', () => {
    const issues = [
      jiraIssue('PD-1', { status: { id: '3', name: 'Done', statusCategory: { key: 'done' } } }),
      jiraIssue('PD-2', { status: { id: '1', name: 'To Do', statusCategory: { key: 'new' } } }),
      jiraIssue('PD-3', { status: { id: '2', name: 'Review', statusCategory: { key: 'indeterminate' } } }),
      jiraIssue('PD-4', { status: { id: '1', name: 'To Do', statusCategory: { key: 'new' } } }),
    ];
    expect(columnsFromIssues(issues).map((c) => c.name)).toEqual(['To Do', 'Review', 'Done']);
  });
});

describe('createJiraStore', () => {
  const me = { accountId: 'me-1', displayName: 'Jayesh', avatarUrls: { '48x48': 'https://avatar/me' } };

  function boardRoutes(pages: JiraIssue[][]) {
    return {
      'POST /rest/api/3/search/jql': (body: unknown) => {
        const token = (body as { nextPageToken?: string }).nextPageToken;
        const index = token ? Number(token) : 0;
        return { issues: pages[index], nextPageToken: index + 1 < pages.length ? String(index + 1) : undefined };
      },
      'GET /rest/api/3/myself': me,
      'GET /rest/agile/1.0/board': { values: [{ id: 7, name: 'PD board', type: 'kanban' }] },
      'GET /rest/agile/1.0/board/7/configuration': {
        name: 'PD board',
        columnConfig: {
          columns: [
            { name: 'To Do', statuses: [{ id: '1' }] },
            { name: 'Unused', statuses: [] },
            { name: 'Done', statuses: [{ id: '3' }] },
          ],
        },
      },
      'GET /rest/api/3/status': [
        { id: '1', statusCategory: { key: 'new' } },
        { id: '3', statusCategory: { key: 'done' } },
      ],
    };
  }

  it('loads every page of issues with the board columns and heroes', async () => {
    const zoe = { accountId: 'z', displayName: 'Zoe' };
    const amir = { accountId: 'a', displayName: 'Amir' };
    const fetch = fakeFetch(
      boardRoutes([
        [jiraIssue('PD-1', { assignee: zoe, customfield_10016: 3 })],
        [jiraIssue('PD-2', { assignee: amir, status: { id: '3', name: 'Done', statusCategory: { key: 'done' } } })],
      ]),
    );
    const board = await createJiraStore(config, { fetch }).getBoard();

    expect(board.quests.map((q) => q.key)).toEqual(['PD-1', 'PD-2']);
    expect(board.quests[0]).toMatchObject({ points: 3, stage: 'todo', done: false, url: 'https://team.atlassian.net/browse/PD-1' });
    expect(board.quests[1]).toMatchObject({ stage: 'done', done: true, statusId: '3' });
    expect(board.heroes.map((h) => h.name)).toEqual(['Amir', 'Zoe']);
    expect(board.columns).toEqual([
      { name: 'To Do', statusIds: ['1'], stage: 'todo' },
      { name: 'Done', statusIds: ['3'], stage: 'done' },
    ]);
    expect(board.boardName).toBe('PD board');
    expect(board.truncatedAt).toBeNull();
    expect(board.me).toEqual({ id: 'me-1', name: 'Jayesh', avatarUrl: 'https://avatar/me' });
  });

  it('signs requests with the email and API token', async () => {
    const fetch = fakeFetch(boardRoutes([[jiraIssue('PD-1')]]));
    await createJiraStore(config, { fetch }).getBoard();
    const headers = fetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('me@example.com:secret-token').toString('base64')}`);
  });

  it('marks an issue done with the transition that leads to a Done status', async () => {
    let posted: unknown;
    const fetch = fakeFetch({
      'GET /rest/api/3/issue/PD-1/transitions': {
        transitions: [
          { id: '11', name: 'Start', to: { id: '2', name: 'In Progress', statusCategory: { key: 'indeterminate' } } },
          { id: '31', name: 'Finish', to: { id: '3', name: 'Done', statusCategory: { key: 'done' } } },
        ],
      },
      'POST /rest/api/3/issue/PD-1/transitions': (body: unknown) => {
        posted = body;
        return undefined;
      },
    });
    await createJiraStore(config, { fetch }).completeQuest('PD-1');
    expect(posted).toEqual({ transition: { id: '31' } });
  });

  it('refuses to mark done when the workflow has no Done transition', async () => {
    const fetch = fakeFetch({ 'GET /rest/api/3/issue/PD-1/transitions': { transitions: [] } });
    await expect(createJiraStore(config, { fetch }).completeQuest('PD-1')).rejects.toMatchObject({ status: 409 });
  });

  it('turns Jira errors into StoreErrors with the same status', async () => {
    const fetch = fakeFetch({ 'PUT /rest/api/3/issue/PD-1/assignee': { status: 403, body: { errorMessages: ['Nope'] } } });
    const error = await createJiraStore(config, { fetch }).assignQuest('PD-1', null).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(StoreError);
    expect(error).toMatchObject({ status: 403 });
  });

  it('still loads the board when your profile fails to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetch = fakeFetch({ ...boardRoutes([[jiraIssue('PD-1')]]), 'GET /rest/api/3/myself': { status: 500 } });
    const board = await createJiraStore(config, { fetch }).getBoard();
    expect(board.me).toBeNull();
    expect(board.quests).toHaveLength(1);
    warn.mockRestore();
  });

  it('stops at the issue limit and says so', async () => {
    const pages = Array.from({ length: 11 }, (_, p) => Array.from({ length: 100 }, (_, i) => jiraIssue(`PD-${p * 100 + i + 1}`)));
    const board = await createJiraStore(config, { fetch: fakeFetch(boardRoutes(pages)) }).getBoard();
    expect(board.quests).toHaveLength(MAX_BOARD_ISSUES);
    expect(board.truncatedAt).toBe(MAX_BOARD_ISSUES);
  });

  it("finds the site's story points and sprint fields when they aren't configured", async () => {
    let requestedFields: string[] = [];
    const routes = boardRoutes([[jiraIssue('PD-1', { customfield_10050: 5 })]]);
    const fetch = fakeFetch({
      ...routes,
      'GET /rest/api/3/field': [
        { id: 'customfield_10050', name: 'Story point estimate', schema: { type: 'number', custom: 'com.pyxis.greenhopper.jira:jsw-story-points' } },
        { id: 'customfield_10099', name: 'Sprint', schema: { type: 'array', custom: 'com.pyxis.greenhopper.jira:gh-sprint' } },
      ],
      'POST /rest/api/3/search/jql': (body: unknown) => {
        requestedFields = (body as { fields: string[] }).fields;
        return routes['POST /rest/api/3/search/jql'](body);
      },
    });
    const board = await createJiraStore({ ...config, pointsField: null, sprintField: null }, { fetch }).getBoard();
    expect(board.quests[0].points).toBe(5);
    expect(requestedFields).toEqual(expect.arrayContaining(['customfield_10050', 'customfield_10099']));
  });
});

describe('discoverFields', () => {
  it('finds story points in team- and company-managed projects, and the sprint field', () => {
    const found = discoverFields([
      { id: 'summary', name: 'Summary', schema: { type: 'string' } },
      { id: 'customfield_10028', name: 'Story Points', schema: { type: 'number', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float' } },
      { id: 'customfield_10016', name: 'Story point estimate', schema: { type: 'number', custom: 'com.pyxis.greenhopper.jira:jsw-story-points' } },
      { id: 'customfield_10020', name: 'Sprint', schema: { type: 'array', custom: 'com.pyxis.greenhopper.jira:gh-sprint' } },
    ]);
    expect(found).toEqual({ points: ['customfield_10016', 'customfield_10028'], sprint: 'customfield_10020' });
  });

  it('finds nothing on a site without those fields', () => {
    expect(discoverFields([{ id: 'summary', name: 'Summary' }])).toEqual({ points: [], sprint: null });
  });
});

describe('retryDelayMs', () => {
  it("uses Jira's Retry-After seconds", () => {
    expect(retryDelayMs(0, '2')).toBe(2000);
  });

  it('accepts Retry-After as an HTTP date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T10:00:00Z'));
    expect(retryDelayMs(0, 'Sun, 13 Sep 2026 10:00:05 GMT')).toBe(5000);
    vi.useRealTimers();
  });

  it('backs off exponentially without a usable header, up to 8 seconds', () => {
    expect([0, 1, 2, 3, 4, 10].map((attempt) => retryDelayMs(attempt, null))).toEqual([500, 1000, 2000, 4000, 8000, 8000]);
    expect(retryDelayMs(1, '  ')).toBe(1000);
  });
});

describe('pickDoneTransition', () => {
  const transition = (id: string, toName: string, category: string, extra: Partial<JiraTransition> = {}): JiraTransition => ({
    id,
    name: `Move to ${toName}`,
    to: { id: `status-${id}`, name: toName, statusCategory: { key: category } },
    ...extra,
  });
  const review = transition('1', 'Code Review', 'done');
  const done = transition('2', 'Done', 'done');
  const start = transition('3', 'In Progress', 'indeterminate');

  it('prefers a status named like Done over other Done-category statuses', () => {
    expect(pickDoneTransition([review, done, start])?.id).toBe('2');
  });

  it("prefers a status in the board's last column", () => {
    const shipped = transition('4', 'Shipped', 'done');
    expect(pickDoneTransition([done, shipped], ['status-4'])?.id).toBe('4');
  });

  it('avoids transitions whose screen needs fields filled in', () => {
    const closeWithResolution = transition('5', 'Closed', 'done', { fields: { resolution: { required: true, hasDefaultValue: false } } });
    expect(pickDoneTransition([closeWithResolution, review])?.id).toBe('1');
    expect(pickDoneTransition([closeWithResolution])?.id).toBe('5');
  });

  it('returns null when no transition leads to a Done status', () => {
    expect(pickDoneTransition([start])).toBeNull();
  });
});

describe('Jira requests', () => {
  const noWait = () => vi.fn(async (_ms: number) => {});

  it('retries rate-limited requests after Retry-After', async () => {
    let attempts = 0;
    const fetch = fakeFetch({
      'PUT /rest/api/3/issue/PD-1/assignee': () => (++attempts < 3 ? { status: 429, headers: { 'Retry-After': '2' } } : undefined),
    });
    const sleep = noWait();
    await createJiraStore(config, { fetch, sleep }).assignQuest('PD-1', 'z');
    expect(attempts).toBe(3);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('gives up after three retries', async () => {
    const fetch = fakeFetch({ 'PUT /rest/api/3/issue/PD-1/assignee': { status: 429 } });
    await expect(createJiraStore(config, { fetch, sleep: noWait() }).assignQuest('PD-1', null)).rejects.toMatchObject({ status: 429 });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('retries reads when the connection drops, but not writes', async () => {
    let reads = 0;
    const fetch = fakeFetch({
      'GET /rest/api/3/issue/PD-1/comment': () => {
        if (++reads === 1) throw new TypeError('socket hang up');
        return { comments: [], total: 0 };
      },
      'POST /rest/api/3/issue/PD-1/comment': () => {
        throw new TypeError('socket hang up');
      },
    });
    const store = createJiraStore(config, { fetch, sleep: noWait() });
    await expect(store.getComments('PD-1')).resolves.toEqual({ comments: [], total: 0 });
    await expect(store.addComment('PD-1', 'hi')).rejects.toMatchObject({ status: 502 });
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('reports a timeout without retrying', async () => {
    const fetch = fakeFetch({
      'GET /rest/api/3/issue/PD-1/comment': () => {
        throw new DOMException('The operation timed out.', 'TimeoutError');
      },
    });
    await expect(createJiraStore(config, { fetch, sleep: noWait() }).getComments('PD-1')).rejects.toMatchObject({ status: 504 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('explains a rejected token', async () => {
    const fetch = fakeFetch({ 'GET /rest/api/3/issue/PD-1/comment': { status: 401 } });
    await expect(createJiraStore(config, { fetch }).getComments('PD-1')).rejects.toThrow(/expired or been revoked/);
  });
});
