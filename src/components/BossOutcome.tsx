import { useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useTheme } from '../lib/activeTheme';
import { useDialog } from '../lib/useDialog';
import { seededRandom } from '../lib/random';

export type BossOutcomeKind = 'victory' | 'defeat';

export interface BossOutcomeState {
  kind: BossOutcomeKind;
  /** The sprint's name, or null on a board without one. */
  sprintName: string | null;
  /** Who landed the last blow and how hard, when known. */
  finalBlow: { name: string; xp: number; key: string } | null;
  /** What the boss had left when the sprint ended. */
  hpLeft: number;
  maxHp: number;
  nonce: number;
}

interface Props {
  outcome: BossOutcomeState;
  onRecap: () => void;
  onClose: () => void;
}

/**
 * The end of the boss fight, as a scene: a victory when the last issue lands, or a defeat when the sprint runs
 * out first. Both lead into the recap, which is where the story of the sprint is.
 */
export function BossOutcome({ outcome, onRecap, onClose }: Props) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const ref = useDialog<HTMLDivElement>();
  const won = outcome.kind === 'victory';
  const color = won ? 'var(--color-amber-400)' : 'var(--color-rose-400)';

  const pieces = useMemo(() => {
    const random = seededRandom(outcome.nonce);
    return Array.from({ length: 50 }, (_, i) => ({
      left: random() * 100,
      drift: (random() - 0.5) * 30,
      rotate: random() * 720,
      size: 6 + random() * 6,
      delay: random() * 0.6,
      duration: 1.6 + random() * 1,
      color: theme.confetti[i % theme.confetti.length],
    }));
  }, [outcome.nonce, theme.confetti]);

  return (
    <motion.div
      className="fixed inset-0 z-[60] grid place-items-center overflow-hidden bg-slate-950/85 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at 50% 40%, color-mix(in srgb, ${color} 35%, transparent), transparent 60%)` }} />
      {won &&
        !reduced &&
        pieces.map((p, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="pointer-events-none absolute top-0 rounded-sm"
            style={{ left: `${p.left}vw`, width: p.size, height: p.size * 0.6, background: p.color }}
            initial={{ y: '-5vh', x: 0, rotate: 0 }}
            animate={{ y: '105vh', x: `${p.drift}vw`, rotate: p.rotate }}
            transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
          />
        ))}

      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="outcome-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="relative w-full max-w-md rounded-2xl border-2 bg-slate-950 p-6 text-center"
        style={{ borderColor: color, boxShadow: `0 0 60px -10px ${color}` }}
      >
        <motion.p
          aria-hidden
          className="text-6xl"
          animate={won ? { rotate: [0, 90], opacity: [1, 0.5], scale: [1, 0.8] } : reduced ? {} : { scale: [1, 1.15, 1] }}
          transition={won ? { delay: 0.4, duration: 0.6 } : { duration: 1, repeat: Infinity }}
        >
          {theme.boss.icon}
        </motion.p>
        <p className="mt-3 font-pixel text-pixel-sm uppercase tracking-widest text-slate-400">{outcome.sprintName ?? 'This board'}</p>
        <h2 id="outcome-title" className="mt-2 font-pixel text-2xl sm:text-3xl" style={{ color, textShadow: `0 0 20px ${color}` }}>
          {won ? 'VICTORY' : 'THE BOSS ESCAPED'}
        </h2>
        <p className="mt-3 text-sm text-slate-300">
          {won ? (
            <>
              <span className="text-white">{theme.boss.name}</span> is down. Every issue in the {outcome.sprintName ? 'sprint' : 'board'} is done.
            </>
          ) : (
            <>
              The sprint ended with <span className="text-white">{theme.boss.name}</span> still at{' '}
              <span className="text-rose-300">
                {outcome.hpLeft.toLocaleString()} of {outcome.maxHp.toLocaleString()} HP
              </span>
              . The open issues carry over; so does the {theme.words.xp} you earned.
            </>
          )}
        </p>
        {outcome.finalBlow && (
          <p className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
            {won ? 'Final blow' : 'Last blow'}: <span className="text-white">{outcome.finalBlow.name}</span> with{' '}
            <span className="font-mono text-slate-400">{outcome.finalBlow.key}</span>{' '}
            <span className="text-amber-300">
              −{outcome.finalBlow.xp} {theme.words.xp}
            </span>
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            data-autofocus
            onClick={onRecap}
            className="rounded-lg bg-amber-400 px-4 py-2 font-pixel text-pixel-md text-slate-950 transition-transform hover:scale-105"
          >
            ▤ SPRINT RECAP
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 font-pixel text-pixel-md text-slate-300 hover:border-slate-500">
            {won ? 'CELEBRATE LATER' : 'ONWARDS'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
