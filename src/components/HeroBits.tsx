import { useState } from 'react';
import { motion } from 'motion/react';
import { avatarSeed, useAvatarChoice, variantOf } from '../lib/avatarChoice';
import { useTheme } from '../lib/activeTheme';
import type { Member } from '../../shared/heroes';
import { HeroSprite } from './HeroSprite';
import type { HeroStats } from '../../shared/xp';

const AVATAR_SIZES = {
  xs: { box: 'size-6 rounded border-2', initials: 'text-pixel-xs', emoji: 'text-xs', badge: 'hidden' },
  sm: { box: 'size-10 rounded-md border-2', initials: 'text-pixel-md', emoji: 'text-lg', badge: '-bottom-1.5 -right-1.5 size-5 text-pixel-md' },
  md: { box: 'size-16 rounded-lg border-4', initials: 'text-base', emoji: 'text-3xl', badge: '-bottom-2 -right-2 size-7 text-sm' },
  lg: { box: 'size-24 rounded-xl border-4', initials: 'text-2xl', emoji: 'text-5xl', badge: '-bottom-2 -right-2 size-9 text-lg' },
};

/**
 * A hero's picture: the avatar they picked, else their Jira photo, else (no photo, or it didn't load) their
 * generated pixel character. Jira photos from the site itself need a login, so they often fail outside Jira.
 */
export function HeroAvatar({ member, size = 'md' }: { member: Member; size?: keyof typeof AVATAR_SIZES }) {
  const { hero, cls, isTavern } = member;
  const s = AVATAR_SIZES[size];
  const choice = useAvatarChoice(hero.id);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const jiraPhoto = choice === null && hero.avatarUrl && failedUrl !== hero.avatarUrl ? hero.avatarUrl : null;
  const photo = choice && 'image' in choice ? choice.image : jiraPhoto;
  return (
    <div className="relative shrink-0">
      <div className={`grid place-items-center overflow-hidden ${s.box}`} style={{ borderColor: cls.color, background: `${cls.color}22` }}>
        {photo ? (
          <img src={photo} alt="" className="size-full object-cover" onError={() => setFailedUrl(photo)} />
        ) : isTavern ? (
          <span className={s.emoji}>{cls.icon}</span>
        ) : (
          <HeroSprite id={avatarSeed(hero.id, variantOf(choice))} color={cls.color} portrait className="size-full" />
        )}
      </div>
      {!isTavern && (
        <span
          className={`absolute grid place-items-center rounded-full border-2 bg-slate-950 ${s.badge}`}
          style={{ borderColor: cls.color }}
          title={cls.name}
        >
          {cls.icon}
        </span>
      )}
    </div>
  );
}

interface XpBarProps {
  stats: HeroStats;
  color: string;
  showLabels?: boolean;
  /** Height class for the bar. */
  height?: string;
}

export function XpBar({ stats, color, showLabels = true, height = 'h-3' }: XpBarProps) {
  const { words } = useTheme();
  return (
    <div>
      {showLabels && (
        <div className="mb-1 flex justify-between font-pixel text-pixel-xs text-slate-400">
          <span>
            {words.xp} {stats.xp}
          </span>
          <span>
            {stats.toNext} TO {words.level} {stats.level + 1}
          </span>
        </div>
      )}
      <div className={`overflow-hidden rounded-sm border border-slate-700 bg-slate-800 ${height}`}>
        <motion.div
          className="xp-segments h-full"
          style={{ backgroundColor: color }}
          initial={false}
          animate={{ width: `${stats.progress * 100}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
    </div>
  );
}

const MAX_HEARTS = 4;

/** One heart is lost for each overdue quest. */
export function Hearts({ overdue }: { overdue: number }) {
  const { heart } = useTheme();
  const hearts = MAX_HEARTS - Math.min(overdue, MAX_HEARTS);
  return (
    <span className="tracking-widest" role="img" aria-label={`${hearts} of ${MAX_HEARTS} hearts, ${overdue} overdue`} title={`${overdue} overdue`}>
      {Array.from({ length: MAX_HEARTS }, (_, i) => (
        <span key={i} aria-hidden className={i < hearts ? 'text-rose-500' : 'text-slate-600'}>
          {heart}
        </span>
      ))}
    </span>
  );
}
