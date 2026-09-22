import type { Quest } from './types';

/**
 * A local change to one issue that the board shows before Jira confirms it. The UI keeps edits on top of the last
 * board from the server instead of changing that board, so a failed write rolls back by dropping its edit, and a
 * poll that answers mid-write can't undo what the user sees.
 */
export interface PendingEdit {
  id: number;
  key: string;
  patch: Partial<Quest>;
  /** When the server confirmed the write, or null while it's still in flight (or waiting to be sent). */
  settledAt: number | null;
}

/** An issue created from the board, shown until the board query returns it. */
export interface PendingCreate {
  quest: Quest;
  settledAt: number;
}

export function applyEditsTo(quest: Quest, edits: PendingEdit[]): Quest {
  let result = quest;
  for (const edit of edits) if (edit.key === quest.key) result = { ...result, ...edit.patch };
  return result;
}

export function applyEdits(quests: Quest[], edits: PendingEdit[]): Quest[] {
  if (edits.length === 0) return quests;
  const keys = new Set(edits.map((e) => e.key));
  return quests.map((q) => (keys.has(q.key) ? applyEditsTo(q, edits) : q));
}

/**
 * Whether the server's copy of an issue already shows a patch. An empty statusId means "some status in that
 * category", so the status fields aren't compared then.
 */
export function showsPatch(quest: Quest, patch: Partial<Quest>): boolean {
  const anyStatus = patch.statusId === '';
  return (Object.keys(patch) as (keyof Quest)[]).every((field) => {
    if (anyStatus && (field === 'statusId' || field === 'status')) return true;
    return quest[field] === patch[field];
  });
}

/**
 * Drops the edits a board fetched at `fetchStartedAt` makes unnecessary: confirmed edits the board already shows,
 * and confirmed edits older than `maxLagMs`, by which time Jira's search index has caught up and the board is right.
 */
export function pruneEdits(edits: PendingEdit[], serverQuests: Quest[], fetchStartedAt: number, maxLagMs: number): PendingEdit[] {
  if (edits.length === 0) return edits;
  const byKey = new Map(serverQuests.map((q) => [q.key, q]));
  const kept = edits.filter((e) => {
    // Still in flight, or the fetch began before Jira had the change: the board can't know about it yet.
    if (e.settledAt === null || fetchStartedAt < e.settledAt) return true;
    if (e.settledAt + maxLagMs <= fetchStartedAt) return false;
    const quest = byKey.get(e.key);
    return !quest || !showsPatch(quest, e.patch);
  });
  return kept.length === edits.length ? edits : kept;
}

/** Keeps created issues the board doesn't have yet, until they're old enough that the query should have found them. */
export function pruneCreated(created: PendingCreate[], boardKeys: Set<string>, fetchStartedAt: number, maxLagMs: number): PendingCreate[] {
  const kept = created.filter((c) => !boardKeys.has(c.quest.key) && c.settledAt + maxLagMs > fetchStartedAt);
  return kept.length === created.length ? created : kept;
}
