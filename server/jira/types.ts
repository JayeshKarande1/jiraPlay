import type { QuestStage } from '../../shared/types';

/**
 * The shapes Jira's REST API returns. They are assertions over parsed JSON, not validated types:
 * a change on Jira's side surfaces here first.
 */


export interface JiraUser {
  accountId: string;
  displayName: string;
  avatarUrls?: Record<string, string>;
}

export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: { id: string; name: string; statusCategory: { key: string } };
    issuetype: { name: string; subtask: boolean };
    assignee: JiraUser | null;
    priority: { name: string } | null;
    duedate: string | null;
    resolutiondate?: string | null;
    description: unknown;
    [field: string]: unknown;
  };
}

export interface JiraTransition {
  id: string;
  name: string;
  to: { id: string; name: string; statusCategory: { key: string } };
  /** The transition screen's fields, when requested with expand=transitions.fields. */
  fields?: Record<string, { required?: boolean; hasDefaultValue?: boolean }>;
}

/** An entry from GET /rest/api/3/field. */
export interface JiraFieldInfo {
  id: string;
  name: string;
  schema?: { type?: string; custom?: string };
}

/** The custom field ids a site uses for story points and sprints. */
export interface FieldIds {
  /** Most likely first; an issue's points come from the first one that has a number. */
  points: string[];
  sprint: string | null;
}

/** Jira Cloud's usual ids, used when the site's field list can't be read. */
export const DEFAULT_FIELDS: FieldIds = { points: ['customfield_10016'], sprint: 'customfield_10020' };

/** The board stops loading issues here and says so. */
export const MAX_BOARD_ISSUES = 1000;
export const REQUEST_TIMEOUT_MS = 20_000;
/** Retries after the first attempt, for rate limits and dropped connections. */
export const MAX_RETRIES = 3;
export const MAX_BACKOFF_MS = 8000;
/** Jira can ask for long waits; past this it's better to fail and let the next poll try. */
export const MAX_RETRY_AFTER_MS = 30_000;

export interface JiraBoardSummary {
  id: number;
  name: string;
  type: string;
}

export interface JiraBoardConfig {
  name: string;
  columnConfig: { columns: { name: string; statuses: { id: string }[] }[] };
}

/** Board columns rarely change, so they're re-read at most this often. */
export const COLUMNS_TTL_MS = 10 * 60_000;
/** After failing to read the columns, try again this soon. */
export const FAILED_COLUMNS_RETRY_MS = 60_000;

export interface JiraComment {
  id: string;
  author?: JiraUser;
  body: unknown;
  created: string;
}

/** How many of the latest comments to load for an issue. */
export const COMMENT_PAGE = 50;

export interface JiraSprint {
  id: number;
  name: string;
  state: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
}

export const STAGE_BY_CATEGORY: Record<string, QuestStage> = { new: 'todo', indeterminate: 'doing', done: 'done' };
