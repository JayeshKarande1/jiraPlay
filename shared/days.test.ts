import { describe, expect, it } from 'vitest';
import { currentStreak, dayKey, longestStreak } from './days';

// 2026-09-14 is a Monday.
const monday = new Date(2026, 8, 14, 15);
const days = (...keys: string[]) => new Set(keys);

describe('currentStreak', () => {
  it('counts back from today', () => {
    expect(currentStreak(days('2026-09-14', '2026-09-11', '2026-09-10'), monday)).toBe(3);
  });

  it("doesn't break before today is over", () => {
    expect(currentStreak(days('2026-09-11', '2026-09-10'), monday)).toBe(2);
  });

  it('skips weekends without work, and counts weekend work', () => {
    expect(currentStreak(days('2026-09-14', '2026-09-13', '2026-09-11'), monday)).toBe(3);
  });

  it('breaks on a weekday without work', () => {
    expect(currentStreak(days('2026-09-14', '2026-09-10'), monday)).toBe(1);
    expect(currentStreak(days('2026-09-09'), monday)).toBe(0);
    expect(currentStreak(days(), monday)).toBe(0);
  });
});

describe('longestStreak', () => {
  it('finds the longest run, bridging weekends', () => {
    expect(longestStreak(days('2026-09-01', '2026-09-02', '2026-09-03', '2026-09-10', '2026-09-11', '2026-09-14', '2026-09-15'))).toBe(4);
    expect(longestStreak(days())).toBe(0);
  });
});

describe('dayKey', () => {
  it('uses local time', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
