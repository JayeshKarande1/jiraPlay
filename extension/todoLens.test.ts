import { describe, expect, it } from 'vitest';
import { makeQuest } from '../shared/testing';
import type { Board } from '../shared/types';
import { boardLookup, lensTitle, type LensQuest } from './todoLens';
import type { Todo } from '../shared/codeIssues';

const todo = (overrides: Partial<Todo> = {}): Todo => ({ line: 0, marker: 'TODO', text: 'wire this up', key: null, ...overrides });
const found = (overrides: Partial<LensQuest> = {}): LensQuest => ({ summary: 'Fix it', status: 'In Progress', done: false, ...overrides });

describe('lensTitle', () => {
  it('offers to create an issue when the TODO names none', () => {
    expect(lensTitle(todo(), undefined)).toBe('$(add) Create Jira issue');
  });

  it('shows the status when the board has the issue', () => {
    expect(lensTitle(todo({ key: 'PD-918' }), found())).toBe('$(circle-outline) PD-918 · In Progress');
    expect(lensTitle(todo({ key: 'PD-918' }), found({ status: 'Done', done: true }))).toBe('$(check) PD-918 · Done');
  });

  it('still links a key the board does not have', () => {
    // The board is one JQL; a TODO can name an issue outside it, and that link is still worth offering.
    expect(lensTitle(todo({ key: 'PD-1' }), undefined)).toBe('$(link-external) PD-1');
  });
});

const board = (keys: string[]): Board =>
  ({
    quests: keys.map((key) => makeQuest({ key, summary: `About ${key}` })),
  }) as Board;

describe('boardLookup', () => {
  it('is empty and harmless before a board has loaded', () => {
    const lookup = boardLookup(() => null);
    expect(lookup.projects()).toEqual([]);
    expect(lookup.quest('PD-1')).toBeUndefined();
  });

  it('reports the projects actually on the board', () => {
    expect(boardLookup(() => board(['PD-1', 'PD-2', 'FUN-9'])).projects().sort()).toEqual(['FUN', 'PD']);
  });

  it('finds an issue whatever case the comment used', () => {
    const lookup = boardLookup(() => board(['PD-918']));
    expect(lookup.quest('pd-918')?.summary).toBe('About PD-918');
    expect(lookup.quest('PD-919')).toBeUndefined();
  });

  it('follows the board, so lenses update when a new one arrives', () => {
    let current: Board | null = null;
    const lookup = boardLookup(() => current);
    expect(lookup.quest('PD-1')).toBeUndefined();
    current = board(['PD-1']);
    expect(lookup.quest('PD-1')?.status).toBe('To Do');
  });
});
