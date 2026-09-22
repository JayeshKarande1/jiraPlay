import { earnedAchievements } from './achievements';
import { currentStreak, localDay, longestStreak } from './days';
import { earnedClassSlot } from './heroes';
import { shallowEqual } from './identity';
import type { Board, Hero, HeroProgress, Quest, XpEntry } from './types';
import { questXp } from './xp';

/** Oldest entries are dropped past this, which is years of work for a team. */
export const LEDGER_MAX_ENTRIES = 5000;
/** Without an active sprint, "this sprint" means the last two weeks. */
const DEFAULT_SPRINT_DAYS = 14;

/**
 * Brings the XP ledger up to date with the board. Every finished, assigned issue gets an entry, credited to its
 * assignee when Jira resolved it. The ledger keeps entries after issues leave the board (the sprint ends, the JQL
 * changes), so XP isn't lost; an issue that's reopened loses its entry, so XP can be. Returns the same array when
 * nothing changed, so hosts only save real changes.
 */
export function mergeLedger(ledger: XpEntry[], quests: Quest[], heroes: Hero[], now: Date = new Date()): XpEntry[] {
  const names = new Map(heroes.map((h) => [h.id, h.name]));
  const byKey = new Map(ledger.map((e) => [e.key, e]));
  let changed = false;

  for (const quest of quests) {
    const entry = byKey.get(quest.key);
    if (!quest.done) {
      if (entry) {
        byKey.delete(quest.key);
        changed = true;
      }
      continue;
    }
    // A finished issue that's later unassigned keeps its credit.
    if (!quest.assigneeId) continue;
    const next: XpEntry = {
      key: quest.key,
      heroId: quest.assigneeId,
      heroName: names.get(quest.assigneeId) ?? entry?.heroName ?? 'Unknown',
      xp: questXp(quest),
      kind: quest.kind,
      points: quest.points,
      due: quest.dueDate,
      at: quest.resolvedAt ?? entry?.at ?? now.toISOString(),
    };
    if (!entry || !shallowEqual(entry, next)) {
      byKey.set(quest.key, next);
      changed = true;
    }
  }

  if (!changed) return ledger;
  return [...byKey.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-LEDGER_MAX_ENTRIES);
}

/** Each hero's totals, streaks, achievements and earned class, from the ledger. */
export function computeProgress(ledger: XpEntry[], sprintStart: string | null, now: Date = new Date()): Record<string, HeroProgress> {
  const since = sprintStart ? Date.parse(sprintStart) : now.getTime() - DEFAULT_SPRINT_DAYS * 86_400_000;
  const byHero = new Map<string, XpEntry[]>();
  for (const entry of ledger) {
    const forHero = byHero.get(entry.heroId);
    if (forHero) forHero.push(entry);
    else byHero.set(entry.heroId, [entry]);
  }

  const progress: Record<string, HeroProgress> = {};
  for (const [heroId, entries] of byHero) {
    const days = new Set(entries.map((e) => localDay(e.at)));
    const bestStreak = longestStreak(days);
    progress[heroId] = {
      heroId,
      heroName: entries[entries.length - 1].heroName,
      xp: entries.reduce((sum, e) => sum + e.xp, 0),
      sprintXp: entries.filter((e) => Date.parse(e.at) >= since).reduce((sum, e) => sum + e.xp, 0),
      completed: entries.length,
      streak: currentStreak(days, now),
      bestStreak,
      achievements: earnedAchievements(entries, bestStreak).map((a) => a.id),
      classSlot: earnedClassSlot(entries),
    };
  }
  return progress;
}

/** Merges a board into a host's saved ledger and adds everyone's progress to the board. */
export function withProgress(board: Board, saved: XpEntry[], now: Date = new Date()): { board: Board; ledger: XpEntry[] } {
  const ledger = mergeLedger(saved, board.quests, board.heroes, now);
  return { board: { ...board, progress: computeProgress(ledger, board.sprints[0]?.startDate ?? null, now) }, ledger };
}

/** Heroes ranked by XP this sprint, then by issues finished. */
export function standings(progress: Record<string, HeroProgress>): HeroProgress[] {
  return Object.values(progress)
    .filter((p) => p.sprintXp > 0)
    .sort((a, b) => b.sprintXp - a.sprintXp || b.completed - a.completed || a.heroName.localeCompare(b.heroName));
}
