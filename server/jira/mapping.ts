import type { BoardColumn, QuestComment, QuestKind, QuestStage, StageFilter } from '../../shared/types';
import { adfToText } from './adf';
import {
  MAX_BACKOFF_MS,
  MAX_RETRY_AFTER_MS,
  STAGE_BY_CATEGORY,
  type FieldIds,
  type JiraComment,
  type JiraFieldInfo,
  type JiraIssue,
  type JiraTransition,
} from './types';

/**
 * Turning Jira's shapes into the board's, and back. Everything here is pure: no network, no caches, no config.
 */


/** How long to wait before retry number `attempt` (0-based), honouring Retry-After as seconds or an HTTP date. */
export function retryDelayMs(attempt: number, retryAfter: string | null): number {
  const header = retryAfter?.trim();
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
    const at = Date.parse(header);
    if (!Number.isNaN(at)) return Math.min(Math.max(0, at - Date.now()), MAX_RETRY_AFTER_MS);
  }
  return Math.min(500 * 2 ** attempt, MAX_BACKOFF_MS);
}

/** Jira timestamps look like 2026-09-14T10:22:33.123+0100. Returns a standard ISO string in UTC, or null. */
export function toIsoTime(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const time = Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

export function kindOf(issueType: JiraIssue['fields']['issuetype']): QuestKind {
  if (issueType.subtask) return 'subtask';
  const name = issueType.name.toLowerCase();
  if (name.includes('bug')) return 'bug';
  if (name.includes('epic')) return 'epic';
  if (name.includes('story') || name.includes('feature')) return 'story';
  return 'task';
}

export const MY_ISSUES_JQL = 'assignee = currentUser()';
export const STAGE_JQL: Record<QuestStage, string> = {
  todo: 'statusCategory = "To Do"',
  doing: 'statusCategory = "In Progress"',
  done: 'statusCategory = Done',
};
export const ISSUE_KEY = /^[A-Z][A-Z0-9_]*-\d+$/i;
/** Page size for the profile's list of all the user's issues. */
export const MY_PAGE = 50;

/** JQL for the signed-in user's issues, optionally narrowed by status group, title words or an exact issue key. */
export function myIssuesJql(stage: StageFilter, search: string, key: string | null): string {
  const clauses = [MY_ISSUES_JQL];
  if (stage !== 'all') clauses.push(STAGE_JQL[stage]);
  // Jira's text search has its own syntax, so only letters, digits and spaces are passed through.
  const words = search.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const title = words ? `summary ~ "${words.includes(' ') ? words : `${words}*`}"` : '';
  if (title && key) clauses.push(`(${title} OR key = "${key}")`);
  else if (title) clauses.push(title);
  return `${clauses.join(' AND ')} ORDER BY updated DESC`;
}

/** The project most of the issues belong to, from their keys. */
export function mostCommonProject(issues: JiraIssue[]): string | null {
  const counts = new Map<string, number>();
  for (const { key } of issues) {
    const project = key.split('-')[0];
    counts.set(project, (counts.get(project) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** One column per status on the loaded issues, in category order. Used when there's no usable Jira board. */
export function columnsFromIssues(issues: JiraIssue[]): BoardColumn[] {
  const byId = new Map<string, BoardColumn>();
  for (const { fields } of issues) {
    const { status } = fields;
    if (!byId.has(status.id)) {
      byId.set(status.id, { name: status.name, statusIds: [status.id], stage: STAGE_BY_CATEGORY[status.statusCategory.key] ?? 'todo' });
    }
  }
  const order: QuestStage[] = ['todo', 'doing', 'done'];
  return [...byId.values()].sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
}


export function toComment(comment: JiraComment): QuestComment {
  return {
    id: comment.id,
    authorName: comment.author?.displayName ?? 'Unknown',
    authorAvatarUrl: comment.author?.avatarUrls?.['48x48'] ?? null,
    body: adfToText(comment.body).trim(),
    created: comment.created,
  };
}

/** Finds the story points and sprint fields in a site's field list. Company- and team-managed projects use different points fields. */
export function discoverFields(all: JiraFieldInfo[]): FieldIds {
  const isJswPoints = (f: JiraFieldInfo) => Boolean(f.schema?.custom?.endsWith(':jsw-story-points'));
  const points = all
    .filter((f) => isJswPoints(f) || (f.schema?.type === 'number' && /^story points?( estimate)?$/i.test(f.name.trim())))
    .sort((a, b) => Number(isJswPoints(b)) - Number(isJswPoints(a)))
    .map((f) => f.id);
  const sprint = all.find((f) => f.schema?.custom?.endsWith(':gh-sprint'))?.id ?? null;
  return { points, sprint };
}

const DONE_NAME = /^(done|closed|resolved|complete[d]?|finished)$/i;

/**
 * The best transition for "mark done": one that needs no extra fields on its screen, then one into the board's
 * last column, then one into a status called Done. Null when nothing leads to a Done-category status.
 */
export function pickDoneTransition(transitions: JiraTransition[], lastColumnStatusIds: string[] = []): JiraTransition | null {
  const needsInput = (t: JiraTransition) => Object.values(t.fields ?? {}).some((f) => f.required && !f.hasDefaultValue);
  const score = (t: JiraTransition) =>
    (needsInput(t) ? 0 : 4) + (lastColumnStatusIds.includes(t.to.id) ? 2 : 0) + (DONE_NAME.test(t.to.name.trim()) ? 1 : 0);
  const candidates = transitions.filter((t) => t.to.statusCategory.key === 'done');
  // Stable sort keeps Jira's order among equally good transitions.
  return candidates.sort((a, b) => score(b) - score(a))[0] ?? null;
}

