import { describe, expect, it } from 'vitest';
import { computeProgress, mergeLedger, standings, withProgress } from './ledger';
import { makeQuest } from './testing';
import type { Board, XpEntry } from './types';

const now = new Date(2026, 8, 14, 15); // a Monday
const heroes = [
  { id: 'zoe', name: 'Zoe', avatarUrl: null },
  { id: 'amir', name: 'Amir', avatarUrl: null },
];
const daysAgo = (n: number) => new Date(2026, 8, 14 - n, 10).toISOString();

describe('mergeLedger', () => {
  it('credits finished issues to their assignee when Jira resolved them', () => {
    const quests = [
      makeQuest({ key: 'A-1', done: true, stage: 'done', assigneeId: 'zoe', points: 3, resolvedAt: daysAgo(1) }),
      makeQuest({ key: 'A-2', assigneeId: 'zoe' }),
      makeQuest({ key: 'A-3', done: true, stage: 'done', assigneeId: null }),
    ];
    expect(mergeLedger([], quests, heroes, now)).toEqual([
      { key: 'A-1', heroId: 'zoe', heroName: 'Zoe', xp: 30, kind: 'task', points: 3, due: null, at: daysAgo(1) },
    ]);
  });

  it('keeps XP for issues that left the board, and takes it away from reopened ones', () => {
    const saved: XpEntry[] = [
      { key: 'OLD-1', heroId: 'zoe', heroName: 'Zoe', xp: 50, kind: 'story', points: 5, due: null, at: daysAgo(40) },
      { key: 'A-1', heroId: 'amir', heroName: 'Amir', xp: 10, kind: 'bug', points: null, due: null, at: daysAgo(2) },
    ];
    const result = mergeLedger(saved, [makeQuest({ key: 'A-1', assigneeId: 'amir' })], heroes, now);
    expect(result.map((e) => e.key)).toEqual(['OLD-1']);
  });

  it('returns the same array when nothing changed, and uses the first time it saw a done issue without a date', () => {
    const quests = [makeQuest({ key: 'A-1', done: true, stage: 'done', assigneeId: 'zoe' })];
    const first = mergeLedger([], quests, heroes, now);
    expect(first[0].at).toBe(now.toISOString());
    expect(mergeLedger(first, quests, heroes, new Date(2026, 8, 20))).toBe(first);
  });
});

describe('computeProgress', () => {
  const ledger: XpEntry[] = [
    { key: 'A-1', heroId: 'zoe', heroName: 'Zoe', xp: 80, kind: 'epic', points: 8, due: null, at: daysAgo(20) },
    { key: 'A-2', heroId: 'zoe', heroName: 'Zoe', xp: 10, kind: 'bug', points: null, due: '2026-09-20', at: daysAgo(1) },
    { key: 'A-3', heroId: 'zoe', heroName: 'Zoe', xp: 20, kind: 'bug', points: 2, due: null, at: daysAgo(0) },
    { key: 'A-4', heroId: 'amir', heroName: 'Amir', xp: 30, kind: 'story', points: 3, due: null, at: daysAgo(3) },
  ];

  it('totals XP all-time and this sprint, with streaks, achievements and the earned class', () => {
    const progress = computeProgress(ledger, daysAgo(5), now);
    expect(progress.zoe).toMatchObject({ xp: 110, sprintXp: 30, completed: 3, streak: 2, bestStreak: 2, classSlot: 4 });
    expect(progress.zoe.achievements).toEqual(expect.arrayContaining(['first-blood', 'heavy-lifter', 'dragon-slayer', 'centurion']));
    // Amir last finished on Friday; the weekend in between doesn't break his streak.
    expect(progress.amir).toMatchObject({ xp: 30, sprintXp: 30, streak: 1, classSlot: null });
  });

  it('ranks the sprint standings by XP, then by issues finished', () => {
    expect(standings(computeProgress(ledger, daysAgo(5), now)).map((p) => p.heroId)).toEqual(['zoe', 'amir']);
    expect(standings(computeProgress(ledger, daysAgo(25), now)).map((p) => p.heroId)).toEqual(['zoe', 'amir']);
  });
});

describe('withProgress', () => {
  it('adds progress to the board and returns the ledger to save', () => {
    const board: Board = {
      source: 'jira',
      columns: [],
      boardName: null,
      truncatedAt: null,
      sprints: [],
      heroes,
      quests: [makeQuest({ key: 'A-1', done: true, stage: 'done', assigneeId: 'amir', resolvedAt: daysAgo(0) })],
      me: null,
      progress: {},
    };
    const { board: next, ledger } = withProgress(board, [], now);
    expect(ledger).toHaveLength(1);
    expect(next.progress.amir.xp).toBe(10);
  });
});
