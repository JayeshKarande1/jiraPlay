export type QuestKind = 'story' | 'task' | 'bug' | 'epic' | 'subtask';
export type QuestStage = 'todo' | 'doing' | 'done';

export interface Quest {
  key: string;
  summary: string;
  kind: QuestKind;
  status: string;
  /** Jira status id, used to place the issue in a board column. Empty when not known yet. */
  statusId: string;
  stage: QuestStage;
  done: boolean;
  points: number | null;
  priority: string | null;
  /** YYYY-MM-DD */
  dueDate: string | null;
  description: string;
  url: string | null;
  assigneeId: string | null;
  /** When Jira resolved the issue (ISO, UTC), or null when it's open or Jira doesn't say. */
  resolvedAt: string | null;
}

/** One finished issue in a host's saved XP ledger. */
export interface XpEntry {
  key: string;
  heroId: string;
  /** Kept so standings can name heroes who are no longer on the board. */
  heroName: string;
  xp: number;
  kind: QuestKind;
  points: number | null;
  /** YYYY-MM-DD, for on-time achievements. */
  due: string | null;
  /** When it was finished (ISO, UTC). */
  at: string;
}

/** A hero's standing from the XP ledger, which remembers work after it leaves the board. */
export interface HeroProgress {
  heroId: string;
  heroName: string;
  /** All-time XP. */
  xp: number;
  /** XP since the active sprint started, or the last two weeks without one. */
  sprintXp: number;
  completed: number;
  /** Days in a row with finished work, up to today. Weekends don't break it. */
  streak: number;
  bestStreak: number;
  /** Achievement ids, in catalogue order. */
  achievements: string[];
  /** The class slot their recent work earned, or null until they've finished a few issues. */
  classSlot: number | null;
}

export interface Hero {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface Sprint {
  id: number;
  name: string;
  goal: string | null;
  /** ISO timestamps */
  startDate: string | null;
  endDate: string | null;
}

/** A column on the Jira board, which can hold several statuses. */
export interface BoardColumn {
  name: string;
  statusIds: string[];
  /** The category of the column's statuses, which decides its colour. */
  stage: QuestStage;
}

export interface Board {
  source: 'jira' | 'mock';
  /** In the Jira board's order. Falls back to the loaded issues' statuses when there's no usable board. */
  columns: BoardColumn[];
  /** The Jira board the columns come from, or null when they come from the issues' statuses. */
  boardName: string | null;
  /** Set when the JQL matched more issues than the board loads: the number it stopped at. */
  truncatedAt: number | null;
  /** Active sprints in the JQL results, most used first. */
  sprints: Sprint[];
  heroes: Hero[];
  quests: Quest[];
  /** The signed-in Jira user, when known. They may have no issues on the board. */
  me: Hero | null;
  /** By hero id. Stores return {}; the host fills it in from its saved XP ledger. */
  progress: Record<string, HeroProgress>;
}

export interface QuestComment {
  id: string;
  authorName: string;
  authorAvatarUrl: string | null;
  /** Plain text. */
  body: string;
  /** ISO timestamp */
  created: string;
}

export interface CommentPage {
  /** The latest comments, oldest first. */
  comments: QuestComment[];
  /** All comments on the issue, which can be more than were loaded. */
  total: number;
}

export type StageFilter = 'all' | QuestStage;

/** Which of the signed-in user's Jira issues to list. */
export interface MyQuestQuery {
  stage: StageFilter;
  /** Words from the title, or an issue key. */
  search: string;
  /** From the previous page; null for the first page. */
  cursor: string | null;
}

export interface QuestPage {
  quests: Quest[];
  /** Pass back to load the next page; null on the last page. */
  cursor: string | null;
}

/** Everything assigned to the signed-in user in Jira, not just the board. */
export interface MyIssueCounts {
  total: number;
  todo: number;
  doing: number;
  done: number;
  overdue: number;
}

/** A status change the issue's Jira workflow allows right now. */
export interface QuestTransition {
  id: string;
  /** The workflow's name for the move, e.g. "Start progress". */
  name: string;
  toStatus: string;
  toStatusId: string;
  toStage: QuestStage;
}

/** The saved Jira connection, used to prefill the setup guide. The API token itself is never sent back. */
export interface SetupInfo {
  live: boolean;
  baseUrl: string;
  email: string;
  jql: string;
  projectKey: string;
  hasToken: boolean;
}

export interface SetupInput {
  baseUrl: string;
  email: string;
  /** Empty keeps the saved token. */
  token: string;
  jql: string;
  projectKey: string;
}

export interface SetupResult {
  /** Display name of the Jira account. */
  name: string;
  /** False when the JQL is valid but currently matches no issues. */
  matchedIssues: boolean;
}
