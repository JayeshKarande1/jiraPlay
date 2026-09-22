import { describe, expect, it } from 'vitest';
import { makeQuest } from '../shared/testing';
import type { Board } from '../shared/types';
import { sidebarModel } from './sidebarModel';

const board = (overrides: Partial<Board> = {}): Board => ({
  source: 'jira',
  columns: [],
  boardName: null,
  truncatedAt: null,
  sprints: [],
  heroes: [{ id: 'me', name: 'Jay', avatarUrl: null }],
  quests: [
    makeQuest({ key: 'A-1', assigneeId: 'me', summary: 'Fix login', kind: 'bug', points: 3 }),
    makeQuest({ key: 'A-2', assigneeId: 'me', done: true, stage: 'done', points: 5 }),
  ],
  me: { id: 'me', name: 'Jay', avatarUrl: null },
  progress: {
    me: { heroId: 'me', heroName: 'Jay', xp: 250, sprintXp: 50, completed: 6, streak: 3, bestStreak: 4, achievements: [], classSlot: 3 },
  },
  ...overrides,
});

describe('sidebarModel', () => {
  it('is empty without a live board, so the welcome buttons show', () => {
    expect(sidebarModel(null, 'arcade')).toEqual([]);
    expect(sidebarModel(board({ source: 'mock' }), 'arcade')).toEqual([]);
  });

  it('shows your level from the ledger, streak, open issues, the boss and the standings', () => {
    const nodes = sidebarModel(board(), 'arcade');
    expect(nodes.map((n) => n.id)).toEqual(['level', 'streak', 'mine', 'boss', 'standings']);
    expect(nodes[0].label).toBe('LVL 6 · 250 XP');
    expect(nodes[2].children?.[0]).toMatchObject({
      label: 'Fix login',
      icon: 'bug',
      command: { command: 'jiraPlay.openIssue', arguments: ['A-1'] },
    });
    expect(nodes[3]).toMatchObject({ label: 'The Backlog Behemoth', description: '30/80 HP' });
    expect(nodes[4].children?.[0]).toMatchObject({ label: '🥇 Jay', description: '50 XP · 🔥3' });
  });

  it("uses the theme's words", () => {
    expect(sidebarModel(board(), 'space')[0].label).toBe('RANK 6 · 250 XP');
  });
});
