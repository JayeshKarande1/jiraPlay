import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '../api';
import type { BoardColumn, MyIssueCounts, Quest, StageFilter } from '../../shared/types';
import { useTheme } from '../lib/activeTheme';
import { useDialog } from '../lib/useDialog';
import { memberStats, type Member } from '../../shared/heroes';
import { AchievementBadges } from './AchievementBadges';
import { Trends } from './Trends';
import { AvatarPicker } from './AvatarPicker';
import { columnColors, columnIndexFor, STAGE_ORDER, STAGES } from '../../shared/stages';
import { byUrgency } from '../../shared/xp';
import { Hearts, HeroAvatar, XpBar } from './HeroBits';
import { QuestItem } from './QuestItem';
import { SkeletonRows } from './BoardSkeleton';

type Scope = 'board' | 'jira';

const SCOPES: [Scope, string][] = [
  ['board', 'This board'],
  ['jira', 'All my issues'],
];
const SEARCH_DEBOUNCE_MS = 400;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

interface Props {
  member: Member;
  /** The Jira board's columns, offered as filters on the This board tab. */
  columns: BoardColumn[];
  /** Bumped after any change to an issue, so the Jira-wide list and counts reload. */
  version: number;
  onClose: () => void;
  onOpenQuest: (quest: Quest) => void;
  onCompleteQuest: (quest: Quest) => void;
}

/** The signed-in user's dashboard: level, counts by status and a searchable list of their issues on the board or across Jira. */
export function ProfilePanel({ member, columns, version, onClose, onOpenQuest, onCompleteQuest }: Props) {
  const theme = useTheme();
  const dialogRef = useDialog<HTMLElement>();
  const { hero, cls, quests: boardQuests } = member;
  const stats = memberStats(member);
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const searchBarRef = useRef<HTMLDivElement>(null);
  const [scope, setScope] = useState<Scope>('board');
  const [filter, setFilter] = useState<StageFilter>('all');
  /** A board column picked on the This board tab, which replaces the status-group filter. */
  const [column, setColumn] = useState<number | null>(null);
  const colors = useMemo(() => columnColors(columns), [columns]);
  const columnCounts = useMemo(() => {
    const counts = columns.map(() => 0);
    for (const quest of boardQuests) counts[columnIndexFor(quest, columns)]++;
    return counts;
  }, [boardQuests, columns]);
  const [search, setSearch] = useState('');
  const [retries, setRetries] = useState(0);
  const jira = useMyJiraIssues(scope === 'jira', filter, search.trim(), version + retries);

  const boardCounts = useMemo<MyIssueCounts>(() => {
    const inStage = (stage: StageFilter) => boardQuests.filter((q) => q.stage === stage).length;
    return { total: boardQuests.length, todo: inStage('todo'), doing: inStage('doing'), done: inStage('done'), overdue: stats.overdue };
  }, [boardQuests, stats.overdue]);

  const boardList = useMemo(() => {
    const text = search.trim().toLowerCase();
    return boardQuests
      .filter((q) => (column !== null ? columnIndexFor(q, columns) === column : filter === 'all' || q.stage === filter))
      .filter((q) => !text || q.summary.toLowerCase().includes(text) || q.key.toLowerCase().includes(text))
      .sort((a, b) => Number(a.done) - Number(b.done) || byUrgency(a, b));
  }, [boardQuests, filter, column, columns, search]);

  const onBoard = scope === 'board';
  const counts = onBoard ? boardCounts : jira.counts;
  const list = onBoard ? boardList : jira.quests;
  const percentDone = counts?.total ? Math.round((counts.done / counts.total) * 100) : 0;
  const columnFilter = onBoard && column !== null ? columns[column] : undefined;
  const filterLabel = columnFilter ? columnFilter.name.toUpperCase() : filter === 'all' ? 'ALL ISSUES' : STAGES[filter].title;
  const emptyText =
    filter !== 'all' || columnFilter || search.trim()
      ? 'No issues match.'
      : onBoard
        ? 'No issues on this board are assigned to you.'
        : 'Nothing is assigned to you in Jira.';

  return (
    <motion.div
      className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.aside
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Your profile"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        /*
         * A centered popup. Wide screens get two columns, the profile on the left and search with its results on
         * the right, each scrolling on its own. Narrow screens scroll as one column with the search bar pinned.
         */
        className="flex h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-y-auto overscroll-contain rounded-2xl border-2 bg-slate-950 shadow-2xl md:h-[min(780px,calc(100vh-2rem))] md:flex-row md:overflow-hidden"
        style={{ borderColor: cls.color }}
      >
        <div className="border-b border-slate-800 p-6 md:w-96 md:shrink-0 md:overflow-y-auto md:overscroll-contain md:border-b-0 md:border-r">
          <div className="flex items-center justify-between gap-4">
            <p className="font-pixel text-pixel-sm text-slate-400">YOUR PROFILE</p>
            <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-200">
              ✕
            </button>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <HeroAvatar member={member} size="lg" />
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold text-white">{hero.name}</h2>
              <p className="mt-1 font-pixel text-pixel-sm uppercase" style={{ color: cls.color }}>
                {cls.icon} {cls.name}
              </p>
              <p className="mt-2 font-pixel text-sm text-amber-300">
                {theme.words.level} {stats.level}
              </p>
              <button
                type="button"
                onClick={() => setPickingAvatar((open) => !open)}
                aria-expanded={pickingAvatar}
                className="mt-2 text-xs text-amber-300 underline underline-offset-2 hover:text-amber-200"
              >
                {pickingAvatar ? 'Done choosing' : 'Change avatar'}
              </button>
            </div>
          </div>

          {pickingAvatar && <AvatarPicker member={member} />}

          <div className="mt-5">
            <XpBar stats={stats} color={cls.color} />
          </div>

          {member.progress && (
            <div className="mt-4">
              <p className="mb-2 text-sm text-slate-300">
                🔥 {member.progress.streak}-day streak · {member.progress.sprintXp} {theme.words.xp} this sprint
              </p>
              <AchievementBadges earned={member.progress.achievements} />
            </div>
          )}

          <details className="mt-4 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
            <summary className="cursor-pointer font-pixel text-pixel-sm uppercase text-slate-400">Your trends</summary>
            <Trends heroId={member.hero.id} />
          </details>

          <div role="tablist" aria-label="Which issues" className="mt-5 grid grid-cols-2 gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
            {SCOPES.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={scope === id}
                onClick={() => setScope(id)}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  scope === id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-2">
            <StatTile
              label="Assigned"
              value={counts?.total}
              color={cls.color}
              active={filter === 'all' && !columnFilter}
              onClick={() => {
                setFilter('all');
                setColumn(null);
              }}
            />
            {STAGE_ORDER.map((stage) => (
              <StatTile
                key={stage}
                label={STAGES[stage].title}
                value={counts?.[stage]}
                color={STAGES[stage].color}
                active={filter === stage && !columnFilter}
                onClick={() => {
                  setFilter(stage);
                  setColumn(null);
                }}
              />
            ))}
          </div>

          {onBoard && (
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Board columns">
              {columns.map((c, i) => {
                const active = column === i;
                return (
                  <button
                    key={`${c.name}-${i}`}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setFilter('all');
                      setColumn(active ? null : i);
                    }}
                    className="rounded-full border px-2.5 py-1 text-xs transition-colors"
                    style={{
                      borderColor: active ? colors[i] : `color-mix(in srgb, ${colors[i]} 35%, transparent)`,
                      background: active ? colors[i] : 'transparent',
                      color: active ? '#020617' : colors[i],
                    }}
                  >
                    {c.name} · {columnCounts[i]}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-400">
            <span>{counts ? `${percentDone}% done` : 'Counting…'}</span>
            {counts && (
              <span className={counts.overdue > 0 ? 'text-rose-400' : ''}>
                {counts.overdue > 0 ? `${counts.overdue} overdue` : 'Nothing overdue'}
              </span>
            )}
            {onBoard && <Hearts overdue={stats.overdue} />}
          </div>
        </div>

        {/* On narrow screens, at least a full panel tall, so the search bar can always scroll to the top with results filling the rest. */}
        <div className="flex min-h-full flex-col px-6 pb-6 md:min-h-0 md:min-w-0 md:flex-1 md:overflow-y-auto md:overscroll-contain">
          <div ref={searchBarRef} className="sticky top-0 z-10 -mx-6 border-b border-slate-800 bg-slate-950 px-6 pb-3 pt-4">
            <input
              type="search"
              value={search}
              onChange={(e) => {
                // Starting a search moves the bar to the top, so the results use the whole panel.
                if (!search && e.target.value) searchBarRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                setSearch(e.target.value);
              }}
              placeholder={onBoard ? 'Search by title or key…' : 'Search titles, or type an issue key…'}
              aria-label="Search your issues"
              className="w-full rounded-lg border-2 border-slate-700 bg-slate-900 px-3 py-2 text-sm placeholder:text-slate-500 focus:border-slate-500"
            />
            <p className="mt-3 flex items-center justify-between gap-2 font-pixel text-pixel-xs text-slate-400">
              <span>
                {filterLabel} {onBoard ? 'ON THIS BOARD' : 'IN JIRA'} · {list ? `${list.length}${!onBoard && jira.hasMore ? '+' : ''}` : '…'}
              </span>
              {!onBoard && jira.loading && list && <span className="animate-pulse">UPDATING…</span>}
            </p>
          </div>

          {!onBoard && jira.error && (
            <p className="mt-2 text-sm text-rose-300">
              Couldn't load your issues: {jira.error}{' '}
              <button type="button" onClick={() => setRetries((r) => r + 1)} className="underline hover:text-rose-200">
                Try again
              </button>
            </p>
          )}

          <div className="mt-3">
            {list === null ? (
              !jira.error && <SkeletonRows count={4} label="Loading your issues from Jira…" />
            ) : (
              <>
                <ul className="space-y-2">
                  <AnimatePresence initial={false}>
                    {list.map((quest) => (
                      <QuestItem
                        key={quest.key}
                        quest={quest}
                        showStatus
                        onOpen={onOpenQuest}
                        onComplete={onCompleteQuest}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
                {list.length === 0 && <p className="py-6 text-center text-sm text-slate-400">{emptyText}</p>}
                {!onBoard && jira.hasMore && (
                  <button
                    type="button"
                    onClick={() => void jira.loadMore()}
                    disabled={jira.loadingMore}
                    className="mt-3 w-full rounded-lg border-2 border-dashed border-slate-700 py-2 font-pixel text-pixel-sm text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200 disabled:opacity-60"
                  >
                    {jira.loadingMore ? 'LOADING…' : 'LOAD MORE'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </motion.aside>
    </motion.div>
  );
}

/** The signed-in user's issues across Jira, loaded only while that tab is showing. */
function useMyJiraIssues(active: boolean, stage: StageFilter, search: string, version: number) {
  const [counts, setCounts] = useState<MyIssueCounts | null>(null);
  const [quests, setQuests] = useState<Quest[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Increases with each new query, so late responses from an older query are ignored. */
  const generation = useRef(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    api.myCounts().then(
      (next) => {
        if (!cancelled) setCounts(next);
      },
      (err: unknown) => {
        if (!cancelled) setError(errorText(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [active, version]);

  // A different filter or search is a different list; a reload after a change (a new version) keeps showing the
  // old one meanwhile. Adjusted during render rather than in an effect, so the stale list never paints once more.
  const [filter, setFilter] = useState({ stage, search });
  if (filter.stage !== stage || filter.search !== search) {
    setFilter({ stage, search });
    setQuests(null);
    setCursor(null);
  }

  useEffect(() => {
    if (!active) return;
    const current = ++generation.current;
    // oxlint-disable-next-line react/set-state-in-effect -- the effect is the debounced Jira query itself.
    setLoading(true);
    setError(null);
    const timer = setTimeout(
      () => {
        api.myQuests({ stage, search, cursor: null }).then(
          (page) => {
            if (generation.current !== current) return;
            setQuests(page.quests);
            setCursor(page.cursor);
            setLoading(false);
          },
          (err: unknown) => {
            if (generation.current !== current) return;
            setError(errorText(err));
            setLoading(false);
          },
        );
      },
      search ? SEARCH_DEBOUNCE_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [active, stage, search, version]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    const current = generation.current;
    setLoadingMore(true);
    try {
      const page = await api.myQuests({ stage, search, cursor });
      if (generation.current !== current) return;
      // Issues can shift between pages when they're updated, so skip any already listed.
      setQuests((list) => {
        const seen = new Set(list?.map((q) => q.key));
        return [...(list ?? []), ...page.quests.filter((q) => !seen.has(q.key))];
      });
      setCursor(page.cursor);
    } catch (err) {
      if (generation.current === current) setError(errorText(err));
    } finally {
      setLoadingMore(false);
    }
  }

  return { counts, quests, loading, loadingMore, error, hasMore: cursor !== null, loadMore };
}

interface StatTileProps {
  label: string;
  /** Undefined while still counting. */
  value: number | undefined;
  color: string;
  active: boolean;
  onClick: () => void;
}

/** A count that also filters the list below. */
function StatTile({ label, value, color, active, onClick }: StatTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-slate-900"
      style={{
        borderColor: active ? color : `color-mix(in srgb, ${color} 25%, transparent)`,
        background: active ? `color-mix(in srgb, ${color} 12%, transparent)` : undefined,
      }}
    >
      <span className="block font-pixel text-pixel-xs uppercase" style={{ color }}>
        {label}
      </span>
      <span className="mt-1.5 block font-pixel text-lg text-white">{value ?? '…'}</span>
    </button>
  );
}
