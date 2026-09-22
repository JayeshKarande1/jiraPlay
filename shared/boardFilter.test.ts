import { describe, expect, it } from 'vitest';
import { EMPTY_FILTER, filterQuests, isEmptyFilter, questMatches, sortMembers, type QuestFilter } from './boardFilter';
import type { Member } from './heroes';
import { makeQuest } from './testing';
import type { QuestKind } from './types';

const filter = (overrides: Partial<QuestFilter> = {}): QuestFilter => ({ ...EMPTY_FILTER, ...overrides });
const yesterday = () => {
  const d = new Date(Date.now() - 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('isEmptyFilter', () => {
  it('treats whitespace-only text as no filter', () => {
    expect(isEmptyFilter(EMPTY_FILTER)).toBe(true);
    expect(isEmptyFilter(filter({ text: '   ' }))).toBe(true);
    expect(isEmptyFilter(filter({ text: 'a' }))).toBe(false);
    expect(isEmptyFilter(filter({ kinds: ['bug'] }))).toBe(false);
    expect(isEmptyFilter(filter({ stage: 'doing' }))).toBe(false);
  });
});

describe('questMatches', () => {
  const quest = makeQuest({ key: 'PD-918', summary: 'Fix the checkout rounding', kind: 'bug', stage: 'doing' });

  it('matches the summary or the key, ignoring case', () => {
    expect(questMatches(quest, filter({ text: 'ROUNDING' }))).toBe(true);
    expect(questMatches(quest, filter({ text: 'pd-918' }))).toBe(true);
    expect(questMatches(quest, filter({ text: 'nope' }))).toBe(false);
  });

  it('treats an empty kind list as every kind', () => {
    expect(questMatches(quest, filter({ kinds: [] }))).toBe(true);
    expect(questMatches(quest, filter({ kinds: ['bug'] }))).toBe(true);
    expect(questMatches(quest, filter({ kinds: ['story', 'task'] }))).toBe(false);
  });

  it('filters by stage', () => {
    expect(questMatches(quest, filter({ stage: 'doing' }))).toBe(true);
    expect(questMatches(quest, filter({ stage: 'todo' }))).toBe(false);
    expect(questMatches(quest, filter({ stage: 'all' }))).toBe(true);
  });

  it('treats overdue as its own view, not a Jira stage', () => {
    const late = makeQuest({ dueDate: yesterday() });
    expect(questMatches(late, filter({ stage: 'overdue' }))).toBe(true);
    expect(questMatches(makeQuest({ dueDate: null }), filter({ stage: 'overdue' }))).toBe(false);
    // Finished work is never overdue, however late its due date.
    expect(questMatches(makeQuest({ dueDate: yesterday(), done: true, stage: 'done' }), filter({ stage: 'overdue' }))).toBe(false);
  });

  it('requires every active criterion at once', () => {
    expect(questMatches(quest, filter({ text: 'rounding', kinds: ['bug'], stage: 'doing' }))).toBe(true);
    expect(questMatches(quest, filter({ text: 'rounding', kinds: ['story'] }))).toBe(false);
  });
});

describe('filterQuests', () => {
  const quests = [makeQuest({ key: 'A-1', kind: 'bug' }), makeQuest({ key: 'A-2', kind: 'task' })];

  it('returns the very same array when nothing is filtered out, so memoised cards can skip', () => {
    expect(filterQuests(quests, EMPTY_FILTER)).toBe(quests);
    expect(filterQuests(quests, filter({ kinds: ['bug', 'task'] }))).toBe(quests);
  });

  it('returns only the matches otherwise', () => {
    expect(filterQuests(quests, filter({ kinds: ['bug'] })).map((q) => q.key)).toEqual(['A-1']);
    expect(filterQuests(quests, filter({ text: 'nothing' }))).toEqual([]);
  });
});

const member = (id: string, name: string, over: Partial<Member> = {}): Member => ({
  hero: { id, name, avatarUrl: null },
  cls: { name: 'Knight', icon: 'K', color: '#fff' },
  isTavern: false,
  quests: [],
  xp: 0,
  progress: null,
  earnedClass: false,
  ...over,
});

describe('sortMembers', () => {
  const open = (n: number) => Array.from({ length: n }, (_, i) => makeQuest({ key: `X-${i}` }));
  const ada = member('a', 'Ada', { xp: 10, quests: open(3) });
  const brendan = member('b', 'Brendan', { xp: 250, quests: open(1) });
  const grace = member('c', 'Grace', { xp: 90, quests: open(2) });
  const tavern = member('__tavern__', 'Unassigned', { isTavern: true, quests: open(9) });
  const party = [ada, brendan, grace, tavern];
  const names = (sort: Parameters<typeof sortMembers>[1]) => sortMembers(party, sort).map((m) => m.hero.name);

  it('leaves board order untouched, and does not copy', () => {
    expect(sortMembers(party, 'board')).toBe(party);
  });

  it('never reorders the caller’s array', () => {
    sortMembers(party, 'name');
    expect(party.map((m) => m.hero.name)).toEqual(['Ada', 'Brendan', 'Grace', 'Unassigned']);
  });

  it('keeps Unassigned last whatever the sort', () => {
    // It holds the most open issues here, so "most open" is the case that would otherwise put it first.
    for (const sort of ['level', 'name', 'open', 'overdue'] as const) {
      expect(names(sort).at(-1)).toBe('Unassigned');
    }
  });

  it('sorts by level, most open and name', () => {
    expect(names('level')).toEqual(['Brendan', 'Grace', 'Ada', 'Unassigned']);
    expect(names('open')).toEqual(['Ada', 'Grace', 'Brendan', 'Unassigned']);
    expect(names('name')).toEqual(['Ada', 'Brendan', 'Grace', 'Unassigned']);
  });

  it('breaks ties by board order, so the list does not shuffle between polls', () => {
    const flat = [member('a', 'Ada'), member('b', 'Brendan'), member('c', 'Grace')];
    expect(sortMembers(flat, 'level').map((m) => m.hero.name)).toEqual(['Ada', 'Brendan', 'Grace']);
    expect(sortMembers([...flat].reverse(), 'level').map((m) => m.hero.name)).toEqual(['Grace', 'Brendan', 'Ada']);
  });
});

describe('kind coverage', () => {
  it('every kind can be filtered', () => {
    const kinds: QuestKind[] = ['story', 'task', 'bug', 'epic', 'subtask'];
    for (const kind of kinds) expect(questMatches(makeQuest({ kind }), filter({ kinds: [kind] }))).toBe(true);
  });
});
