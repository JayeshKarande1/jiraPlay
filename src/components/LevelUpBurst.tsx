import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTheme } from '../lib/activeTheme';
import { seededRandom } from '../lib/random';

export interface Burst {
  nonce: number;
  xp: number;
  /** The new level, when this completion levelled the hero up. */
  levelUp: number | null;
}

export function LevelUpBurst({ burst, color }: { burst?: Burst; color: string }) {
  return <AnimatePresence>{burst && <BurstEffect key={burst.nonce} burst={burst} color={color} />}</AnimatePresence>;
}

function BurstEffect({ burst, color }: { burst: Burst; color: string }) {
  const { words, confetti } = useTheme();
  const particles = useMemo(() => {
    if (burst.levelUp === null) return [];
    const random = seededRandom(burst.nonce);
    return Array.from({ length: 24 }, (_, i) => {
      const angle = (i / 24) * Math.PI * 2 + random() * 0.4;
      const distance = 70 + random() * 80;
      return {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance + 60,
        rotate: random() * 540,
        color: confetti[i % confetti.length],
      };
    });
  }, [burst.levelUp, burst.nonce, confetti]);

  return (
    <motion.div className="pointer-events-none absolute inset-0 z-20" exit={{ opacity: 0 }}>
      <motion.span
        className="absolute left-1/2 top-24 -translate-x-1/2 whitespace-nowrap font-pixel text-sm text-amber-300"
        initial={{ opacity: 0, y: 0 }}
        animate={{ opacity: [0, 1, 1, 0], y: -50 }}
        transition={{ duration: 1.4 }}
      >
        +{burst.xp} {words.xp}
      </motion.span>

      {burst.levelUp !== null && (
        <>
          <motion.div
            className="absolute inset-0 rounded-2xl"
            style={{ background: color }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.35, 0] }}
            transition={{ duration: 0.8 }}
          />
          <motion.div
            className="absolute inset-x-0 top-1/3 text-center"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.3, 1], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 2, scale: { duration: 0.5 } }}
          >
            <p className="font-pixel text-lg text-amber-300 [text-shadow:0_0_12px_var(--color-amber-400)]">{words.levelUp}</p>
            <p className="mt-2 font-pixel text-xs text-white">
              {words.level} {burst.levelUp}
            </p>
          </motion.div>
          {particles.map((p, i) => (
            <motion.span
              key={i}
              className="absolute left-1/2 top-1/3 size-2 rounded-sm"
              style={{ background: p.color }}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
              animate={{ x: p.x, y: p.y, opacity: 0, rotate: p.rotate }}
              transition={{ duration: 1.4, ease: 'easeOut' }}
            />
          ))}
        </>
      )}
    </motion.div>
  );
}
