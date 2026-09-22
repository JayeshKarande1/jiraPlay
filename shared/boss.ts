import type { Quest, Sprint } from './types';
import { questXp } from './xp';

export interface BossState {
  /** The XP of every issue in the sprint. */
  maxHp: number;
  /** The XP of the issues still open. Finishing an issue deals its XP as damage. */
  hp: number;
  /** How much of the sprint has passed, from 0 to 1, or null without sprint dates. */
  elapsed: number | null;
  /** Late in the sprint with most of the work left. */
  enraged: boolean;
  defeated: boolean;
}

/** From this far into the sprint, a boss with more than half its HP left is enraged. */
const ENRAGE_AT = 0.75;

/** The sprint as a boss fight: its HP is the board's open work. */
export function bossState(quests: Quest[], sprint: Sprint | null, now: Date = new Date()): BossState {
  const maxHp = quests.reduce((sum, q) => sum + questXp(q), 0);
  const hp = quests.filter((q) => !q.done).reduce((sum, q) => sum + questXp(q), 0);

  let elapsed: number | null = null;
  if (sprint?.startDate && sprint.endDate) {
    const start = Date.parse(sprint.startDate);
    const end = Date.parse(sprint.endDate);
    if (end > start) elapsed = Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
  }

  const defeated = maxHp > 0 && hp === 0;
  return { maxHp, hp, elapsed, enraged: !defeated && elapsed !== null && elapsed >= ENRAGE_AT && hp > maxHp / 2, defeated };
}
