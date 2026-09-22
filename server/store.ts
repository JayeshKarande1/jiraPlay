import type { Board, CommentPage, MyIssueCounts, MyQuestQuery, Quest, QuestComment, QuestPage, QuestTransition, StageFilter } from '../shared/types';

/** How long a finished Jira board load is shared between callers. */
export const BOARD_CACHE_MS = 5000;

export class StoreError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface QuestStore {
  getBoard(): Promise<Board>;
  completeQuest(key: string): Promise<void>;
  assignQuest(key: string, accountId: string | null): Promise<void>;
  /** `description` is plain text; the Jira store converts it to ADF. */
  createQuest(summary: string, assigneeId: string | null, description?: string): Promise<Quest>;
  /** The latest comments on an issue, oldest first. */
  getComments(key: string): Promise<CommentPage>;
  addComment(key: string, body: string): Promise<QuestComment>;
  /** The status changes available from the issue's current status. */
  getTransitions(key: string): Promise<QuestTransition[]>;
  transitionQuest(key: string, transitionId: string): Promise<void>;
  /** Counts of everything assigned to the signed-in user in Jira. */
  getMyCounts(): Promise<MyIssueCounts>;
  /** One page of the signed-in user's issues across Jira, most recently updated first. */
  getMyQuests(query: MyQuestQuery): Promise<QuestPage>;
}

/**
 * Shares one board load between callers for `ttlMs` after it finishes: several browser tabs, or the VS Code status
 * bar and the board, polling at once cost Jira one set of requests. A load in progress is always shared. Failures
 * aren't kept, and any write clears the cache so the next load shows it.
 */
export function withBoardCache(store: QuestStore, ttlMs: number, now: () => number = Date.now): QuestStore {
  let cached: { finishedAt: number; board: Promise<Board> } | undefined;

  const clearing =
    <A extends unknown[], R>(write: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        return await write(...args);
      } finally {
        cached = undefined;
      }
    };

  return {
    ...store,
    getBoard() {
      if (!cached || now() - cached.finishedAt > ttlMs) {
        const entry = { finishedAt: Infinity, board: store.getBoard() };
        entry.board.then(
          () => {
            entry.finishedAt = now();
          },
          () => {
            if (cached === entry) cached = undefined;
          },
        );
        cached = entry;
      }
      return cached.board;
    },
    completeQuest: clearing((key) => store.completeQuest(key)),
    assignQuest: clearing((key, accountId) => store.assignQuest(key, accountId)),
    createQuest: clearing((summary, assigneeId, description) => store.createQuest(summary, assigneeId, description)),
    transitionQuest: clearing((key, transitionId) => store.transitionQuest(key, transitionId)),
  };
}

export { COMMENT_MAX_LENGTH } from '../shared/limits';
import { COMMENT_MAX_LENGTH } from '../shared/limits';

export function parseCommentBody(value: unknown): string {
  const body = typeof value === 'string' ? value.trim() : '';
  if (!body) throw new StoreError(400, 'Write a comment first');
  if (body.length > COMMENT_MAX_LENGTH) throw new StoreError(400, `Comments can be at most ${COMMENT_MAX_LENGTH} characters`);
  return body;
}

const STAGE_FILTERS: StageFilter[] = ['all', 'todo', 'doing', 'done'];

/** Reads a MyQuestQuery from a request, falling back to the first page of everything. */
export function parseMyQuestQuery(value: unknown): MyQuestQuery {
  const fields = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const stage = STAGE_FILTERS.find((s) => s === fields.stage) ?? 'all';
  const search = typeof fields.search === 'string' ? fields.search.trim().slice(0, 200) : '';
  const cursor = typeof fields.cursor === 'string' && fields.cursor ? fields.cursor : null;
  return { stage, search, cursor };
}
