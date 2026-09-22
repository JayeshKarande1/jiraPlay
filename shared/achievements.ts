import { localDay } from './days';
import type { XpEntry } from './types';

export interface Achievement {
  id: string;
  name: string;
  icon: string;
  /** How to earn it, shown on locked badges too. */
  description: string;
}

interface Rule extends Achievement {
  earned: (entries: XpEntry[], bestStreak: number) => boolean;
}

const countOf = (entries: XpEntry[], test: (e: XpEntry) => boolean) => entries.filter(test).length;
const totalXp = (entries: XpEntry[]) => entries.reduce((sum, e) => sum + e.xp, 0);

/** Finished on or before its due date. */
export const onTime = (entry: XpEntry) => entry.due !== null && localDay(entry.at) <= entry.due;

/** Every achievement, in the order badges are shown. They only depend on finished work, so they're never lost by waiting. */
export const ACHIEVEMENTS: Rule[] = [
  { id: 'first-blood', name: 'First Blood', icon: '🗡️', description: 'Finish your first issue', earned: (e) => e.length >= 1 },
  { id: 'on-a-roll', name: 'On a Roll', icon: '🔥', description: 'Finish work 3 days in a row', earned: (_, streak) => streak >= 3 },
  { id: 'bug-hunter', name: 'Bug Hunter', icon: '🐞', description: 'Fix 5 bugs', earned: (e) => countOf(e, (x) => x.kind === 'bug') >= 5 },
  { id: 'heavy-lifter', name: 'Heavy Lifter', icon: '🏋️', description: 'Finish an issue worth 8 or more story points', earned: (e) => e.some((x) => (x.points ?? 0) >= 8) },
  { id: 'right-on-time', name: 'Right on Time', icon: '⏱️', description: 'Finish 5 issues by their due date', earned: (e) => countOf(e, onTime) >= 5 },
  {
    id: 'all-rounder',
    name: 'All-Rounder',
    icon: '🎭',
    description: 'Finish a story, a task and a bug',
    earned: (e) => (['story', 'task', 'bug'] as const).every((kind) => e.some((x) => x.kind === kind)),
  },
  { id: 'centurion', name: 'Centurion', icon: '💯', description: 'Earn 100 XP', earned: (e) => totalXp(e) >= 100 },
  { id: 'unstoppable', name: 'Unstoppable', icon: '⚡', description: 'Finish work 5 days in a row', earned: (_, streak) => streak >= 5 },
  { id: 'dragon-slayer', name: 'Dragon Slayer', icon: '🐉', description: 'Finish an epic', earned: (e) => e.some((x) => x.kind === 'epic') },
  { id: 'veteran', name: 'Veteran', icon: '🎖️', description: 'Earn 1,000 XP', earned: (e) => totalXp(e) >= 1000 },
  { id: 'legend', name: 'Legend', icon: '🌟', description: 'Finish work 10 days in a row', earned: (_, streak) => streak >= 10 },
];

export const ACHIEVEMENT_BY_ID = new Map<string, Achievement>(ACHIEVEMENTS.map(({ earned: _earned, ...a }) => [a.id, a]));

export function earnedAchievements(entries: XpEntry[], bestStreak: number): Achievement[] {
  return ACHIEVEMENTS.filter((rule) => rule.earned(entries, bestStreak));
}
