import { useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTheme } from '../lib/activeTheme';
import { seededRandom } from '../lib/random';

export interface LevelUpCelebration {
  nonce: number;
  name: string;
  level: number;
  color: string;
}

/** A full-screen level-up: a flash in the hero's colour, confetti raining down and the new level. */
export function LevelUpScreen({ celebration }: { celebration: LevelUpCelebration | null }) {
  return <AnimatePresence>{celebration && <Screen key={celebration.nonce} celebration={celebration} />}</AnimatePresence>;
}

function Screen({ celebration }: { celebration: LevelUpCelebration }) {
  const { words, confetti } = useTheme();
  const reduced = useReducedMotion();
  const pieces = useMemo(() => {
    const random = seededRandom(celebration.nonce);
    return Array.from({ length: 70 }, (_, i) => ({
      left: random() * 100,
      drift: (random() - 0.5) * 30,
      rotate: random() * 720,
      size: 6 + random() * 6,
      delay: random() * 0.4,
      duration: 1.4 + random() * 0.8,
      color: confetti[i % confetti.length],
    }));
  }, [celebration.nonce, confetti]);

  return (
    <motion.div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-[65] grid place-items-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.div
        className="absolute inset-0"
        style={{ background: `radial-gradient(circle at 50% 45%, ${celebration.color}66, transparent 65%)` }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0.5] }}
        transition={{ duration: 0.9 }}
      />
      {!reduced &&
        pieces.map((p, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute top-0 rounded-sm"
            style={{ left: `${p.left}vw`, width: p.size, height: p.size * 0.6, background: p.color }}
            initial={{ y: '-5vh', x: 0, rotate: 0 }}
            animate={{ y: '105vh', x: `${p.drift}vw`, rotate: p.rotate }}
            transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
          />
        ))}
      <motion.div className="relative px-6 text-center" initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: [0.2, 1.25, 1], opacity: 1 }} transition={{ duration: 0.55 }}>
        <p className="font-pixel text-4xl text-amber-300 [text-shadow:0_0_24px_var(--color-amber-400),0_6px_0_rgba(0,0,0,0.6)] sm:text-6xl">{words.levelUp}</p>
        <p className="mt-4 font-pixel text-lg text-white sm:text-2xl" style={{ textShadow: `0 0 18px ${celebration.color}` }}>
          {celebration.name} · {words.level} {celebration.level}
        </p>
      </motion.div>
    </motion.div>
  );
}
