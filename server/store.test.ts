import { describe, expect, it, vi } from 'vitest';
import { createMockStore } from './mock';
import { COMMENT_MAX_LENGTH, parseCommentBody, parseMyQuestQuery, StoreError, withBoardCache } from './store';

describe('withBoardCache', () => {
  function setup() {
    const inner = createMockStore();
    const getBoard = vi.spyOn(inner, 'getBoard');
    let time = 0;
    const store = withBoardCache(inner, 5000, () => time);
    return { store, getBoard, tick: (ms: number) => (time += ms) };
  }

  it('shares a load in progress and a fresh result', async () => {
    const { store, getBoard, tick } = setup();
    const [a, b] = await Promise.all([store.getBoard(), store.getBoard()]);
    expect(a).toBe(b);
    tick(4000);
    await store.getBoard();
    expect(getBoard).toHaveBeenCalledTimes(1);
    tick(2000);
    await store.getBoard();
    expect(getBoard).toHaveBeenCalledTimes(2);
  });

  it('loads again after a write', async () => {
    const { store, getBoard } = setup();
    const before = await store.getBoard();
    const key = before.quests.find((q) => !q.done)!.key;
    await store.completeQuest(key);
    const after = await store.getBoard();
    expect(getBoard).toHaveBeenCalledTimes(2);
    expect(after.quests.find((q) => q.key === key)?.done).toBe(true);
  });

  it("doesn't keep a failed load", async () => {
    const { store, getBoard } = setup();
    getBoard.mockRejectedValueOnce(new StoreError(502, 'down'));
    await expect(store.getBoard()).rejects.toThrow('down');
    await expect(store.getBoard()).resolves.toMatchObject({ source: 'mock' });
  });
});

describe('parseCommentBody', () => {
  it('trims the text', () => {
    expect(parseCommentBody('  Looks good  ')).toBe('Looks good');
  });

  it('rejects empty or too long comments', () => {
    expect(() => parseCommentBody('   ')).toThrow(StoreError);
    expect(() => parseCommentBody(42)).toThrow(StoreError);
    expect(() => parseCommentBody('x'.repeat(COMMENT_MAX_LENGTH + 1))).toThrow(/at most/);
  });
});

describe('parseMyQuestQuery', () => {
  it('reads a valid query', () => {
    expect(parseMyQuestQuery({ stage: 'done', search: '  login ', cursor: 'page-2' })).toEqual({ stage: 'done', search: 'login', cursor: 'page-2' });
  });

  it('falls back to the first page of everything', () => {
    expect(parseMyQuestQuery({ stage: 'nope', search: 5, cursor: '' })).toEqual({ stage: 'all', search: '', cursor: null });
    expect(parseMyQuestQuery(null)).toEqual({ stage: 'all', search: '', cursor: null });
  });

  it('caps the search length', () => {
    expect(parseMyQuestQuery({ search: 'a'.repeat(500) }).search).toHaveLength(200);
  });
});
