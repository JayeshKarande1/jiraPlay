import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { Quest } from '../../shared/types';
import { useTheme } from '../lib/activeTheme';
import { openExternal } from '../lib/host';
import { KINDS } from '../../shared/kinds';
import {
  DEFAULT_STARS,
  difficultySource,
  dueInDays,
  dueLabel,
  MAX_STARS,
  POINT_STARS,
  PRIORITY_STARS,
  pointsRule,
  priorityRule,
  questStars,
  questXp,
} from '../../shared/xp';
import type { QuestTransition } from '../../shared/types';
import type { Member } from '../../shared/heroes';
import { useDialog } from '../lib/useDialog';
import { AssignPicker } from './AssignPicker';
import { QuestComments } from './QuestComments';
import { StatusPicker } from './StatusPicker';
import { KindTag, Stars } from './QuestItem';

interface Props {
  quest: Quest;
  /** Everyone the issue can be assigned to, including Unassigned. */
  members: Member[];
  /** The member id the issue belongs to now. */
  ownerId: string;
  accent: string;
  onClose: () => void;
  onComplete: () => void;
  onChangeStatus: (transition: QuestTransition) => void;
  onAssign: (memberId: string) => void;
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-pixel text-pixel-xs text-slate-400">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

const Missing = ({ children }: { children: ReactNode }) => <span className="text-slate-400">{children}</span>;

function RuleRow({ label, stars, active }: { label: string; stars: number; active: boolean }) {
  return (
    <li className={`flex items-center justify-between gap-3 rounded px-1.5 py-0.5 ${active ? 'bg-amber-400/15 text-white' : ''}`}>
      <span>
        {active && '▶ '}
        {label}
      </span>
      <Stars count={stars} />
    </li>
  );
}

/** Difficulty stars, with a hover/focus guide explaining the rules and highlighting the one that applies. */
function DifficultyStat({ quest }: { quest: Quest }) {
  const usingPoints = quest.points !== null;
  const matchedPoints = quest.points !== null ? pointsRule(quest.points) : undefined;
  const matchedPriority = usingPoints ? undefined : priorityRule(quest.priority);
  const largestLimit = POINT_STARS[POINT_STARS.length - 1].upTo;

  return (
    <div className="group/tip relative">
      <dt className="flex items-center gap-1 font-pixel text-pixel-xs text-slate-400">
        DIFFICULTY
        <button
          type="button"
          aria-label="How difficulty is set"
          aria-describedby="difficulty-help"
          className="font-sans text-xs text-slate-400 hover:text-slate-200 focus-visible:text-slate-200"
        >
          ⓘ
        </button>
      </dt>
      <dd className="mt-1 cursor-help">
        <Stars count={questStars(quest)} />
        <span className="ml-2 text-xs text-slate-400">{difficultySource(quest)}</span>
      </dd>

      <div
        id="difficulty-help"
        role="tooltip"
        className="invisible absolute right-0 top-full z-10 mt-2 w-64 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-400 opacity-0 shadow-xl transition-opacity group-focus-within/tip:visible group-focus-within/tip:opacity-100 group-hover/tip:visible group-hover/tip:opacity-100"
      >
        <p className="font-medium text-slate-200">How difficulty is set</p>
        <p className="mt-1">Story points decide the stars. Issues without story points use their priority instead.</p>

        <p className="mt-3 font-pixel text-pixel-xs text-slate-400">STORY POINTS</p>
        <ul className="mt-1 space-y-0.5">
          {POINT_STARS.map((rule) => (
            <RuleRow key={rule.upTo} label={`up to ${rule.upTo}`} stars={rule.stars} active={rule === matchedPoints} />
          ))}
          <RuleRow label={`more than ${largestLimit}`} stars={MAX_STARS} active={usingPoints && !matchedPoints} />
        </ul>

        <p className="mt-3 font-pixel text-pixel-xs text-slate-400">PRIORITY · WHEN NOT ESTIMATED</p>
        <ul className="mt-1 space-y-0.5">
          {PRIORITY_STARS.map((rule) => (
            <RuleRow key={rule.priority} label={rule.priority} stars={rule.stars} active={rule === matchedPriority} />
          ))}
          <RuleRow label="None / other" stars={DEFAULT_STARS} active={!usingPoints && !matchedPriority} />
        </ul>
      </div>
    </div>
  );
}

export function QuestDetail({ quest, members, ownerId, accent, onClose, onComplete, onChangeStatus, onAssign }: Props) {
  const kind = KINDS[quest.kind];
  const theme = useTheme();
  const icon = theme.kindIcons[quest.kind];
  const { url } = quest;
  const dialogRef = useDialog<HTMLDivElement>();
  const titleId = `quest-title-${quest.key}`;

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border-2 bg-slate-950 p-6 shadow-2xl sm:p-8"
        style={{ borderColor: accent }}
      >
        <div className="flex items-start justify-between gap-4">
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <span className="text-2xl">{icon}</span>
            <KindTag quest={quest} />
            <span className="font-mono">{quest.key}</span>
          </p>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>

        <h2 id={titleId} className="mt-3 text-xl font-semibold text-white">
          {quest.summary}
        </h2>

        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <Stat label={theme.words.hero.toUpperCase()}>
            <AssignPicker members={members} currentId={ownerId} onAssign={onAssign} />
          </Stat>
          <Stat label="STATUS">
            <StatusPicker quest={quest} onChange={onChangeStatus} />
          </Stat>
          <Stat label="TYPE">
            {icon} {kind.label}
          </Stat>
          <Stat label="PRIORITY">{quest.priority ?? <Missing>None</Missing>}</Stat>
          <Stat label="STORY POINTS">
            {quest.points !== null ? <span className="font-semibold text-white">{quest.points}</span> : <Missing>Not estimated</Missing>}
          </Stat>
          <DifficultyStat quest={quest} />
          <Stat label="REWARD">
            <span className="text-amber-300">
              +{questXp(quest)} {theme.words.xp}
            </span>
          </Stat>
          {quest.dueDate && (
            <Stat label="DUE">
              {quest.dueDate} <span className="text-slate-400">({dueLabel(dueInDays(quest.dueDate))})</span>
            </Stat>
          )}
        </dl>

        {quest.description && (
          <div className="mt-5 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-sm text-slate-300">
            {quest.description}
          </div>
        )}

        <QuestComments questKey={quest.key} accent={accent} />

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                if (openExternal(url)) e.preventDefault();
              }}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500"
            >
              Open in Jira ↗
            </a>
          )}
          {quest.done ? (
            <span className="font-pixel text-xs text-emerald-400">DONE ✔</span>
          ) : (
            <button
              type="button"
              onClick={onComplete}
              className="rounded-lg px-4 py-2 font-pixel text-pixel-md text-slate-950 transition-transform hover:scale-105"
              style={{ background: accent }}
            >
              ✔ MARK DONE
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
