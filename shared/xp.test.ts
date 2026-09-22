import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeQuest } from './testing';
import { byUrgency, dueInDays, dueLabel, heroStats, isOverdue, questStars, questXp } from './xp';

describe('questXp', () => {
  it('gives 10 XP per story point', () => {
    expect(questXp(makeQuest({ points: 5 }))).toBe(50);
  });

  it('gives 10 XP when there are no points', () => {
    expect(questXp(makeQuest({ points: null }))).toBe(10);
    expect(questXp(makeQuest({ points: 0 }))).toBe(10);
  });
});

describe('heroStats', () => {
  it('starts at level 1 with no finished work', () => {
    expect(heroStats([makeQuest()])).toMatchObject({ xp: 0, level: 1, progress: 0, toNext: 10 });
  });

  it('only counts finished issues', () => {
    const quests = [makeQuest({ points: 5, done: true }), makeQuest({ points: 8, done: false })];
    expect(heroStats(quests).xp).toBe(50);
  });

  it.each([
    [10, 2],
    [39, 2],
    [40, 3],
    [90, 4],
    [160, 5],
  ])('reaches the right level at %i XP', (xp, level) => {
    expect(heroStats([makeQuest({ points: xp / 10, done: true })]).level).toBe(level);
  });

  it('reports progress within the level', () => {
    // 50 XP is level 3, which spans 40 to 90 XP.
    expect(heroStats([makeQuest({ points: 5, done: true })])).toMatchObject({ level: 3, progress: 0.2, toNext: 40 });
  });
});

describe('questStars', () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 3],
    [5, 4],
    [8, 5],
  ])('gives %i story points %i stars', (points, stars) => {
    expect(questStars(makeQuest({ points }))).toBe(stars);
  });

  it('falls back to priority, then a default', () => {
    expect(questStars(makeQuest({ priority: 'Highest' }))).toBe(5);
    expect(questStars(makeQuest({ priority: 'low' }))).toBe(2);
    expect(questStars(makeQuest({ priority: 'Something else' }))).toBe(2);
  });
});

describe('due dates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 13, 15, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts whole days from today', () => {
    expect(dueInDays('2026-09-12')).toBe(-1);
    expect(dueInDays('2026-09-13')).toBe(0);
    expect(dueInDays('2026-09-20')).toBe(7);
  });

  it('labels days for display', () => {
    expect(dueLabel(-2)).toBe('2d late');
    expect(dueLabel(0)).toBe('today');
    expect(dueLabel(3)).toBe('3d');
  });

  it('treats only open, past-due issues as overdue', () => {
    expect(isOverdue(makeQuest({ dueDate: '2026-09-12' }))).toBe(true);
    expect(isOverdue(makeQuest({ dueDate: '2026-09-13' }))).toBe(false);
    expect(isOverdue(makeQuest({ dueDate: '2026-09-12', done: true }))).toBe(false);
    expect(isOverdue(makeQuest({ dueDate: null }))).toBe(false);
  });

  it('sorts overdue issues first, then harder ones', () => {
    const overdueEasy = makeQuest({ key: 'A', dueDate: '2026-09-01', points: 1 });
    const hard = makeQuest({ key: 'B', points: 8 });
    const easy = makeQuest({ key: 'C', points: 1 });
    expect([easy, hard, overdueEasy].sort(byUrgency).map((q) => q.key)).toEqual(['A', 'B', 'C']);
  });
});
