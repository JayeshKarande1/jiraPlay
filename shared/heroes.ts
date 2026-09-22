import type { Hero, HeroProgress, Quest, QuestKind, XpEntry } from './types';
import { isOverdue, levelStats } from './xp';

/** Level, XP bar and overdue count for a party member. */
export function memberStats(member: Member) {
  return { ...levelStats(member.xp), overdue: member.quests.filter(isOverdue).length };
}

export interface HeroClass {
  name: string;
  icon: string;
  color: string;
}

/** A party slot: a hero (or Unassigned) with their class and issues. */
export interface Member {
  hero: Hero;
  cls: HeroClass;
  isTavern: boolean;
  quests: Quest[];
  /** XP to show: the ledger's all-time total, including changes on the board that the server hasn't counted yet. */
  xp: number;
  /** From the XP ledger; null for Unassigned or before the host has any. */
  progress: HeroProgress | null;
  /** True when the class was earned from the hero's work rather than handed out. */
  earnedClass: boolean;
}

/** Same hero, class, progress and issue objects: what a memoised card needs to know it can skip a render. */
export function sameMember(a: Member, b: Member): boolean {
  return (
    a === b ||
    (a.hero === b.hero &&
      a.cls === b.cls &&
      a.isTavern === b.isTavern &&
      a.xp === b.xp &&
      a.progress === b.progress &&
      a.earnedClass === b.earnedClass &&
      a.quests.length === b.quests.length &&
      a.quests.every((q, i) => q === b.quests[i]))
  );
}

/**
 * What earns each class slot. Every theme lists its five classes in this order, so a bug-squashing hero is the
 * Rogue in Arcade and the Scientist in Space Fleet.
 */
export const CLASS_BEHAVIOURS = ['Finishes stories', 'Clears subtasks', 'Gets tasks done', 'Squashes bugs', 'Takes on epics and big issues'];
const SLOT_BY_KIND: Record<QuestKind, number> = { story: 0, subtask: 1, task: 2, bug: 3, epic: 4 };
/** Finished issues needed before a class is earned rather than handed out. */
export const ISSUES_TO_EARN_CLASS = 3;
/** Only recent work counts, so a hero's class follows what they do now. */
const RECENT_ENTRIES = 30;

/** The class slot a hero's recent work earns: the kind of issue that brought them the most XP. Null with too little work. */
export function earnedClassSlot(entries: XpEntry[]): number | null {
  const recent = entries.slice(-RECENT_ENTRIES);
  if (recent.length < ISSUES_TO_EARN_CLASS) return null;
  const scores = CLASS_BEHAVIOURS.map(() => 0);
  for (const entry of recent) {
    scores[SLOT_BY_KIND[entry.kind]] += entry.xp;
    // Big issues count toward the epic slot too, whatever their type.
    if ((entry.points ?? 0) >= 8) scores[SLOT_BY_KIND.epic] += entry.xp / 2;
  }
  return scores.indexOf(Math.max(...scores));
}

function hashOf(id: string): number {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash;
}

/**
 * Gives each hero one of the theme's classes, seeded by their id and avoiding repeats until every class is taken.
 * Themes have the same number of classes, so a hero keeps the same slot when the theme changes.
 */
export function assignClasses(heroIds: string[], classes: HeroClass[], earned: Map<string, number> = new Map()): Map<string, HeroClass> {
  const result = new Map<string, HeroClass>();
  const used = new Set<number>();
  // Earned classes come first and can repeat: two bug hunters are both Rogues.
  for (const id of heroIds) {
    const slot = earned.get(id);
    if (slot !== undefined && classes[slot]) result.set(id, classes[slot]);
  }
  for (const id of heroIds) {
    if (result.has(id)) continue;
    if (used.size === classes.length) used.clear();
    let index = hashOf(id) % classes.length;
    while (used.has(index)) index = (index + 1) % classes.length;
    used.add(index);
    result.set(id, classes[index]);
  }
  return result;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}
