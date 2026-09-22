import { useMemo, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { BoardColumn, Quest } from '../../shared/types';
import { useTheme } from '../lib/activeTheme';
import { avatarSeed, useAvatarChoice, variantOf } from '../lib/avatarChoice';
import { CLASS_BEHAVIOURS, ISSUES_TO_EARN_CLASS, memberStats, type Member } from '../../shared/heroes';
import { columnColors, columnIndexFor } from '../../shared/stages';
import { byUrgency } from '../../shared/xp';
import { AchievementBadges } from './AchievementBadges';
import { Hearts, HeroAvatar, XpBar } from './HeroBits';
import { HeroSprite } from './HeroSprite';
import { LevelUpBurst, type Burst } from './LevelUpBurst';
import { NewQuestSlot } from './NewQuestSlot';
import { QuestItem } from './QuestItem';

interface Props {
  member: Member;
  /** The Jira board's columns. */
  columns: BoardColumn[];
  boardName: string | null;
  index: number;
  total: number;
  burst?: Burst;
  onStep: (step: number) => void;
  onBack: () => void;
  onOpenQuest: (quest: Quest) => void;
  onCompleteQuest: (quest: Quest) => void;
  onCreateQuest: (summary: string) => Promise<boolean>;
}

export function HeroFocus({ member, columns, boardName, index, total, burst, onStep, onBack, onOpenQuest, onCompleteQuest, onCreateQuest }: Props) {
  const { hero, cls, isTavern, quests, progress } = member;
  const theme = useTheme();
  const { words } = theme;
  const stats = memberStats(member);
  const avatarChoice = useAvatarChoice(hero.id);
  const classSlot = theme.classes.indexOf(cls);
  const colors = useMemo(() => columnColors(columns), [columns]);
  const byColumn = useMemo(() => {
    const lists = columns.map((): Quest[] => []);
    for (const quest of quests) lists[columnIndexFor(quest, columns)]?.push(quest);
    return lists.map((list) => list.sort(byUrgency));
  }, [quests, columns]);

  return (
    <motion.div key={hero.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} className="mx-auto max-w-7xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="font-pixel text-pixel-sm uppercase text-slate-400 hover:text-white">
          ◀ Whole {words.party}
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onStep(-1)}
            aria-label={`Previous ${words.hero}`}
            className="grid size-9 place-items-center rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500"
          >
            ◀
          </button>
          <span className="font-pixel text-pixel-sm uppercase text-slate-400">
            {words.hero} {index + 1} / {total}
          </span>
          <button
            type="button"
            onClick={() => onStep(1)}
            aria-label={`Next ${words.hero}`}
            className="grid size-9 place-items-center rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500"
          >
            ▶
          </button>
        </div>
      </div>

      <section className="relative rounded-2xl border-2 bg-slate-950/85 p-6" style={{ borderColor: cls.color, boxShadow: `0 12px 48px -16px ${cls.color}88` }}>
        <div className="flex flex-wrap items-center gap-6">
          {!isTavern && (
            <motion.div
              className="hidden sm:block"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              style={{ filter: `drop-shadow(0 8px 12px ${cls.color}55)` }}
            >
              <HeroSprite id={avatarSeed(hero.id, variantOf(avatarChoice))} color={cls.color} className="h-28 w-26" />
            </motion.div>
          )}
          <HeroAvatar member={member} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-2xl font-semibold text-white sm:text-3xl">{hero.name}</h2>
            <p className="mt-2 font-pixel text-pixel-md uppercase" style={{ color: cls.color }}>
              {cls.icon} {cls.name}
            </p>
            {!isTavern && (
              <p className="mt-3 font-pixel text-lg text-amber-300">
                {words.level} {stats.level}
              </p>
            )}
          </div>
          <dl className="flex flex-wrap gap-2 text-center">
            {columns.map((column, i) => (
              <div
                key={`${column.name}-${i}`}
                className="min-w-20 rounded-xl border px-3 py-2"
                style={{
                  borderColor: `color-mix(in srgb, ${colors[i]} 35%, transparent)`,
                  background: `color-mix(in srgb, ${colors[i]} 8%, transparent)`,
                }}
              >
                <dt className="font-pixel text-pixel-xs uppercase" style={{ color: colors[i] }}>
                  {column.name}
                </dt>
                <dd className="mt-2 font-pixel text-lg text-white">{byColumn[i].length}</dd>
              </div>
            ))}
          </dl>
        </div>

        {!isTavern && (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <XpBar stats={stats} color={cls.color} height="h-4" />
              <Hearts overdue={stats.overdue} />
            </div>

            <div className="mt-5 grid gap-5 border-t border-slate-800 pt-4 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="space-y-1 text-sm text-slate-300">
                <p>
                  🔥 {progress?.streak ?? 0}-day streak <span className="text-slate-400">· best {progress?.bestStreak ?? 0}</span>
                </p>
                <p>
                  {progress?.sprintXp ?? 0} {words.xp} this sprint · {progress?.completed ?? 0} issues finished in total
                </p>
                <p className="text-slate-400">
                  {member.earnedClass
                    ? `${cls.name}, earned because this ${words.hero} ${CLASS_BEHAVIOURS[classSlot]?.toLowerCase() ?? 'works hard'}.`
                    : `Finish ${ISSUES_TO_EARN_CLASS} issues to earn a class that matches your work.`}
                </p>
              </div>
              <AchievementBadges earned={progress?.achievements ?? []} />
            </div>
          </>
        )}

        <LevelUpBurst burst={burst} color={cls.color} />
      </section>

      {/* Scrolls sideways when the board has more columns than fit. The padding keeps column glows from being clipped. */}
      <div className="-mx-2 mt-6 flex items-start gap-4 overflow-x-auto px-2 pb-3 pt-1">
        {columns.map((column, i) => {
          const list = byColumn[i];
          return (
            <section
              key={`${column.name}-${i}`}
              className={`stage-column stage-${column.stage} min-w-64 flex-1 rounded-2xl p-4`}
              style={{ '--stage': colors[i] } as CSSProperties}
            >
              <h3 className="stage-header flex items-center justify-between gap-2 font-pixel text-pixel-sm uppercase">
                <span className="min-w-0 break-words">
                  <span className="stage-icon">{theme.stageIcons[column.stage]}</span> {column.name}
                </span>
                <span className="shrink-0 rounded px-2 py-1 text-slate-950" style={{ background: colors[i] }}>
                  {list.length}
                </span>
              </h3>
              <div className="stage-bar mb-3 mt-3" />
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {list.map((quest) => (
                    <QuestItem key={quest.key} quest={quest} onOpen={onOpenQuest} onComplete={onCompleteQuest} />
                  ))}
                </AnimatePresence>
              </ul>
              {list.length === 0 && <p className="py-4 text-center text-sm text-slate-400">Nothing here</p>}
              {i === 0 && <NewQuestSlot onCreate={onCreateQuest} />}
            </section>
          );
        })}
      </div>
      {boardName && <p className="mt-1 text-right text-xs text-slate-400">Columns from your Jira board: {boardName}</p>}
    </motion.div>
  );
}
