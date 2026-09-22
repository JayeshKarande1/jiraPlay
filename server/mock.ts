import type { Hero, Quest, QuestComment, QuestKind, QuestStage, Sprint } from '../shared/types';
import { isOverdue } from '../shared/xp';
import { StoreError, type QuestStore } from './store';

const HEROES: Hero[] = [
  { id: 'anya', name: 'Anya Petrova', avatarUrl: null },
  { id: 'ravi', name: 'Ravi Menon', avatarUrl: null },
  { id: 'mei', name: 'Mei Tanaka', avatarUrl: null },
  { id: 'lucas', name: 'Lucas Ferreira', avatarUrl: null },
  { id: 'sam', name: 'Sam Okafor', avatarUrl: null },
];

type Seed = [assigneeId: string | null, kind: QuestKind, summary: string, points: number | null, priority: string, done: boolean, dueInDays: number | null];

const SEEDS: Seed[] = [
  ['anya', 'story', 'Build the login flow with magic links', 5, 'High', false, 2],
  ['anya', 'task', 'Write integration tests for checkout', 3, 'Medium', false, 0],
  ['anya', 'bug', 'Session expires after 5 minutes', 2, 'Highest', false, -1],
  ['anya', 'task', "Review Ravi's caching PR", 1, 'Low', true, null],
  ['anya', 'story', 'Password reset emails', 5, 'Medium', true, null],
  ['anya', 'story', 'Onboarding checklist', 8, 'Medium', true, null],
  ['ravi', 'bug', 'API returns 500 on empty cart', 3, 'Highest', false, -2],
  ['ravi', 'task', 'Add Redis caching to product search', 5, 'High', false, 4],
  ['ravi', 'epic', 'Payments v2', 13, 'High', false, 21],
  ['ravi', 'subtask', 'Rotate API keys', 1, 'Medium', true, null],
  ['mei', 'task', 'Deploy staging to the new cluster', 3, 'High', true, null],
  ['mei', 'story', 'Dark mode for the dashboard', 5, 'Medium', true, null],
  ['mei', 'task', 'Document the release process', 2, 'Low', false, 6],
  ['mei', 'story', 'Export reports as CSV', 3, 'Medium', true, null],
  ['mei', 'bug', 'Chart tooltip clipped on Safari', 1, 'Low', true, null],
  ['mei', 'story', 'Team activity feed', 8, 'High', false, 9],
  ['lucas', 'story', 'Push notifications for mobile', 8, 'High', false, 5],
  ['lucas', 'bug', 'Android keyboard covers the input', 2, 'High', false, 1],
  ['lucas', 'task', 'Upgrade React Native', 3, 'Medium', true, null],
  ['sam', 'task', 'Set up error monitoring alerts', 2, 'Medium', false, 3],
  ['sam', 'story', 'Accessibility audit fixes', 5, 'Medium', false, -3],
  ['sam', 'subtask', 'Clean up old feature flags', null, 'Lowest', false, null],
  [null, 'bug', 'Typo on the pricing page', 1, 'Low', false, null],
  [null, 'story', 'Referral program landing page', 5, 'Medium', false, 14],
  [null, 'task', 'Evaluate a new logging vendor', 3, 'Low', false, null],
];

/** Finished issues from earlier sprints for the demo user, so "All my issues" shows more than the board. */
const ARCHIVE_SEEDS: [kind: QuestKind, summary: string, points: number | null][] = [
  ['story', 'Signup form validation', 3],
  ['bug', 'Avatar upload fails for PNG files', 2],
  ['task', 'Move auth tokens to HttpOnly cookies', 5],
  ['story', 'Remember me on login', 2],
  ['task', 'Rate limit the login endpoint', 3],
  ['bug', 'Password reset link opens a blank page', 1],
];

const MOCK_PAGE = 50;

/** The demo workflow: any status can move to any other. */
const STATUSES: { name: string; stage: QuestStage }[] = [
  { name: 'To Do', stage: 'todo' },
  { name: 'In Progress', stage: 'doing' },
  { name: 'In Review', stage: 'doing' },
  { name: 'Done', stage: 'done' },
];

/** Demo comments as [index into SEEDS, hero id, minutes ago, text]. */
const COMMENT_SEEDS: [issue: number, heroId: string, minutesAgo: number, body: string][] = [
  [0, 'ravi', 60 * 26, 'Magic links should expire after 15 minutes. Can we make that configurable?'],
  [0, 'anya', 60 * 20, 'Yes, there is an env var for it now. PR is up for review.'],
  [2, 'sam', 90, 'I can only reproduce this on Safari. The refresh token cookie looks like it is SameSite=Strict.'],
  [6, 'mei', 60 * 5, 'The cart service returns null instead of an empty list when the cart is empty.'],
  [8, 'lucas', 60 * 48, 'Blocked until we get the payment provider sandbox keys.'],
];

/** A timestamp `days` days ago, a couple of hours before now. */
const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000 - 2 * 3_600_000).toISOString();

function isoDateFromToday(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function createMockStore(): QuestStore {
  const sprint: Sprint = {
    id: 7,
    name: 'Sprint 7: Dragon Season',
    goal: 'Ship magic-link login and squash the checkout bugs',
    startDate: `${isoDateFromToday(-9)}T09:00:00.000Z`,
    endDate: `${isoDateFromToday(5)}T18:00:00.000Z`,
  };

  // Each hero's finished issues are spread over the last few days, one a day, so the demo shows streaks.
  const finishedSoFar = new Map<string | null, number>();
  const quests: Quest[] = SEEDS.map(([assigneeId, kind, summary, points, priority, done, due], i) => {
    const nth = finishedSoFar.get(assigneeId) ?? 0;
    if (done) finishedSoFar.set(assigneeId, nth + 1);
    return {
    key: `FUN-${101 + i}`,
    summary,
    kind,
    status: done ? 'Done' : i % 2 ? 'In Progress' : 'To Do',
    // Demo status ids are the status names.
    statusId: done ? 'Done' : i % 2 ? 'In Progress' : 'To Do',
    stage: done ? 'done' : i % 2 ? 'doing' : 'todo',
    done,
    points,
    priority,
    dueDate: due === null ? null : isoDateFromToday(due),
    description: `Demo issue. Connect Jira to see your team's real issues here.`,
    url: null,
    assigneeId,
    resolvedAt: done ? isoDaysAgo(nth) : null,
    };
  });
  let nextNumber = 101 + quests.length;

  const comments = new Map<string, QuestComment[]>();
  COMMENT_SEEDS.forEach(([issue, heroId, minutesAgo, body], i) => {
    const key = quests[issue].key;
    comments.set(key, [
      ...(comments.get(key) ?? []),
      {
        id: `demo-${i}`,
        authorName: HEROES.find((h) => h.id === heroId)?.name ?? heroId,
        authorAvatarUrl: null,
        body,
        created: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
      },
    ]);
  });
  let nextCommentId = COMMENT_SEEDS.length;

  /** The demo user, who is also `me` on the board. */
  const me = HEROES[0].id;
  const archive: Quest[] = ARCHIVE_SEEDS.map(([kind, summary, points], i) => ({
    key: `FUN-${90 + i}`,
    summary,
    kind,
    status: 'Done',
    statusId: 'Done',
    stage: 'done',
    done: true,
    points,
    priority: 'Medium',
    dueDate: null,
    description: 'Demo issue from an earlier sprint.',
    url: null,
    assigneeId: me,
    resolvedAt: isoDaysAgo(20 + i),
  }));

  const find = (key: string) => {
    const quest = quests.find((q) => q.key === key) ?? archive.find((q) => q.key === key);
    if (!quest) throw new StoreError(404, `Issue ${key} not found`);
    return quest;
  };

  return {
    async getBoard() {
      // The demo plays as the first hero, so the profile has something to show.
      return {
        source: 'mock',
        columns: STATUSES.map((s) => ({ name: s.name, statusIds: [s.name], stage: s.stage })),
        boardName: 'Demo board',
        truncatedAt: null,
        sprints: [sprint],
        heroes: HEROES,
        quests: structuredClone(quests),
        me: HEROES[0],
        progress: {},
      };
    },

    async completeQuest(key) {
      const quest = find(key);
      quest.done = true;
      quest.stage = 'done';
      quest.status = 'Done';
      quest.statusId = 'Done';
      quest.resolvedAt ??= new Date().toISOString();
    },

    async assignQuest(key, accountId) {
      if (accountId !== null && !HEROES.some((h) => h.id === accountId)) {
        throw new StoreError(400, `Unknown hero ${accountId}`);
      }
      find(key).assigneeId = accountId;
    },

    async createQuest(summary, assigneeId, description = '') {
      const quest: Quest = {
        key: `FUN-${nextNumber++}`,
        summary,
        kind: 'task',
        status: 'To Do',
        statusId: 'To Do',
        stage: 'todo',
        done: false,
        points: null,
        priority: 'Medium',
        dueDate: null,
        description,
        url: null,
        assigneeId,
        resolvedAt: null,
      };
      quests.push(quest);
      return structuredClone(quest);
    },

    async getComments(key) {
      find(key);
      const list = comments.get(key) ?? [];
      return { comments: structuredClone(list), total: list.length };
    },

    async addComment(key, body) {
      find(key);
      const comment: QuestComment = {
        id: `demo-${nextCommentId++}`,
        authorName: 'You (demo)',
        authorAvatarUrl: null,
        body,
        created: new Date().toISOString(),
      };
      comments.set(key, [...(comments.get(key) ?? []), comment]);
      return structuredClone(comment);
    },

    async getTransitions(key) {
      const quest = find(key);
      return STATUSES.filter((s) => s.name !== quest.status).map((s) => ({ id: s.name, name: s.name, toStatus: s.name, toStatusId: s.name, toStage: s.stage }));
    },

    async transitionQuest(key, transitionId) {
      const status = STATUSES.find((s) => s.name === transitionId);
      if (!status) throw new StoreError(400, `Unknown transition ${transitionId}`);
      const quest = find(key);
      const done = status.stage === 'done';
      Object.assign(quest, {
        status: status.name,
        statusId: status.name,
        stage: status.stage,
        done,
        resolvedAt: done ? (quest.resolvedAt ?? new Date().toISOString()) : null,
      });
    },

    async getMyCounts() {
      const mine = [...quests, ...archive].filter((q) => q.assigneeId === me);
      const inStage = (stage: QuestStage) => mine.filter((q) => q.stage === stage).length;
      return { total: mine.length, todo: inStage('todo'), doing: inStage('doing'), done: inStage('done'), overdue: mine.filter(isOverdue).length };
    },

    async getMyQuests({ stage, search, cursor }) {
      const text = search.toLowerCase();
      const matches = [...quests, ...archive].filter(
        (q) =>
          q.assigneeId === me &&
          (stage === 'all' || q.stage === stage) &&
          (!text || q.summary.toLowerCase().includes(text) || q.key.toLowerCase() === text),
      );
      const start = Number(cursor ?? 0) || 0;
      const end = start + MOCK_PAGE;
      return { quests: structuredClone(matches.slice(start, end)), cursor: end < matches.length ? String(end) : null };
    },
  };
}
