import { describe, expect, it } from 'vitest';
import { bossState } from './boss';
import { makeQuest } from './testing';

const sprint = { id: 1, name: 'S', goal: null, startDate: '2026-09-01T00:00:00.000Z', endDate: '2026-09-11T00:00:00.000Z' };

describe('bossState', () => {
  it('takes damage from finished issues', () => {
    const quests = [makeQuest({ points: 5, done: true }), makeQuest({ points: 3 }), makeQuest()];
    expect(bossState(quests, sprint, new Date('2026-09-03T00:00:00.000Z'))).toEqual({ maxHp: 90, hp: 40, elapsed: 0.2, enraged: false, defeated: false });
  });

  it('is enraged late in the sprint with most of its HP left', () => {
    const quests = [makeQuest({ points: 5 }), makeQuest({ points: 1, done: true })];
    expect(bossState(quests, sprint, new Date('2026-09-10T00:00:00.000Z')).enraged).toBe(true);
  });

  it('is defeated when everything is done, and has no clock without sprint dates', () => {
    const state = bossState([makeQuest({ done: true })], null);
    expect(state).toMatchObject({ defeated: true, enraged: false, elapsed: null });
    expect(bossState([], null).defeated).toBe(false);
  });
});
