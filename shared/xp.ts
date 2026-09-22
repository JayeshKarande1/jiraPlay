import type { Quest } from './types';

export const MAX_STARS = 5;

/** Story points to stars: the first rule whose limit covers the points wins; anything larger gets MAX_STARS. */
export const POINT_STARS: { upTo: number; stars: number }[] = [
  { upTo: 1, stars: 1 },
  { upTo: 2, stars: 2 },
  { upTo: 3, stars: 3 },
  { upTo: 5, stars: 4 },
];

/** Used when an issue has no story points. */
export const PRIORITY_STARS: { priority: string; stars: number }[] = [
  { priority: 'Highest', stars: 5 },
  { priority: 'High', stars: 4 },
  { priority: 'Medium', stars: 3 },
  { priority: 'Low', stars: 2 },
  { priority: 'Lowest', stars: 1 },
];

/** For issues with neither story points nor a known priority. */
export const DEFAULT_STARS = 2;

export function pointsRule(points: number) {
  return POINT_STARS.find((rule) => points <= rule.upTo);
}

export function priorityRule(priority: string | null) {
  return PRIORITY_STARS.find((rule) => rule.priority.toLowerCase() === priority?.toLowerCase());
}

/** Difficulty from 1 to 5 stars, based on story points, or priority when there are no points. */
export function questStars(quest: Quest): number {
  if (quest.points !== null) return pointsRule(quest.points)?.stars ?? MAX_STARS;
  return priorityRule(quest.priority)?.stars ?? DEFAULT_STARS;
}

/** Where an issue's stars come from, e.g. "from priority Medium". */
export function difficultySource(quest: Quest): string {
  if (quest.points !== null) return `from ${quest.points} story points`;
  return quest.priority ? `from priority ${quest.priority}` : 'no story points or priority';
}

export function questXp(quest: Quest): number {
  return quest.points ? quest.points * 10 : 10;
}

const xpForLevel = (level: number) => 10 * (level - 1) ** 2;

/** XP from the finished issues in a list. */
export function doneXp(quests: Quest[]): number {
  return quests.filter((q) => q.done).reduce((sum, q) => sum + questXp(q), 0);
}

/** Level, progress through it and XP still needed, for an XP total. */
export function levelStats(xp: number) {
  const level = Math.floor(Math.sqrt(xp / 10)) + 1;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { xp, level, progress: (xp - floor) / (next - floor), toNext: next - xp };
}

/** Stats from a list of issues alone. `xp` overrides the XP, e.g. with the all-time total from the ledger. */
export function heroStats(quests: Quest[], xp = doneXp(quests)) {
  return { ...levelStats(xp), overdue: quests.filter(isOverdue).length };
}

export type HeroStats = ReturnType<typeof heroStats>;

const pad = (n: number) => String(n).padStart(2, '0');

export function dueInDays(dueDate: string): number {
  const [y, m, d] = dueDate.split('-').map(Number);
  const now = new Date();
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000);
}

/** Whole days from today until an ISO timestamp, in local time. */
export function daysUntil(iso: string): number {
  const d = new Date(iso);
  return dueInDays(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
}

export function dueLabel(days: number): string {
  if (days < 0) return `${-days}d late`;
  if (days === 0) return 'today';
  return `${days}d`;
}

export function isOverdue(quest: Quest): boolean {
  return !quest.done && quest.dueDate !== null && dueInDays(quest.dueDate) < 0;
}

/** Overdue first, then hardest first. */
export function byUrgency(a: Quest, b: Quest): number {
  return Number(isOverdue(b)) - Number(isOverdue(a)) || questStars(b) - questStars(a);
}
