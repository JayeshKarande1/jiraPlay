import { memo, useMemo } from 'react';
import { seededRandom } from '../lib/random';

/**
 * The character's pixels, 12 wide and 13 tall. H hair, S skin, E eyes, M mouth, B tunic (class colour),
 * D emblem, C cape, P trousers, F boots.
 */
const TEMPLATE = [
  '....HHHH....',
  '...HHHHHH...',
  '..HHSSSSHH..',
  '...SESSES...',
  '...SSSSSS...',
  '....SMMS....',
  '..CBBBBBBC..',
  '.SCBBDDBBCS.',
  '.S.BBBBBB.S.',
  '...BBBBBB...',
  '...PP..PP...',
  '...PP..PP...',
  '..FFF..FFF..',
];

const HAIR = ['#2b1d14', '#5a3825', '#a0522d', '#d9a441', '#1f2937', '#e5e7eb', '#b91c1c', '#6d28d9', '#0e7490'];
const SKIN = ['#f5d0b5', '#e8b996', '#c68c5f', '#a0673f', '#7a4a2a', '#5c3a21'];
const TROUSERS = ['#1e293b', '#334155', '#3f2d20', '#1e3a5f', '#374151'];
const BOOTS = ['#111827', '#451a03', '#27272a'];

type HairStyle = 'short' | 'bald' | 'long' | 'hood';
const HAIR_STYLES: HairStyle[] = ['short', 'bald', 'long', 'hood'];

function hashOf(id: string): number {
  let hash = 2166136261;
  for (const ch of id) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

interface Pixel {
  x: number;
  y: number;
  fill: string;
  opacity?: number;
}

/** Builds a hero's pixels. The same id always gives the same look; the tunic takes the class colour. */
function spritePixels(id: string, color: string): Pixel[] {
  const random = seededRandom(hashOf(id));
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];
  const hair = pick(HAIR);
  const skin = pick(SKIN);
  const style = pick(HAIR_STYLES);
  const hasCape = random() < 0.5;
  const hasEmblem = random() < 0.6;
  const fills: Record<string, string | null> = {
    H: style === 'bald' ? null : style === 'hood' ? color : hair,
    S: skin,
    E: '#0f172a',
    M: '#7f1d1d',
    B: color,
    D: hasEmblem ? '#fbbf24' : color,
    C: hasCape ? color : null,
    P: pick(TROUSERS),
    F: pick(BOOTS),
  };

  const pixels: Pixel[] = [];
  TEMPLATE.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      // Long hair and hoods frame the face.
      const framesFace = (style === 'long' || style === 'hood') && (y === 3 || y === 4) && (x === 2 || x === 9);
      const fill = framesFace ? fills.H : cell === '.' ? null : fills[cell];
      if (!fill) return;
      pixels.push({ x, y, fill, opacity: cell === 'C' ? 0.6 : undefined });
    });
  });
  // A dark outline on the tunic's lower edge gives the body some depth.
  pixels.push({ x: 3, y: 9, fill: '#000000', opacity: 0.25 }, { x: 8, y: 9, fill: '#000000', opacity: 0.25 });
  return pixels;
}

interface SpriteProps {
  /** Seeds the look; the same id always draws the same character. */
  id: string;
  color: string;
  /** Head and shoulders only, square, for avatars. */
  portrait?: boolean;
  className?: string;
}

/**
 * A small pixel-art character generated from the hero's id, so each teammate always looks the same, dressed in
 * their class colour. It's the default avatar when Jira has no photo. Decorative: the name is always shown nearby.
 */
export const HeroSprite = memo(function HeroSprite({ id, color, portrait = false, className }: SpriteProps) {
  const pixels = useMemo(() => spritePixels(id, color), [id, color]);
  return (
    <svg viewBox={portrait ? '1 0 10 10' : '0 0 12 13'} className={className} shapeRendering="crispEdges" aria-hidden focusable="false">
      {pixels.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={1.02} height={1.02} fill={p.fill} fillOpacity={p.opacity} />
      ))}
    </svg>
  );
});
