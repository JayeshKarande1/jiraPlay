import { memo, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Quest } from '../../shared/types';
import { useTheme } from '../lib/activeTheme';
import { memberStats, sameMember, type Member } from '../../shared/heroes';
import { useQuestDrop } from '../lib/useQuestDrop';
import { byUrgency } from '../../shared/xp';
import { filterQuests, type QuestFilter } from '../../shared/boardFilter';
import { Hearts, HeroAvatar, XpBar } from './HeroBits';
import { LevelUpBurst, type Burst } from './LevelUpBurst';
import { NewQuestSlot } from './NewQuestSlot';
import { QuestItem } from './QuestItem';

interface Props {
  member: Member;
  /** Narrows the issue lists only. Level, XP and hearts stay true to the whole board. */
  filter: QuestFilter;
  selected: boolean;
  fresh: boolean;
  burst?: Burst;
  /** Handlers take ids, so the board can pass the same functions to every card. */
  onOpenHero: (memberId: string) => void;
  onOpenQuest: (quest: Quest) => void;
  onCompleteQuest: (quest: Quest) => void;
  onDropQuest: (key: string, memberId: string) => void;
  onCreateQuest: (memberId: string, summary: string) => Promise<boolean>;
}

/** Re-renders only when this card's own hero, issues or highlight change. */
export const CharacterCard = memo(
  function CharacterCard({ member, filter, selected, fresh, burst, onOpenHero, onOpenQuest, onCompleteQuest, onDropQuest, onCreateQuest }: Props) {
    const { hero, cls, isTavern, quests } = member;
    const theme = useTheme();
    const ref = useRef<HTMLElement>(null);
    const [showCleared, setShowCleared] = useState(false);
    const { hover, handlers } = useQuestDrop((key) => onDropQuest(key, hero.id));

    const stats = memberStats(member);
    const streak = member.progress?.streak ?? 0;
    const shown = filterQuests(quests, filter);
    const active = shown.filter((q) => !q.done).sort(byUrgency);
    const cleared = shown.filter((q) => q.done);
    const hidden = quests.length - shown.length;

    useEffect(() => {
      if (selected) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }, [selected]);

    const renderQuest = (quest: Quest) => <QuestItem key={quest.key} quest={quest} showStatus onOpen={onOpenQuest} onComplete={onCompleteQuest} />;

    return (
      <motion.section
        ref={ref}
        onClick={() => onOpenHero(hero.id)}
        {...handlers}
        animate={{ y: selected ? -10 : 0, scale: hover ? 1.03 : 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        title={`Open ${hero.name}'s issues`}
        className="relative flex w-72 cursor-pointer flex-col rounded-2xl border-2 bg-slate-950/85 p-4 backdrop-blur"
        style={{
          borderColor: selected || hover ? cls.color : `${cls.color}40`,
          boxShadow: selected ? `0 0 0 1px ${cls.color}, 0 12px 40px -8px ${cls.color}99` : fresh ? `0 0 24px -4px ${cls.color}` : 'none',
        }}
      >
        {selected && (
          <span className="absolute -top-7 left-1/2 -translate-x-1/2 animate-bounce font-pixel text-xs" style={{ color: cls.color }} aria-hidden>
            ▼
          </span>
        )}
        {fresh && (
          <span className="absolute -top-3 right-4 z-10 animate-bounce rounded-full bg-amber-400 px-2 py-1 font-pixel text-pixel-xs text-slate-950">
            {theme.words.newIssue}
          </span>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenHero(hero.id);
          }}
          aria-label={`Open ${hero.name}'s page`}
          className="absolute right-2 top-1.5 rounded px-1 py-0.5 font-pixel text-pixel-xs text-slate-400 hover:text-slate-100"
        >
          VIEW ▸
        </button>

        <div className="flex items-center gap-3">
          <HeroAvatar member={member} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold text-white">{hero.name}</h2>
            <p className="mt-1 font-pixel text-pixel-sm uppercase" style={{ color: cls.color }}>
              {cls.name}
            </p>
            {!isTavern && (
              <p className="mt-2 font-pixel text-xs text-amber-300">
                {theme.words.level} {stats.level}
              </p>
            )}
          </div>
        </div>

        {!isTavern && (
          <div className="mt-4">
            <XpBar stats={stats} color={cls.color} />
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-xs">
          {isTavern ? <span className="text-slate-400">Drag issues here to unassign</span> : <Hearts overdue={stats.overdue} />}
          <span className="shrink-0 text-slate-400">
            {theme.stageIcons.doing} {active.length} · ✔ {cleared.length}
            {streak >= 2 && (
              <span role="img" aria-label={`${streak}-day streak`} title={`${streak}-day streak`}>
                {' · '}
                <span aria-hidden>
                  {theme.uiIcons.streak}
                  {streak}
                </span>
              </span>
            )}
          </span>
        </div>

        <div className="mt-4 border-t border-slate-800 pt-3">
          <p className="mb-2 font-pixel text-pixel-sm text-slate-400">ISSUES</p>
          <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
            <AnimatePresence initial={false}>{active.map(renderQuest)}</AnimatePresence>
          </ul>
          {active.length === 0 && (
            <p className="py-3 text-center text-sm text-slate-400">{hidden > 0 ? 'None match the filter' : isTavern ? 'No unassigned issues' : theme.words.allDone}</p>
          )}
          {hidden > 0 && <p className="mt-2 text-center text-meta text-slate-400">{hidden} hidden by the filter</p>}

          {cleared.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                aria-expanded={showCleared}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCleared((v) => !v);
                }}
                className="font-pixel text-pixel-sm text-emerald-300 hover:text-emerald-200"
              >
                ✔ {cleared.length} DONE {showCleared ? '▴' : '▾'}
              </button>
              {showCleared && <ul className="mt-2 space-y-2">{cleared.map(renderQuest)}</ul>}
            </div>
          )}

          <NewQuestSlot onCreate={(summary) => onCreateQuest(hero.id, summary)} />
        </div>

        <LevelUpBurst burst={burst} color={cls.color} />
      </motion.section>
    );
  },
  (prev, next) =>
    sameMember(prev.member, next.member) &&
    prev.filter === next.filter &&
    prev.selected === next.selected &&
    prev.fresh === next.fresh &&
    prev.burst === next.burst &&
    prev.onOpenHero === next.onOpenHero &&
    prev.onOpenQuest === next.onOpenQuest &&
    prev.onCompleteQuest === next.onCompleteQuest &&
    prev.onDropQuest === next.onDropQuest &&
    prev.onCreateQuest === next.onCreateQuest,
);
