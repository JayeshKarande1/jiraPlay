import { motion } from 'motion/react';
import type { Quest, Sprint } from '../../shared/types';
import { useTheme } from '../lib/activeTheme';
import { daysUntil } from '../../shared/xp';
import { BossFight, type BossHit } from './BossFight';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function timeLeft(endDate: string) {
  const days = daysUntil(endDate);
  if (days < 0) return { text: `Ended ${-days}d ago`, tone: 'text-rose-400' };
  if (days === 0) return { text: 'Final day!', tone: 'text-rose-400' };
  if (days <= 2) return { text: `${days}d left`, tone: 'text-amber-300' };
  return { text: `${days} days left`, tone: 'text-emerald-300' };
}

interface Props {
  sprints: Sprint[];
  quests: Quest[];
  partyXp: number;
  hit?: BossHit;
  nameOf?: (assigneeId: string | null) => string | undefined;
}

export function SprintBanner({ sprints, quests, partyXp, hit, nameOf }: Props) {
  const { words } = useTheme();
  const [sprint, ...others] = sprints;
  const left = sprint?.endDate ? timeLeft(sprint.endDate) : null;

  return (
    <section className="min-w-0 flex-1">
      <p className="font-pixel text-pixel-sm tracking-[0.3em] text-slate-400">{sprint ? 'CURRENT SPRINT' : 'BOARD'}</p>
      <motion.h1
        key={sprint?.id ?? 'none'}
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="theme-title mt-3 break-words font-pixel text-xl leading-tight text-white sm:text-4xl xl:text-5xl"
      >
        {sprint?.name ?? 'No active sprint'}
      </motion.h1>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
        {sprint?.startDate && sprint.endDate && (
          <span>
            📅 {formatDate(sprint.startDate)} → {formatDate(sprint.endDate)}
          </span>
        )}
        {left && <span className={`font-medium ${left.tone}`}>⏳ {left.text}</span>}
        <span className="font-pixel text-pixel-sm uppercase text-amber-300">
          {words.party} {words.xp} {partyXp.toLocaleString()}
        </span>
        {others.length > 0 && <span>Also active: {others.map((s) => s.name).join(', ')}</span>}
      </div>
      {sprint?.goal && <p className="mt-2 max-w-3xl text-slate-300">🎯 {sprint.goal}</p>}

      <BossFight quests={quests} sprint={sprint ?? null} hit={hit} nameOf={nameOf} />
    </section>
  );
}
