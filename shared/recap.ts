import { dayKey, localDay } from './days';
import type { Quest, QuestKind, Sprint, XpEntry } from './types';
import { questXp } from './xp';

/**
 * Sprint and personal history, read entirely from the saved XP ledger. Every entry is already stamped with when
 * Jira resolved the issue, so none of this costs a Jira request.
 */

/** One day on a chart: what was finished, and the running total up to and including it. */
export interface DayPoint {
  /** Local YYYY-MM-DD. */
  day: string;
  xp: number;
  completed: number;
  /** Cumulative XP from the first day of the range. */
  total: number;
}

const DAY_MS = 86_400_000;

/** Every local day from `from` to `to` inclusive. Steps at noon so daylight saving can't drop or repeat a day. */
export function daysBetween(from: string, to: string): string[] {
  if (from > to) return [];
  const [y, m, d] = from.split('-').map(Number);
  const cursor = new Date(y, m - 1, d, 12);
  const days: string[] = [];
  // A sprint is weeks, not years; the cap stops a bad date range from spinning.
  for (let i = 0; i < 400 && dayKey(cursor) <= to; i++) {
    days.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * A point per day across the range, including days with no work — a gap in a chart's x-axis is a lie about
 * how the work was spread. `heroId` narrows it to one person.
 */
export function daySeries(ledger: XpEntry[], from: string, to: string, heroId?: string): DayPoint[] {
  const byDay = new Map<string, { xp: number; completed: number }>();
  for (const entry of ledger) {
    if (heroId && entry.heroId !== heroId) continue;
    const day = localDay(entry.at);
    if (day < from || day > to) continue;
    const bucket = byDay.get(day) ?? { xp: 0, completed: 0 };
    bucket.xp += entry.xp;
    bucket.completed += 1;
    byDay.set(day, bucket);
  }
  let total = 0;
  return daysBetween(from, to).map((day) => {
    const { xp, completed } = byDay.get(day) ?? { xp: 0, completed: 0 };
    total += xp;
    return { day, xp, completed, total };
  });
}

/** The sprint's local day range, falling back to the last `fallbackDays` when the sprint has no dates. */
export function sprintRange(sprint: Sprint | null, now: Date = new Date(), fallbackDays = 14): { from: string; to: string } {
  const start = sprint?.startDate ? localDay(sprint.startDate) : dayKey(new Date(now.getTime() - (fallbackDays - 1) * DAY_MS));
  const today = dayKey(now);
  const end = sprint?.endDate ? localDay(sprint.endDate) : today;
  // Never chart into the future: an empty tail reads as a team that stopped working.
  return { from: start, to: end < today ? end : today };
}

export interface Recap {
  from: string;
  to: string;
  series: DayPoint[];
  xp: number;
  completed: number;
  /** XP by issue kind, biggest first; only kinds with work. */
  byKind: { kind: QuestKind; xp: number; completed: number }[];
  /** Everyone who finished something, biggest first. */
  byHero: { heroId: string; heroName: string; xp: number; completed: number }[];
  /** The day with the most XP, or null when nothing was finished. */
  bestDay: DayPoint | null;
  /** Days in the range with at least one finished issue. */
  activeDays: number;
  /** Open XP still on the board, i.e. what the boss has left. Null when no board was given. */
  remainingXp: number | null;
}

/** Everything the sprint recap shows, from the ledger plus the board's still-open issues. */
export function sprintRecap(ledger: XpEntry[], sprint: Sprint | null, quests?: Quest[], now: Date = new Date()): Recap {
  const { from, to } = sprintRange(sprint, now);
  const series = daySeries(ledger, from, to);
  const inRange = ledger.filter((e) => {
    const day = localDay(e.at);
    return day >= from && day <= to;
  });

  const kinds = new Map<QuestKind, { xp: number; completed: number }>();
  const heroes = new Map<string, { heroName: string; xp: number; completed: number }>();
  for (const entry of inRange) {
    const kind = kinds.get(entry.kind) ?? { xp: 0, completed: 0 };
    kinds.set(entry.kind, { xp: kind.xp + entry.xp, completed: kind.completed + 1 });
    const hero = heroes.get(entry.heroId) ?? { heroName: entry.heroName, xp: 0, completed: 0 };
    heroes.set(entry.heroId, { heroName: entry.heroName, xp: hero.xp + entry.xp, completed: hero.completed + 1 });
  }

  const withWork = series.filter((p) => p.completed > 0);
  return {
    from,
    to,
    series,
    xp: inRange.reduce((sum, e) => sum + e.xp, 0),
    completed: inRange.length,
    byKind: [...kinds].map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.xp - a.xp),
    byHero: [...heroes].map(([heroId, v]) => ({ heroId, ...v })).sort((a, b) => b.xp - a.xp),
    bestDay: withWork.length === 0 ? null : withWork.reduce((best, p) => (p.xp > best.xp ? p : best)),
    activeDays: withWork.length,
    remainingXp: quests ? quests.filter((q) => !q.done).reduce((sum, q) => sum + questXp(q), 0) : null,
  };
}

/** One week on the personal trend: Monday's date, and what was finished that week. */
export interface WeekPoint {
  /** The local YYYY-MM-DD of that week's Monday. */
  weekStart: string;
  xp: number;
  completed: number;
}

/** The Monday of a day's week, in local time. */
export function weekStart(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  // getDay() is 0 on Sunday, which belongs to the week that began six days earlier.
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return dayKey(date);
}

/** A hero's last `weeks` weeks, oldest first, including the weeks they finished nothing. */
export function weekSeries(ledger: XpEntry[], heroId: string, weeks = 8, now: Date = new Date()): WeekPoint[] {
  const thisWeek = weekStart(dayKey(now));
  const starts: string[] = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  cursor.setDate(cursor.getDate() - (weeks - 1) * 7);
  for (let i = 0; i < weeks; i++) {
    starts.push(weekStart(dayKey(cursor)));
    cursor.setDate(cursor.getDate() + 7);
  }

  const byWeek = new Map<string, { xp: number; completed: number }>();
  for (const entry of ledger) {
    if (entry.heroId !== heroId) continue;
    const start = weekStart(localDay(entry.at));
    if (start < starts[0] || start > thisWeek) continue;
    const bucket = byWeek.get(start) ?? { xp: 0, completed: 0 };
    byWeek.set(start, { xp: bucket.xp + entry.xp, completed: bucket.completed + 1 });
  }
  return starts.map((start) => ({ weekStart: start, ...(byWeek.get(start) ?? { xp: 0, completed: 0 }) }));
}

/** How a hero's finished work splits by kind, biggest first. */
export function kindMix(ledger: XpEntry[], heroId: string): { kind: QuestKind; completed: number; xp: number }[] {
  const kinds = new Map<QuestKind, { completed: number; xp: number }>();
  for (const entry of ledger) {
    if (entry.heroId !== heroId) continue;
    const bucket = kinds.get(entry.kind) ?? { completed: 0, xp: 0 };
    kinds.set(entry.kind, { completed: bucket.completed + 1, xp: bucket.xp + entry.xp });
  }
  return [...kinds].map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.completed - a.completed);
}
