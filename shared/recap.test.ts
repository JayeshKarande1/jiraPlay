import { describe, expect, it } from 'vitest';
import { daysBetween, daySeries, kindMix, levelMilestones, personalBests, sprintRange, sprintRecap, weekSeries, weekStart } from './recap';
import { makeQuest } from './testing';
import type { QuestKind, Sprint, XpEntry } from './types';

/** Local noon, so these never drift across a timezone or a daylight-saving boundary. */
const at = (day: string) => `${new Date(`${day}T12:00:00`).toISOString()}`;
const entry = (day: string, over: Partial<XpEntry> = {}): XpEntry => ({
  key: 'A-1',
  heroId: 'a',
  heroName: 'Ada',
  xp: 10,
  kind: 'task',
  points: null,
  due: null,
  at: at(day),
  ...over,
});

const sprint = (startDate: string | null, endDate: string | null): Sprint => ({ id: 1, name: 'S1', goal: null, startDate, endDate });

describe('daysBetween', () => {
  it('includes both ends', () => {
    expect(daysBetween('2026-03-02', '2026-03-05')).toEqual(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05']);
    expect(daysBetween('2026-03-02', '2026-03-02')).toEqual(['2026-03-02']);
  });

  it('is empty when the range is backwards', () => {
    expect(daysBetween('2026-03-05', '2026-03-02')).toEqual([]);
  });

  it('crosses a month and a daylight-saving change without dropping a day', () => {
    expect(daysBetween('2026-02-27', '2026-03-02')).toHaveLength(4);
    // Spring forward in most of Europe/US falls in this window.
    expect(daysBetween('2026-03-28', '2026-03-31')).toEqual(['2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31']);
  });
});

describe('daySeries', () => {
  const ledger = [entry('2026-03-02', { xp: 30 }), entry('2026-03-02', { xp: 10, key: 'A-2' }), entry('2026-03-04', { xp: 20, key: 'A-3' })];

  it('keeps days with no work, so the chart does not lie about the gaps', () => {
    const series = daySeries(ledger, '2026-03-01', '2026-03-04');
    expect(series.map((p) => [p.day, p.xp, p.completed])).toEqual([
      ['2026-03-01', 0, 0],
      ['2026-03-02', 40, 2],
      ['2026-03-03', 0, 0],
      ['2026-03-04', 20, 1],
    ]);
  });

  it('accumulates from the start of the range', () => {
    expect(daySeries(ledger, '2026-03-01', '2026-03-04').map((p) => p.total)).toEqual([0, 40, 40, 60]);
  });

  it('ignores work outside the range', () => {
    expect(daySeries(ledger, '2026-03-03', '2026-03-04').map((p) => p.total)).toEqual([0, 20]);
  });

  it('narrows to one hero when asked', () => {
    const shared = [...ledger, entry('2026-03-03', { heroId: 'b', heroName: 'Bo', xp: 90, key: 'B-1' })];
    expect(daySeries(shared, '2026-03-01', '2026-03-04', 'a').at(-1)!.total).toBe(60);
    expect(daySeries(shared, '2026-03-01', '2026-03-04', 'b').at(-1)!.total).toBe(90);
  });
});

describe('sprintRange', () => {
  const now = new Date('2026-03-10T12:00:00');

  it('uses the sprint dates', () => {
    expect(sprintRange(sprint(at('2026-03-02'), at('2026-03-16')), now)).toEqual({ from: '2026-03-02', to: '2026-03-10' });
  });

  it('never charts into the future', () => {
    // The sprint ends in six days; charting to then would show a flat tail that reads as "the team stopped".
    expect(sprintRange(sprint(at('2026-03-02'), at('2026-03-16')), now).to).toBe('2026-03-10');
  });

  it('keeps a sprint that already ended', () => {
    expect(sprintRange(sprint(at('2026-02-16'), at('2026-03-01')), now)).toEqual({ from: '2026-02-16', to: '2026-03-01' });
  });

  it('falls back to a fortnight with no sprint', () => {
    expect(sprintRange(null, now)).toEqual({ from: '2026-02-25', to: '2026-03-10' });
  });
});

describe('sprintRecap', () => {
  const now = new Date('2026-03-06T12:00:00');
  const s = sprint(at('2026-03-02'), at('2026-03-16'));
  const ledger = [
    entry('2026-03-02', { xp: 30, kind: 'story' }),
    entry('2026-03-02', { xp: 10, kind: 'bug', key: 'A-2' }),
    entry('2026-03-05', { xp: 50, kind: 'story', key: 'A-3', heroId: 'b', heroName: 'Bo' }),
    entry('2026-02-20', { xp: 999, key: 'OLD-1' }),
  ];

  it('counts only the sprint', () => {
    const recap = sprintRecap(ledger, s, undefined, now);
    expect(recap.xp).toBe(90);
    expect(recap.completed).toBe(3);
  });

  it('ranks kinds and heroes by XP', () => {
    const recap = sprintRecap(ledger, s, undefined, now);
    expect(recap.byKind).toEqual([
      { kind: 'story', xp: 80, completed: 2 },
      { kind: 'bug', xp: 10, completed: 1 },
    ]);
    expect(recap.byHero.map((h) => [h.heroName, h.xp])).toEqual([
      ['Bo', 50],
      ['Ada', 40],
    ]);
  });

  it('finds the best day and counts only days with work', () => {
    const recap = sprintRecap(ledger, s, undefined, now);
    expect(recap.bestDay?.day).toBe('2026-03-05');
    expect(recap.activeDays).toBe(2);
  });

  it('reports nothing rather than guessing on an empty sprint', () => {
    const recap = sprintRecap([], s, undefined, now);
    expect(recap.xp).toBe(0);
    expect(recap.bestDay).toBeNull();
    expect(recap.byHero).toEqual([]);
    expect(recap.series.every((p) => p.total === 0)).toBe(true);
  });

  it('adds the open XP still on the board when given one', () => {
    expect(sprintRecap(ledger, s, undefined, now).remainingXp).toBeNull();
    const quests = [makeQuest({ points: 3 }), makeQuest({ key: 'A-9', done: true, stage: 'done', points: 5 })];
    expect(sprintRecap(ledger, s, quests, now).remainingXp).toBe(30);
  });
});

describe('weekStart', () => {
  it('is the Monday of that week', () => {
    expect(weekStart('2026-03-04')).toBe('2026-03-02'); // a Wednesday
    expect(weekStart('2026-03-02')).toBe('2026-03-02'); // the Monday itself
  });

  it('puts Sunday in the week that began six days earlier', () => {
    expect(weekStart('2026-03-08')).toBe('2026-03-02');
  });
});

describe('weekSeries', () => {
  const now = new Date('2026-03-11T12:00:00'); // a Wednesday

  it('returns the asked-for weeks, oldest first, gaps included', () => {
    const series = weekSeries([entry('2026-03-10', { xp: 40 })], 'a', 3, now);
    expect(series.map((w) => [w.weekStart, w.xp])).toEqual([
      ['2026-02-23', 0],
      ['2026-03-02', 0],
      ['2026-03-09', 40],
    ]);
  });

  it('only counts the hero asked for', () => {
    const ledger = [entry('2026-03-10', { xp: 40 }), entry('2026-03-10', { xp: 100, heroId: 'b', key: 'B-1' })];
    expect(weekSeries(ledger, 'a', 2, now).at(-1)!.xp).toBe(40);
  });

  it('drops work older than the window', () => {
    expect(weekSeries([entry('2025-01-06', { xp: 500 })], 'a', 4, now).every((w) => w.xp === 0)).toBe(true);
  });
});

describe('kindMix', () => {
  it('ranks a hero’s kinds by how many they finished', () => {
    const kinds: QuestKind[] = ['bug', 'bug', 'bug', 'story', 'task', 'task'];
    const ledger = kinds.map((kind, i) => entry('2026-03-02', { kind, key: `A-${i}` }));
    expect(kindMix(ledger, 'a').map((k) => [k.kind, k.completed])).toEqual([
      ['bug', 3],
      ['task', 2],
      ['story', 1],
    ]);
  });

  it('is empty for someone with no finished work', () => {
    expect(kindMix([entry('2026-03-02')], 'nobody')).toEqual([]);
  });
});

describe('levelMilestones', () => {
  it('lists every level reached, in order, with the issue that reached it', () => {
    // Level 2 needs 10 XP, level 3 needs 40, level 4 needs 90.
    const ledger = [
      entry('2026-03-04', { key: 'A-2', xp: 30 }),
      entry('2026-03-02', { key: 'A-1', xp: 10 }),
      entry('2026-03-09', { key: 'A-3', xp: 50 }),
      entry('2026-03-03', { key: 'B-1', xp: 500, heroId: 'b' }),
    ];
    expect(levelMilestones(ledger, 'a')).toEqual([
      { level: 2, day: '2026-03-02', key: 'A-1' },
      { level: 3, day: '2026-03-04', key: 'A-2' },
      { level: 4, day: '2026-03-09', key: 'A-3' },
    ]);
  });

  it('gives a skipped level its own line', () => {
    expect(levelMilestones([entry('2026-03-02', { xp: 50 })], 'a').map((m) => m.level)).toEqual([2, 3]);
    expect(levelMilestones([], 'a')).toEqual([]);
  });
});

describe('personalBests', () => {
  it('finds the best day, best week and biggest issue for one hero', () => {
    const ledger = [
      entry('2026-03-02', { key: 'A-1', xp: 10 }),
      entry('2026-03-02', { key: 'A-2', xp: 30 }),
      entry('2026-03-11', { key: 'A-3', xp: 35 }),
      entry('2026-03-03', { key: 'B-1', xp: 500, heroId: 'b' }),
    ];
    expect(personalBests(ledger, 'a')).toEqual({
      completed: 3,
      xp: 75,
      bestDay: { day: '2026-03-02', xp: 40, completed: 2 },
      bestWeek: { weekStart: '2026-03-02', xp: 40, completed: 2 },
      biggest: { key: 'A-3', xp: 35 },
      firstDay: '2026-03-02',
    });
  });

  it('is empty for a hero with no finished work', () => {
    expect(personalBests([], 'a')).toEqual({ completed: 0, xp: 0, bestDay: null, bestWeek: null, biggest: null, firstDay: null });
  });
});
