import { memo, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { QuestKind } from '../../shared/types';
import logoMark from '../assets/logo-mark.webp';
import { useTheme } from '../lib/activeTheme';
import { memberStats, sameMember, type Member } from '../../shared/heroes';
import { KINDS } from '../../shared/kinds';
import { useQuestDrop } from '../lib/useQuestDrop';
import { HeroAvatar, XpBar } from './HeroBits';

interface Props {
  members: Member[];
  /** The hero whose page is open, or null for the whole party. */
  activeId: string | null;
  /** The keyboard-selected hero in the party view. */
  highlightedId: string | null;
  /** The signed-in Jira user, when known. */
  meId: string | null;
  totalQuests: number;
  onView: (id: string | null) => void;
  onDropQuest: (key: string, memberId: string) => void;
}

export function Roster({ members, activeId, highlightedId, meId, totalQuests, onView, onDropQuest }: Props) {
  const theme = useTheme();
  const { words } = theme;
  const heroCount = members.filter((m) => !m.isTavern).length;

  return (
    <aside className="border-b border-slate-800 bg-slate-950/70 backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-72 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-4 lg:block lg:px-5 lg:pt-5">
        <p className="flex items-center gap-2.5 font-pixel text-base text-white">
          <img src={logoMark} alt="" width={36} height={36} className="size-9 shrink-0 rounded-md" />
          <span>
            Jira<span className="text-amber-300">Play</span>
          </span>
        </p>
        <p className="font-pixel text-pixel-xs uppercase tracking-widest text-slate-400 lg:mt-3">
          {words.party} · {heroCount} {words.heroes}
        </p>
      </div>

      <nav aria-label="Party" className="flex snap-x gap-2 overflow-x-auto px-3 py-3 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:py-4">
        <button
          type="button"
          onClick={() => onView(null)}
          aria-current={activeId === null ? 'page' : undefined}
          className={`flex w-48 shrink-0 snap-start items-center gap-3 rounded-xl border-2 p-2 text-left transition-colors sm:w-56 lg:w-auto ${
            activeId === null ? 'border-amber-400 bg-slate-800/80' : 'border-transparent hover:bg-slate-900'
          }`}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-md border-2 border-amber-400/60 bg-amber-400/10 text-lg">
            {theme.partyIcon}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-white">Whole {words.party}</span>
            <span className="block text-meta text-slate-400">
              {heroCount} {words.heroes} · {totalQuests} issues
            </span>
          </span>
        </button>

        <p className="hidden px-2 pt-3 font-pixel text-pixel-xs text-slate-400 lg:block">ONE BY ONE</p>

        {members.map((member) => (
          <RosterRow
            key={member.hero.id}
            member={member}
            active={member.hero.id === activeId}
            highlighted={member.hero.id === highlightedId}
            isMe={member.hero.id === meId}
            onView={onView}
            onDropQuest={onDropQuest}
          />
        ))}
      </nav>

      <Legend />
    </aside>
  );
}

/** How long after the page loads the legend opens as a hint, and how long it stays open. */
const LEGEND_PEEK_DELAY_MS = 800;
const LEGEND_OPEN_MS = 5000;

/** The issue-type key. Starts minimised, opens briefly after load, then stays however the user leaves it. */
function Legend() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  /** Once the user toggles it, the automatic open and close stop. */
  const touched = useRef(false);

  useEffect(() => {
    const show = setTimeout(() => {
      if (!touched.current) setOpen(true);
    }, LEGEND_PEEK_DELAY_MS);
    const hide = setTimeout(() => {
      if (!touched.current) setOpen(false);
    }, LEGEND_PEEK_DELAY_MS + LEGEND_OPEN_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  return (
    <div className="hidden border-t border-slate-800 lg:block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="roster-legend"
        onClick={() => {
          touched.current = true;
          setOpen((o) => !o);
        }}
        className="flex w-full items-center justify-between px-4 py-3 font-pixel text-pixel-xs text-slate-400 hover:text-slate-300"
      >
        <span>LEGEND</span>
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="roster-legend"
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <ul className="space-y-1 px-4 pb-4 text-xs">
              {(Object.keys(KINDS) as QuestKind[]).map((kind) => (
                <li key={kind} className="flex items-center gap-2">
                  <span className="w-5 text-center">{theme.kindIcons[kind]}</span>
                  <span className="font-medium" style={{ color: KINDS[kind].color }}>
                    {KINDS[kind].label}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface RowProps {
  member: Member;
  active: boolean;
  highlighted: boolean;
  isMe: boolean;
  onView: (memberId: string) => void;
  onDropQuest: (key: string, memberId: string) => void;
}

const RosterRow = memo(
  function RosterRow({ member, active, highlighted, isMe, onView, onDropQuest }: RowProps) {
  const theme = useTheme();
  const { hero, cls, isTavern, quests } = member;
  const { hover, handlers } = useQuestDrop((key) => onDropQuest(key, hero.id));
  const stats = memberStats(member);
  const streak = member.progress?.streak ?? 0;
  const open = quests.filter((q) => !q.done).length;

  return (
    <button
      type="button"
      onClick={() => onView(hero.id)}
      {...handlers}
      aria-current={active ? 'page' : undefined}
      className={`flex w-48 shrink-0 snap-start items-center gap-3 rounded-xl border-2 p-2 text-left transition-colors sm:w-56 lg:w-auto ${
        active || hover ? 'bg-slate-800/80' : 'hover:bg-slate-900'
      }`}
      style={{ borderColor: active || hover ? cls.color : highlighted ? `${cls.color}66` : 'transparent' }}
    >
      <HeroAvatar member={member} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium text-white">{hero.name}</span>
            {isMe && <span className="shrink-0 rounded bg-amber-400 px-1 font-pixel text-pixel-xs leading-4 text-slate-950">YOU</span>}
          </span>
          {!isTavern && (
            <span className="shrink-0 font-pixel text-pixel-xs text-amber-300">
              {theme.words.level} {stats.level}
            </span>
          )}
        </span>
        {isTavern ? (
          <span className="block text-meta text-slate-400">Drop here to unassign</span>
        ) : (
          <span className="mt-1.5 block">
            <XpBar stats={stats} color={cls.color} showLabels={false} height="h-1.5" />
          </span>
        )}
        <span className="mt-1 block text-meta text-slate-400">
          {theme.stageIcons.doing} {open} open · ✔ {quests.length - open} done
          {streak >= 2 && ` · ${theme.uiIcons.streak}${streak}`}
        </span>
      </span>
    </button>
  );
  },
  (prev, next) =>
    sameMember(prev.member, next.member) &&
    prev.active === next.active &&
    prev.highlighted === next.highlighted &&
    prev.isMe === next.isMe &&
    prev.onView === next.onView &&
    prev.onDropQuest === next.onDropQuest,
);
