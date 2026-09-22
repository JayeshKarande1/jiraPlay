import 'dotenv/config';
import { resolve } from 'node:path';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { withProgress } from '../shared/ledger';
import type { SetupInfo, XpEntry } from '../shared/types';
import { updateEnvFile } from './envFile';
import { readLedger, saveLedger } from './ledgerFile';
import { readViews, saveViews } from './viewsFile';
import { allowedHostsFrom, createJiraStore, jiraConfigFromEnv, parseSetupInput, verifyJiraSetup } from './jira';
import { parseViews } from '../shared/views';
import { refuseNonLocal } from './localGuard';
import { createMockStore } from './mock';
import { parseCommentBody, parseMyQuestQuery, StoreError, type QuestStore } from './store';

const PORT = Number(process.env.PORT ?? 8787);
const ENV_PATH = resolve(process.cwd(), '.env');
/** XP history per Jira site, so XP outlives the issues on the board. */
const LEDGER_PATH = resolve(process.cwd(), '.jiraplay-ledger.json');
/** Saved views (named JQL) per Jira site. */
const VIEWS_PATH = resolve(process.cwd(), '.jiraplay-views.json');

// Replaced when the setup guide saves a new connection.
let jira = jiraConfigFromEnv();
let store: QuestStore = jira ? createJiraStore(jira) : createMockStore();

const app = express();
app.disable('x-powered-by');

/** Every route acts with the saved Jira token, so the API only answers pages on this computer. */
const localOnly: RequestHandler = (req, _res, next) => {
  const reason = refuseNonLocal(req.hostname, req.get('origin'), req.get('sec-fetch-site'));
  if (reason) throw new StoreError(403, reason);
  next();
};

// The guard runs before the body is parsed, so refused requests cost nothing.
app.use('/api', localOnly);
app.use(express.json({ limit: '100kb' }));

/** XP history for the demo, kept only while the server runs. */
let demoLedger: XpEntry[] = [];

/** Every board goes out with the team's progress, merged into the saved XP ledger for this Jira site. */
app.get('/api/board', async (_req, res) => {
  const board = await store.getBoard();
  if (!jira) {
    const result = withProgress(board, demoLedger);
    demoLedger = result.ledger;
    res.json(result.board);
    return;
  }
  const saved = readLedger(LEDGER_PATH, jira.baseUrl);
  const result = withProgress(board, saved);
  if (result.ledger !== saved) saveLedger(LEDGER_PATH, jira.baseUrl, result.ledger);
  res.json(result.board);
});

app.post('/api/quests/:key/complete', async (req, res) => {
  await store.completeQuest(req.params.key);
  res.json({ ok: true });
});

app.put('/api/quests/:key/assignee', async (req, res) => {
  const { accountId } = req.body ?? {};
  if (accountId !== null && typeof accountId !== 'string') throw new StoreError(400, 'accountId must be a string or null');
  await store.assignQuest(req.params.key, accountId);
  res.json({ ok: true });
});

app.post('/api/quests', async (req, res) => {
  const { summary, assigneeId = null, description = '' } = req.body ?? {};
  if (typeof summary !== 'string' || !summary.trim()) throw new StoreError(400, 'summary is required');
  if (assigneeId !== null && typeof assigneeId !== 'string') throw new StoreError(400, 'assigneeId must be a string or null');
  if (typeof description !== 'string') throw new StoreError(400, 'description must be a string');
  res.status(201).json(await store.createQuest(summary.trim(), assigneeId, description));
});

/** Named JQL queries the board can switch between, plus the one running now. */
app.get('/api/views', (_req, res) => {
  res.json({ views: jira ? readViews(VIEWS_PATH, jira.baseUrl) : [], jql: jira?.jql ?? '' });
});

/**
 * Replaces this site's saved views, and optionally switches the board to one of them. Switching rewrites
 * JIRA_JQL and swaps the store in place, the same as saving a connection does.
 */
app.put('/api/views', (req, res) => {
  if (!jira) throw new StoreError(400, 'Connect Jira before saving views');
  const { views, jql } = req.body ?? {};
  const saved = parseViews(views);
  saveViews(VIEWS_PATH, jira.baseUrl, saved);

  if (jql !== undefined) {
    if (typeof jql !== 'string' || !jql.trim()) throw new StoreError(400, 'jql must be a non-empty string');
    updateEnvFile(ENV_PATH, { JIRA_JQL: jql.trim() });
    process.env.JIRA_JQL = jql.trim();
    jira = jiraConfigFromEnv();
    store = jira ? createJiraStore(jira) : createMockStore();
  }
  res.json({ views: saved, jql: jira?.jql ?? '' });
});

/** The saved XP history for this board: what the recap and the personal trends are drawn from. */
app.get('/api/history', (_req, res) => {
  res.json(jira ? readLedger(LEDGER_PATH, jira.baseUrl) : demoLedger);
});

app.get('/api/me/counts', async (_req, res) => {
  res.json(await store.getMyCounts());
});

app.get('/api/me/quests', async (req, res) => {
  res.json(await store.getMyQuests(parseMyQuestQuery(req.query)));
});

app.get('/api/quests/:key/transitions', async (req, res) => {
  res.json(await store.getTransitions(req.params.key));
});

app.post('/api/quests/:key/transitions', async (req, res) => {
  const { transitionId } = req.body ?? {};
  if (typeof transitionId !== 'string' || !transitionId) throw new StoreError(400, 'transitionId is required');
  await store.transitionQuest(req.params.key, transitionId);
  res.json({ ok: true });
});

app.get('/api/quests/:key/comments', async (req, res) => {
  res.json(await store.getComments(req.params.key));
});

app.post('/api/quests/:key/comments', async (req, res) => {
  const body = parseCommentBody(req.body?.body);
  res.status(201).json(await store.addComment(req.params.key, body));
});

app.get('/api/setup', (_req, res) => {
  const env = process.env;
  const info: SetupInfo = {
    live: jira !== null,
    baseUrl: env.JIRA_BASE_URL ?? '',
    email: env.JIRA_EMAIL ?? '',
    jql: env.JIRA_JQL ?? '',
    projectKey: env.JIRA_PROJECT_KEY ?? '',
    hasToken: Boolean(env.JIRA_API_TOKEN),
  };
  res.json(info);
});

app.post('/api/setup', async (req, res) => {
  const setup = parseSetupInput(req.body, process.env.JIRA_API_TOKEN || null, allowedHostsFrom(process.env.JIRA_ALLOWED_HOSTS));
  const result = await verifyJiraSetup(setup);

  const values = {
    JIRA_BASE_URL: setup.baseUrl,
    JIRA_EMAIL: setup.email,
    JIRA_API_TOKEN: setup.token,
    JIRA_JQL: setup.jql,
    JIRA_PROJECT_KEY: setup.projectKey ?? '',
  };
  updateEnvFile(ENV_PATH, values);
  Object.assign(process.env, values);
  jira = jiraConfigFromEnv();
  store = jira ? createJiraStore(jira) : createMockStore();
  console.log(`JiraPlay connected to Jira: ${setup.baseUrl} as ${result.name}`);
  res.json(result);
});

const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  if (!(err instanceof StoreError) || err.status >= 500) console.error(err);
  res.status(err instanceof StoreError ? err.status : 500).json({ error: err instanceof Error ? err.message : 'Unexpected error' });
};
app.use(onError);

// Only reachable from this computer: the web app uses one saved token for every change.
app.listen(PORT, '127.0.0.1', (error?: Error) => {
  // Express 5 calls back with the error when the port can't be used, e.g. another copy is already running.
  if (error) {
    console.error(`JiraPlay API couldn't start on port ${PORT}: ${error.message}`);
    process.exit(1);
  }
  console.log(`JiraPlay API on http://127.0.0.1:${PORT} (${jira ? `Jira: ${jira.baseUrl}` : 'demo data'})`);
});
