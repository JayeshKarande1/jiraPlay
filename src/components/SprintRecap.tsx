import { useMemo } from 'react';
import { motion } from 'motion/react';
import type { Board, XpEntry } from '../../shared/types';
import { sprintRecap } from '../../shared/recap';
import { KINDS } from '../../shared/kinds';
import { useTheme } from '../lib/activeTheme';
import { useDialog } from '../lib/useDialog';
import { SprintChart } from './Charts';

/**
 * How the sprint actually went, entirely from the saved XP ledger — every entry is already stamped with when
 * Jira resolved it, so opening this costs no Jira requests.
 */
export function SprintRecap({ board, history, onClose }: { board: Board; history: XpEntry[]; onClose: () => void }) {
  const theme = useTheme();
  const { words } = theme;
  const ref = useDialog<HTMLDivElement>();
  const sprint = board.sprints[0] ?? null;

  const recap = useMemo(() => sprintRecap(history, sprint, board.quests), [history, sprint, board.quests]);
  const allTimeXp = useMemo(() => history.reduce((sum, entry) => sum + entry.xp, 0), [history]);
  const pace = recap.activeDays === 0 ? 0 : Math.round(recap.xp / recap.activeDays);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recap-title"
        tabIndex={-1}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border-2 border-slate-700 bg-slate-950 p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-pixel text-pixel-xs uppercase tracking-widest text-slate-400">Sprint recap</p>
            <h2 id="recap-title" className="mt-1 break-words font-pixel text-base text-white">
              {sprint?.name ?? 'The last two weeks'}
            </h2>
          </div>
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            aria-label="Close the recap"
            className="shrink-0 rounded-lg border border-slate-700 px-2 py-1 text-slate-300 hover:border-slate-500"
          >
            ✕
          </button>
        </div>

        {recap.completed === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">Nothing has been finished in this sprint yet.</p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat label={words.xp} value={recap.xp.toLocaleString()} />
              <Stat label="Finished" value={String(recap.completed)} />
              <Stat label="XP / active day" value={String(pace)} />
            </div>

            <div className="mt-5">
              <h3 className="font-pixel text-pixel-sm uppercase text-slate-400">{words.xp} over the sprint</h3>
              <div className="mt-2">
                <SprintChart series={recap.series} label={`${words.xp} earned, running total`} />
              </div>
            </div>

            {recap.remainingXp !== null && (
              <p className="mt-2 text-sm text-slate-400">
                {recap.remainingXp > 0 ? (
                  <>
                    {theme.boss.name} has <span className="font-medium text-rose-300">{recap.remainingXp.toLocaleString()} HP</span> left.
                  </>
                ) : (
                  <span className="text-emerald-300">Every issue on the board is done.</span>
                )}
              </p>
            )}

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <h3 className="font-pixel text-pixel-sm uppercase text-slate-400">Who</h3>
                <ul className="mt-2 space-y-1.5">
                  {recap.byHero.slice(0, 5).map((hero, i) => (
                    <li key={hero.heroId} className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-slate-200">
                        {i === 0 && <span aria-hidden>🥇 </span>}
                        {hero.heroName}
                      </span>
                      <span className="shrink-0 tabular-nums text-amber-300">{hero.xp.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-pixel text-pixel-sm uppercase text-slate-400">What</h3>
                <ul className="mt-2 space-y-1.5">
                  {recap.byKind.map((kind) => (
                    <li key={kind.kind} className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate" style={{ color: KINDS[kind.kind].color }}>
                        <span aria-hidden>{theme.kindIcons[kind.kind]} </span>
                        {KINDS[kind.kind].label}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-300">{kind.completed}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {recap.bestDay && (
              <p className="mt-5 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
                Best day: <span className="text-white">{new Date(`${recap.bestDay.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>{' '}
                — {recap.bestDay.xp.toLocaleString()} {words.xp} from {recap.bestDay.completed} {recap.bestDay.completed === 1 ? 'issue' : 'issues'}.
              </p>
            )}

            <p className="mt-3 text-xs text-slate-400">
              All-time {words.xp} on this board: {allTimeXp.toLocaleString()}.
            </p>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-center">
      <p className="font-pixel text-lg tabular-nums text-amber-300">{value}</p>
      <p className="mt-1 font-pixel text-pixel-xs uppercase text-slate-400">{label}</p>
    </div>
  );
}
