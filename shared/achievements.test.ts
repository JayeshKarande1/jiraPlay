import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, earnedAchievements, onTime } from './achievements';
import { localDay } from './days';
import type { QuestKind, XpEntry } from './types';

const entry = (overrides: Partial<XpEntry> = {}): XpEntry => ({
  key: 'PD-1',
  heroId: 'a',
  heroName: 'Ada',
  xp: 10,
  kind: 'task',
  points: null,
  due: null,
  at: '2026-03-02T10:00:00.000Z',
  ...overrides,
});

const many = (count: number, overrides: Partial<XpEntry> = {}) =>
  Array.from({ length: count }, (_, i) => entry({ key: `PD-${i}`, ...overrides }));

const ids = (entries: XpEntry[], streak = 0) => earnedAchievements(entries, streak).map((a) => a.id);

describe('onTime', () => {
  it('needs a due date, and counts the day it was finished in local time', () => {
    const at = '2026-03-02T10:00:00.000Z';
    const day = localDay(at);
    expect(onTime(entry({ at, due: null }))).toBe(false);
    expect(onTime(entry({ at, due: day }))).toBe(true); // on the day itself counts
    expect(onTime(entry({ at, due: '2099-01-01' }))).toBe(true);
    expect(onTime(entry({ at, due: '2020-01-01' }))).toBe(false);
  });
});

describe('earnedAchievements', () => {
  it('gives nothing for no work', () => {
    expect(ids([])).toEqual([]);
  });

  it('awards First Blood on the very first issue', () => {
    expect(ids([entry()])).toContain('first-blood');
  });

  it('awards the streak badges at 3, 5 and 10 days and not before', () => {
    const at = (streak: number) => ids([entry()], streak);
    expect(at(2)).not.toContain('on-a-roll');
    expect(at(3)).toContain('on-a-roll');
    expect(at(4)).not.toContain('unstoppable');
    expect(at(5)).toContain('unstoppable');
    expect(at(9)).not.toContain('legend');
    expect(at(10)).toContain('legend');
  });

  it('awards Bug Hunter on the fifth bug', () => {
    expect(ids(many(4, { kind: 'bug' }))).not.toContain('bug-hunter');
    expect(ids(many(5, { kind: 'bug' }))).toContain('bug-hunter');
  });

  it('awards Heavy Lifter for a single 8-point issue', () => {
    expect(ids([entry({ points: 7 })])).not.toContain('heavy-lifter');
    expect(ids([entry({ points: 8 })])).toContain('heavy-lifter');
  });

  it('awards Right on Time on the fifth issue met by its due date', () => {
    const due = localDay('2026-03-02T10:00:00.000Z');
    expect(ids([...many(4, { due }), ...many(3, { due: '2020-01-01' })])).not.toContain('right-on-time');
    expect(ids(many(5, { due }))).toContain('right-on-time');
  });

  it('awards All-Rounder only once a story, a task and a bug are all done', () => {
    const of = (...kinds: QuestKind[]) => kinds.map((kind, i) => entry({ key: `PD-${i}`, kind }));
    expect(ids(of('story', 'task'))).not.toContain('all-rounder');
    expect(ids(of('story', 'task', 'epic'))).not.toContain('all-rounder');
    expect(ids(of('story', 'task', 'bug'))).toContain('all-rounder');
  });

  it('awards the XP badges on total XP, not issue count', () => {
    expect(ids([entry({ xp: 90 })])).not.toContain('centurion');
    expect(ids([entry({ xp: 100 })])).toContain('centurion');
    expect(ids([entry({ xp: 999 })])).not.toContain('veteran');
    expect(ids([entry({ xp: 500 }), entry({ key: 'PD-2', xp: 500 })])).toContain('veteran');
  });

  it('awards Dragon Slayer for any epic', () => {
    expect(ids([entry({ kind: 'epic' })])).toContain('dragon-slayer');
    expect(ids([entry({ kind: 'story' })])).not.toContain('dragon-slayer');
  });

  it('returns badges in the order they are displayed', () => {
    const earned = ids(many(5, { kind: 'bug', points: 8 }), 10);
    expect(earned).toEqual(ACHIEVEMENTS.filter((a) => earned.includes(a.id)).map((a) => a.id));
  });

  it('never loses a badge as more work is added', () => {
    // The rules only look at finished work, so a badge earned once stays earned.
    const first = ids([entry({ kind: 'epic' })]);
    const later = ids([entry({ kind: 'epic' }), ...many(20, { kind: 'task' })]);
    for (const id of first) expect(later).toContain(id);
  });
});

describe('ACHIEVEMENT_BY_ID', () => {
  it('describes every rule, without exposing the rule itself', () => {
    expect(ACHIEVEMENT_BY_ID.size).toBe(ACHIEVEMENTS.length);
    for (const rule of ACHIEVEMENTS) {
      const shown = ACHIEVEMENT_BY_ID.get(rule.id);
      expect(shown).toMatchObject({ id: rule.id, name: rule.name, icon: rule.icon, description: rule.description });
      expect(shown).not.toHaveProperty('earned');
    }
  });

  it('has no duplicate ids', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});
