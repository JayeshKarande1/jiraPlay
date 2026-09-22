import { describe, expect, it } from 'vitest';
import { assignClasses, initials, sameMember, type Member } from './heroes';
import { makeQuest } from './testing';
import { THEME_IDS, THEME_LIST, THEMES, isThemeId } from './themes';

const classes = THEMES.arcade.classes;

describe('assignClasses', () => {
  it('gives every hero a different class until the classes run out', () => {
    const assigned = assignClasses(['a', 'b', 'c', 'd', 'e'], classes);
    expect(new Set([...assigned.values()].map((c) => c.name)).size).toBe(5);
  });

  it('is stable for the same heroes', () => {
    const ids = ['anya', 'ravi', 'mei'];
    expect([...assignClasses(ids, classes).values()]).toEqual([...assignClasses(ids, classes).values()]);
  });

  it('keeps hero slots when the theme changes', () => {
    const ids = ['anya', 'ravi', 'mei', 'lucas'];
    const slots = (themeClasses: typeof classes) => [...assignClasses(ids, themeClasses).values()].map((c) => themeClasses.indexOf(c));
    expect(slots(THEMES.space.classes)).toEqual(slots(classes));
  });
});

describe('initials', () => {
  it('takes up to two initials', () => {
    expect(initials('Anya Petrova')).toBe('AP');
    expect(initials('madonna')).toBe('M');
    expect(initials('  jean  luc picard ')).toBe('JL');
  });
});

describe('themes', () => {
  it('defines every theme id', () => {
    expect(Object.keys(THEMES).sort()).toEqual([...THEME_IDS].sort());
    expect(isThemeId('racing')).toBe(true);
    expect(isThemeId('nope')).toBe(false);
  });

  // assignClasses relies on every theme having the same number of classes.
  it.each(THEME_LIST.map((t) => [t.id, t]))('%s has five classes and all icons', (_id, theme) => {
    expect(theme.classes).toHaveLength(5);
    expect(Object.keys(theme.stageIcons).sort()).toEqual(['doing', 'done', 'todo']);
    expect(Object.keys(theme.kindIcons).sort()).toEqual(['bug', 'epic', 'story', 'subtask', 'task']);
  });
});

describe('sameMember', () => {
  const hero = { id: 'a', name: 'Ada', avatarUrl: null };
  const cls = classes[0];
  const quest = makeQuest();
  const base: Member = { hero, cls, isTavern: false, quests: [quest], xp: 30, progress: null, earnedClass: false };

  it('lets a card skip a render when the poll rebuilt an equal member', () => {
    // Every field is the same object, which is what keepIdentity gives the board between polls.
    expect(sameMember(base, { ...base })).toBe(true);
    expect(sameMember(base, { ...base, quests: [quest] })).toBe(true);
  });

  it('notices anything a card actually draws', () => {
    expect(sameMember(base, { ...base, xp: 40 })).toBe(false);
    expect(sameMember(base, { ...base, earnedClass: true })).toBe(false);
    expect(sameMember(base, { ...base, hero: { ...hero } })).toBe(false);
    expect(sameMember(base, { ...base, quests: [] })).toBe(false);
    // A changed issue is a new object, so identity is enough to catch it.
    expect(sameMember(base, { ...base, quests: [makeQuest()] })).toBe(false);
  });
});
