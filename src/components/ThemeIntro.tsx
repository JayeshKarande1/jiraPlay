import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTheme } from '../lib/activeTheme';
import { seededRandom } from '../lib/random';
import type { IntroBackdrop, IntroPath, Theme } from '../../shared/themes';

const INTRO_MS = 2000;
/** How long the sprite takes to cross the screen, in seconds. */
const TRAVEL_S = 1.6;
const PATH_SAMPLES = 24;
const TRAIL_LENGTH = 10;

/** Where the sprite is at t (0 to 1), as [vw, vh]. */
const PATHS: Record<IntroPath, (t: number) => [number, number]> = {
  ltr: (t) => [-10 + 120 * t, 74],
  rtl: (t) => [110 - 120 * t, 74],
  hop: (t) => [-10 + 120 * t, 74 - 8 * Math.abs(Math.sin(t * Math.PI * 6))],
  diagonal: (t) => [-10 + 120 * t, 110 - 130 * t],
  arc: (t) => [-10 + 120 * t, 72 - 45 * Math.sin(Math.PI * t)],
};

const between = (random: () => number, min: number, max: number) => min + random() * (max - min);

/** Plays a short full-screen intro whenever the theme changes (not on the first load). */
export function ThemeIntro() {
  const theme = useTheme();
  const [intro, setIntro] = useState<{ theme: Theme; nonce: number } | null>(null);
  const previous = useRef(theme.id);

  useEffect(() => {
    if (previous.current === theme.id) return;
    previous.current = theme.id;
    const nonce = Date.now();
    setIntro({ theme, nonce });
    const timer = setTimeout(() => setIntro((current) => (current?.nonce === nonce ? null : current)), INTRO_MS);
    return () => clearTimeout(timer);
  }, [theme]);

  return (
    <AnimatePresence>{intro && <Intro key={intro.nonce} seed={intro.nonce} theme={intro.theme} onSkip={() => setIntro(null)} />}</AnimatePresence>
  );
}

function Intro({ theme, seed, onSkip }: { theme: Theme; seed: number; onSkip: () => void }) {
  const reduced = useReducedMotion();
  const [background, accent, accent2] = theme.swatch;
  const { sprite, path, trail, backdrop, spin } = theme.intro;
  const points = useMemo(() => Array.from({ length: PATH_SAMPLES + 1 }, (_, i) => PATHS[path](i / PATH_SAMPLES)), [path]);

  return (
    <motion.div
      role="status"
      aria-live="polite"
      aria-label={`Loading the ${theme.name} theme`}
      onClick={onSkip}
      className="fixed inset-0 z-[70] grid cursor-pointer place-items-center overflow-hidden"
      style={{ background }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {!reduced && <Backdrop kind={backdrop} seed={seed} accent={accent} accent2={accent2} />}

      <div className="relative px-6 text-center">
        <motion.div
          className="text-6xl sm:text-7xl"
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 14 }}
        >
          {theme.icon}
        </motion.div>
        <motion.p
          className="mt-5 break-words text-3xl text-white sm:text-5xl"
          style={{ fontFamily: theme.font, textShadow: `0 0 24px ${accent}` }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          {theme.name}
        </motion.p>
        <motion.p className="mt-3 text-sm text-white/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          {theme.tagline}
        </motion.p>
        <div className="mx-auto mt-6 h-1.5 w-56 max-w-full overflow-hidden rounded-full bg-white/15">
          <motion.div
            className="h-full"
            style={{ background: accent }}
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: INTRO_MS / 1000 - 0.3, ease: 'easeInOut' }}
          />
        </div>
      </div>

      {!reduced &&
        trail &&
        Array.from({ length: TRAIL_LENGTH }, (_, i) => {
          const t = (i + 1) / (TRAIL_LENGTH + 1);
          const [x, y] = PATHS[path](t);
          return (
            <motion.span
              key={i}
              aria-hidden
              className="pointer-events-none absolute -ml-4 -mt-4 text-3xl"
              style={{ left: `${x}vw`, top: `${y}vh` }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 1, 0], scale: [0, 1.2, 0.6] }}
              transition={{ duration: 0.7, delay: 0.1 + TRAVEL_S * t }}
            >
              {trail}
            </motion.span>
          );
        })}

      {!reduced && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 -ml-10 -mt-10 grid size-20 place-items-center text-7xl"
          initial={{ x: `${points[0][0]}vw`, y: `${points[0][1]}vh` }}
          animate={{ x: points.map(([x]) => `${x}vw`), y: points.map(([, y]) => `${y}vh`), rotate: spin ? 720 : 0 }}
          transition={{ duration: TRAVEL_S, ease: 'linear', delay: 0.1 }}
        >
          {sprite}
        </motion.span>
      )}
    </motion.div>
  );
}

function Backdrop({ kind, seed, accent, accent2 }: { kind: IntroBackdrop; seed: number; accent: string; accent2: string }) {
  const specks = useMemo(() => {
    const random = seededRandom(seed);
    return Array.from({ length: 28 }, () => ({
      x: between(random, 0, 100),
      y: between(random, 0, 100),
      duration: between(random, 0.35, 0.8),
      delay: between(random, 0, 1),
      color: random() < 0.5 ? accent : accent2,
    }));
  }, [seed, accent, accent2]);

  switch (kind) {
    case 'glow':
      return (
        <motion.div
          className="absolute inset-0"
          style={{ background: `radial-gradient(circle at 50% 50%, ${accent}40, transparent 60%)` }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      );

    case 'warp':
      return <SpeedLines specks={specks} />;

    case 'sirens':
      return (
        <>
          <motion.div
            className="absolute inset-y-0 left-0 w-1/2"
            style={{ background: 'radial-gradient(circle at 30% 20%, rgba(239, 68, 68, 0.55), transparent 60%)' }}
            animate={{ opacity: [1, 0.1, 1] }}
            transition={{ duration: 0.5, repeat: Infinity }}
          />
          <motion.div
            className="absolute inset-y-0 right-0 w-1/2"
            style={{ background: 'radial-gradient(circle at 70% 20%, rgba(59, 130, 246, 0.55), transparent 60%)' }}
            animate={{ opacity: [0.1, 1, 0.1] }}
            transition={{ duration: 0.5, repeat: Infinity }}
          />
        </>
      );

    case 'sparkles':
      return (
        <>
          {specks.map((s, i) => (
            <motion.span
              key={i}
              className="absolute size-1.5 rounded-full"
              style={{ left: `${s.x}%`, top: `${s.y}%`, background: s.color, boxShadow: `0 0 12px 3px ${s.color}` }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 1, 0], scale: [0, 1, 0] }}
              transition={{ duration: s.duration * 2, delay: s.delay, repeat: Infinity }}
            />
          ))}
        </>
      );

    case 'glitch':
      return (
        <>
          {specks.slice(0, 10).map((s, i) => (
            <motion.div
              key={i}
              className="absolute inset-x-0"
              style={{ top: `${s.y}%`, height: `${2 + (i % 4) * 4}px`, background: s.color, mixBlendMode: 'screen' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.9, 0], x: ['0%', '-4%', '3%'] }}
              transition={{ duration: 0.25, delay: s.delay, repeat: Infinity, repeatDelay: s.duration }}
            />
          ))}
        </>
      );

    case 'blocks':
      return <FallingBlocks seed={seed} />;

    case 'chequered':
      return (
        <>
          <SpeedLines specks={specks.map((s) => ({ ...s, color: '#ffffff' }))} />
          {['top-0', 'bottom-0'].map((edge) => (
            <motion.div
              key={edge}
              className={`absolute left-0 h-10 w-[200%] ${edge}`}
              style={{ background: 'conic-gradient(#f4f4f5 25%, #111214 0 50%, #f4f4f5 0 75%, #111214 0)', backgroundSize: '40px 40px' }}
              animate={{ x: ['0%', '-50%'] }}
              transition={{ duration: 1.2, ease: 'linear', repeat: Infinity }}
            />
          ))}
        </>
      );
  }
}

interface Speck {
  y: number;
  duration: number;
  delay: number;
  color: string;
}

/** Streaks rushing from right to left, so the sprite looks fast. */
function SpeedLines({ specks }: { specks: Speck[] }) {
  return (
    <>
      {specks.map((s, i) => (
        <motion.span
          key={i}
          className="absolute left-0 h-0.5 w-32 rounded-full"
          style={{ top: `${s.y}%`, background: `linear-gradient(90deg, transparent, ${s.color})` }}
          initial={{ x: '110vw' }}
          animate={{ x: '-30vw' }}
          transition={{ duration: s.duration, delay: s.delay * 0.5, ease: 'linear', repeat: Infinity }}
        />
      ))}
    </>
  );
}

const BLOCK_COLUMNS = 16;
const BLOCK_ROWS = [
  { color: '#7a7a7a', edge: '#5a5a5a' },
  { color: '#6b4f35', edge: '#4f3a27' },
  { color: '#5d9c3a', edge: '#4a7d2e' },
];

/** Stone, dirt and grass blocks dropping into place along the bottom of the screen. */
function FallingBlocks({ seed }: { seed: number }) {
  const delays = useMemo(() => {
    const random = seededRandom(seed);
    return BLOCK_ROWS.map(() => Array.from({ length: BLOCK_COLUMNS }, () => between(random, 0, 0.9)));
  }, [seed]);
  const size = 100 / BLOCK_COLUMNS;
  return (
    <>
      {BLOCK_ROWS.map((row, r) =>
        delays[r].map((delay, c) => (
          <motion.div
            key={`${r}-${c}`}
            className="absolute"
            style={{
              left: `${c * size}vw`,
              bottom: `${r * size}vw`,
              width: `${size}vw`,
              height: `${size}vw`,
              background: row.color,
              boxShadow: `inset -4px -4px 0 ${row.edge}, inset 4px 4px 0 rgba(255, 255, 255, 0.12)`,
            }}
            initial={{ y: '-110vh' }}
            animate={{ y: 0 }}
            transition={{ duration: 0.45, delay: delay + r * 0.25, ease: 'easeIn' }}
          />
        )),
      )}
    </>
  );
}
