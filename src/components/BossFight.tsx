import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Quest, Sprint } from '../../shared/types';
import { bossState } from '../../shared/boss';
import { useTheme } from '../lib/activeTheme';

/** The last blow, so the boss flinches and shows the damage. */
export interface BossHit {
  nonce: number;
  damage: number;
}

/** The sprint as a boss fight: the HP bar is the sprint's open work, and finishing issues deals damage. */
export function BossFight({ quests, sprint, hit }: { quests: Quest[]; sprint: Sprint | null; hit?: BossHit }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const boss = bossState(quests, sprint);
  const ratio = boss.maxHp ? boss.hp / boss.maxHp : 0;
  const cleared = quests.filter((q) => q.done).length;
  const status = boss.defeated ? 'DEFEATED' : boss.enraged ? 'ENRAGED' : null;

  return (
    <section aria-label="Sprint boss" className="relative mt-5 max-w-2xl rounded-xl border border-slate-700 bg-slate-950/60 p-3">
      <div className="flex items-center gap-3">
        <motion.span
          key={hit?.nonce ?? 'idle'}
          aria-hidden
          className="grid size-14 shrink-0 place-items-center text-4xl"
          animate={
            boss.defeated
              ? { rotate: 90, opacity: 0.5, scale: 0.85 }
              : hit && !reduced
                ? { x: [0, -8, 8, -5, 5, 0], scale: [1, 0.9, 1] }
                : boss.enraged && !reduced
                  ? { scale: [1, 1.1, 1] }
                  : {}
          }
          transition={boss.enraged && !hit ? { duration: 0.8, repeat: Infinity } : { duration: 0.45 }}
        >
          {boss.defeated ? '💀' : theme.boss.icon}
        </motion.span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="font-pixel text-pixel-sm uppercase text-slate-300">
              {sprint ? 'Sprint boss' : 'Board boss'} · <span className="text-white">{theme.boss.name}</span>
            </p>
            {status && (
              <span className={`font-pixel text-pixel-xs ${boss.defeated ? 'text-emerald-300' : 'animate-pulse text-rose-300'}`}>{status}</span>
            )}
          </div>
          <div
            role="progressbar"
            aria-label={`${theme.boss.name} HP`}
            aria-valuemin={0}
            aria-valuemax={boss.maxHp}
            aria-valuenow={boss.hp}
            aria-valuetext={`${boss.hp} of ${boss.maxHp} HP left`}
            className="mt-2 h-4 overflow-hidden rounded border border-slate-700 bg-slate-800"
          >
            <motion.div
              className="xp-segments h-full"
              style={{ background: boss.enraged ? 'linear-gradient(90deg, #be123c, #f43f5e)' : 'linear-gradient(90deg, #b91c1c, #ef4444)' }}
              initial={false}
              animate={{ width: `${ratio * 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap justify-between gap-x-4 font-pixel text-pixel-xs text-slate-400">
            <span>
              HP {boss.hp}/{boss.maxHp}
            </span>
            <span>
              {cleared}/{quests.length} DONE{boss.elapsed !== null && ` · SPRINT ${Math.round(boss.elapsed * 100)}% OVER`}
            </span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {hit && !boss.defeated && (
          <motion.span
            key={hit.nonce}
            aria-hidden
            className="pointer-events-none absolute left-10 top-0 font-pixel text-sm text-rose-300"
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: [0, 1, 0], y: -28 }}
            transition={{ duration: 1.1 }}
          >
            -{hit.damage}
          </motion.span>
        )}
      </AnimatePresence>
    </section>
  );
}
