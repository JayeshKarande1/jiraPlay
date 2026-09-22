import { useMemo, type CSSProperties } from 'react';
import { AnimatePresence } from 'motion/react';
import type { BoardColumn, Quest } from '../../shared/types';
import { useTheme } from '../lib/activeTheme';
import type { Member } from '../../shared/heroes';
import { columnColors, columnIndexFor } from '../../shared/stages';
import { byUrgency } from '../../shared/xp';
import { QuestItem } from './QuestItem';

interface Props {
  /** Already filtered and in board order; used to find each issue's owner. */
  members: Member[];
  quests: Quest[];
  columns: BoardColumn[];
  boardName: string | null;
  onOpenQuest: (quest: Quest) => void;
  onCompleteQuest: (quest: Quest) => void;
}

/**
 * The whole party's issues in the Jira board's columns rather than per person — the view for "what is in
 * review right now". Each row carries its owner's avatar, since the column no longer says who it belongs to.
 */
export function ColumnBoard({ members, quests, columns, boardName, onOpenQuest, onCompleteQuest }: Props) {
  const theme = useTheme();
  const colors = useMemo(() => columnColors(columns), [columns]);
  const owners = useMemo(() => new Map(members.flatMap((m) => m.quests.map((q) => [q.key, m]))), [members]);
  const byColumn = useMemo(() => {
    const lists = columns.map((): Quest[] => []);
    for (const quest of quests) lists[columnIndexFor(quest, columns)]?.push(quest);
    return lists.map((list) => list.sort(byUrgency));
  }, [quests, columns]);

  return (
    <div className="mx-auto max-w-7xl">
      {/* Scrolls sideways when the board has more columns than fit. The padding keeps column glows from being clipped. */}
      <div className="-mx-2 flex items-start gap-4 overflow-x-auto px-2 pb-3 pt-1">
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
                    <QuestItem key={quest.key} quest={quest} owner={owners.get(quest.key)} onOpen={onOpenQuest} onComplete={onCompleteQuest} />
                  ))}
                </AnimatePresence>
              </ul>
              {list.length === 0 && <p className="py-4 text-center text-sm text-slate-400">Nothing here</p>}
            </section>
          );
        })}
      </div>
      {boardName && <p className="mt-1 text-right text-xs text-slate-400">Columns from your Jira board: {boardName}</p>}
    </div>
  );
}
