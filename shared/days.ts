/** Calendar-day helpers for streaks, in the viewer's local time. */

const pad = (n: number) => String(n).padStart(2, '0');

/** The local YYYY-MM-DD of a moment. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The local YYYY-MM-DD of an ISO timestamp. */
export const localDay = (iso: string) => dayKey(new Date(iso));

/** Noon on a YYYY-MM-DD day, so stepping by days never trips over daylight saving changes. */
function noonOf(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

/**
 * How many days in a row, up to today, have at least one day in `days`. Weekends without work don't break a
 * streak (weekend work still counts), and today doesn't break it until it's over.
 */
export function currentStreak(days: Set<string>, now: Date = new Date()): number {
  if (days.size === 0) return 0;
  const earliest = [...days].sort()[0];
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (dayKey(cursor) >= earliest) {
    if (days.has(dayKey(cursor))) streak++;
    else if (!isWeekend(cursor)) break;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** The longest run of days in `days`, with the same weekend rule as currentStreak. */
export function longestStreak(days: Set<string>): number {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const day of sorted) {
    const date = noonOf(day);
    if (previous && brokenBetween(previous, date)) run = 0;
    run++;
    best = Math.max(best, run);
    previous = date;
  }
  return best;
}

/** Whether a weekday without work lies strictly between two days. */
function brokenBetween(from: Date, to: Date): boolean {
  const gap = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  // More than a weekend's worth of days always includes a weekday.
  if (gap > 3) return true;
  const cursor = new Date(from);
  for (let i = 1; i < gap; i++) {
    cursor.setDate(cursor.getDate() + 1);
    if (!isWeekend(cursor)) return true;
  }
  return false;
}
