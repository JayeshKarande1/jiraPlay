import { memo } from 'react';
import { motion } from 'motion/react';
import type { Quest } from '../../shared/types';
import { useTheme } from '../lib/activeTheme';
import { KINDS } from '../../shared/kinds';
import { STAGES } from '../../shared/stages';
import { QUEST_DRAG_TYPE } from '../lib/useQuestDrop';
import { difficultySource, dueInDays, dueLabel, isOverdue, MAX_STARS, questStars, questXp } from '../../shared/xp';
import type { Member } from '../../shared/heroes';
import { HeroAvatar } from './HeroBits';

const DONE_COLOR = 'var(--done-mark)';

export function Stars({ count, title }: { count: number; title?: string }) {
  return (
    <span className="text-amber-300" role="img" aria-label={title ?? `${count} of ${MAX_STARS} stars`} title={title}>
      <span aria-hidden>{'★'.repeat(count)}</span>
      <span aria-hidden className="text-slate-600">
        {'★'.repeat(MAX_STARS - count)}
      </span>
    </span>
  );
}

export function KindTag({ quest }: { quest: Quest }) {
  const kind = KINDS[quest.kind];
  return (
    <span
      className="rounded px-1.5 py-1 font-pixel text-pixel-xs leading-none"
      style={{ color: kind.color, background: `color-mix(in srgb, ${kind.color} 12%, transparent)` }}
    >
      {kind.label.toUpperCase()}
    </span>
  );
}

interface Props {
  quest: Quest;
  /** Show the Jira status name, for lists that don't group by status. */
  showStatus?: boolean;
  /** Whose issue it is, for lists that aren't already grouped by person. */
  owner?: Member;
  /** Called with the issue, so lists can pass one stable handler to every row. */
  onOpen: (quest: Quest) => void;
  onComplete: (quest: Quest) => void;
}

export const QuestItem = memo(function QuestItem({ quest, showStatus = false, owner, onOpen, onComplete }: Props) {
  const theme = useTheme();
  const kind = KINDS[quest.kind];
  const stars = questStars(quest);
  const overdue = isOverdue(quest);
  const due = quest.dueDate === null ? null : dueInDays(quest.dueDate);
  const { done } = quest;

  return (
    <motion.li layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9 }}>
      <div
        draggable={!done}
        onDragStart={(e) => {
          e.dataTransfer.setData(QUEST_DRAG_TYPE, quest.key);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(quest);
        }}
        className={`flex gap-2 rounded-lg border p-2 transition-colors ${
          done
            ? 'cursor-pointer border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-950/50'
            : `cursor-grab bg-slate-900/80 hover:bg-slate-800 active:cursor-grabbing ${overdue ? 'border-rose-500/60' : 'border-slate-800'}`
        }`}
      >
        {done ? (
          <span
            role="img"
            aria-label={`${quest.key} is done`}
            title="Done"
            className="grid size-8 shrink-0 place-items-center rounded-md border-2 text-base font-bold text-slate-950"
            style={{ borderColor: DONE_COLOR, background: DONE_COLOR }}
          >
            ✓
          </span>
        ) : (
          <button
            type="button"
            title="Mark as done"
            aria-label={`Mark ${quest.key} as done`}
            onClick={(e) => {
              e.stopPropagation();
              onComplete(quest);
            }}
            className="group/btn grid size-8 shrink-0 place-items-center rounded-md border-2 text-sm transition-transform hover:scale-110"
            style={{ borderColor: `color-mix(in srgb, ${kind.color} 60%, transparent)`, background: `color-mix(in srgb, ${kind.color} 8%, transparent)` }}
          >
            <span aria-hidden className="group-hover/btn:hidden group-focus-visible/btn:hidden">
              {theme.kindIcons[quest.kind]}
            </span>
            <span aria-hidden className="hidden group-hover/btn:inline group-focus-visible/btn:inline">
              ✓
            </span>
          </button>
        )}

        {owner && (
          <span className="mt-0.5 shrink-0" title={owner.hero.name}>
            <HeroAvatar member={owner} size="xs" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          {/* The whole row opens the issue with a mouse; this is the button keyboards and screen readers use. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(quest);
            }}
            className={`block w-full rounded-sm text-left text-sm leading-snug focus-visible:underline ${done ? 'text-slate-300' : ''}`}
          >
            <span className="line-clamp-2">{quest.summary}</span>
          </button>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-slate-400">
            <KindTag quest={quest} />
            <span className="font-mono">{quest.key}</span>
            {done ? (
              <>
                <span className="rounded bg-emerald-500/15 px-1.5 py-1 font-pixel text-pixel-xs leading-none text-emerald-300">
                  {theme.stageIcons.done} DONE
                </span>
                <span className="font-medium text-amber-300">
                  +{questXp(quest)} {theme.words.xp}
                </span>
              </>
            ) : (
              <>
                <Stars count={stars} title={`Difficulty ${stars}/${MAX_STARS}, ${difficultySource(quest)}`} />
                {showStatus && <span style={{ color: STAGES[quest.stage].color }}>{quest.status}</span>}
                {due !== null && (
                  <span className={overdue ? 'text-rose-400' : due <= 1 ? 'text-amber-300' : ''}>
                    <span aria-hidden>{theme.uiIcons.due} </span>
                    {dueLabel(due)}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </motion.li>
  );
});
