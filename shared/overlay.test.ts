import { describe, expect, it } from 'vitest';
import { applyEdits, applyEditsTo, pruneCreated, pruneEdits, showsPatch, type PendingEdit } from './overlay';
import { makeQuest } from './testing';

const edit = (id: number, key: string, patch: PendingEdit['patch'], settledAt: number | null = null): PendingEdit => ({ id, key, patch, settledAt });

describe('applyEdits', () => {
  it('layers edits in order on the matching issues only', () => {
    const quests = [makeQuest({ key: 'A-1' }), makeQuest({ key: 'A-2' })];
    const result = applyEdits(quests, [edit(1, 'A-1', { status: 'Doing' }), edit(2, 'A-1', { status: 'Done', done: true })]);
    expect(result[0]).toMatchObject({ status: 'Done', done: true });
    expect(result[1]).toBe(quests[1]);
  });

  it('returns the same objects when there are no edits', () => {
    const quests = [makeQuest()];
    expect(applyEdits(quests, [])).toBe(quests);
    expect(applyEditsTo(quests[0], [])).toBe(quests[0]);
  });
});

describe('showsPatch', () => {
  it('compares every patched field', () => {
    const quest = makeQuest({ assigneeId: 'z', stage: 'doing' });
    expect(showsPatch(quest, { assigneeId: 'z' })).toBe(true);
    expect(showsPatch(quest, { assigneeId: 'a' })).toBe(false);
  });

  it('accepts any status in the category when the patch has no status id', () => {
    const quest = makeQuest({ status: 'Closed', statusId: '7', stage: 'done', done: true });
    expect(showsPatch(quest, { status: 'Done', statusId: '', stage: 'done', done: true })).toBe(true);
    expect(showsPatch({ ...quest, stage: 'doing', done: false }, { status: 'Done', statusId: '', stage: 'done', done: true })).toBe(false);
  });
});

describe('pruneEdits', () => {
  const server = [makeQuest({ key: 'A-1', assigneeId: 'z' }), makeQuest({ key: 'A-2', assigneeId: 'old' })];

  it('keeps in-flight edits and edits newer than the fetch', () => {
    const edits = [edit(1, 'A-1', { assigneeId: 'z' }, null), edit(2, 'A-1', { assigneeId: 'z' }, 5000)];
    expect(pruneEdits(edits, server, 4000, 10_000)).toBe(edits);
  });

  it('drops confirmed edits once the board shows them', () => {
    const edits = [edit(1, 'A-1', { assigneeId: 'z' }, 1000), edit(2, 'A-2', { assigneeId: 'new' }, 1000)];
    expect(pruneEdits(edits, server, 2000, 10_000).map((e) => e.id)).toEqual([2]);
  });

  it('gives up on edits the board still lacks after the index lag', () => {
    const edits = [edit(2, 'A-2', { assigneeId: 'new' }, 1000)];
    expect(pruneEdits(edits, server, 11_000, 10_000)).toEqual([]);
  });
});

describe('pruneCreated', () => {
  const created = [
    { quest: makeQuest({ key: 'A-9' }), settledAt: 1000 },
    { quest: makeQuest({ key: 'A-10' }), settledAt: 1000 },
  ];

  it('drops issues the board now has, and ones the query evidently leaves out', () => {
    expect(pruneCreated(created, new Set(['A-9']), 1200, 1500).map((c) => c.quest.key)).toEqual(['A-10']);
    expect(pruneCreated(created, new Set(), 9000, 1500)).toEqual([]);
  });
});
