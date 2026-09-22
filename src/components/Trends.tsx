import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { XpEntry } from '../../shared/types';
import { kindMix, levelMilestones, personalBests, weekSeries } from '../../shared/recap';
import { KINDS } from '../../shared/kinds';
import { useTheme } from '../lib/activeTheme';
import { WeekBars } from './Charts';

const longDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const shortDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
/** The most recent level-ups shown in the timeline; older ones fold behind a count. */
const MILESTONES_SHOWN = 5;

/** Your own history, from the saved XP ledger: the last eight weeks, personal bests and every level reached. No Jira requests: the host already has this. */
export function Trends({ heroId }: { heroId: string }) {
  const theme = useTheme();
  const [history, setHistory] = useState<XpEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.history().then(
      (entries) => {
        if (!cancelled) setHistory(entries);
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const weeks = useMemo(() => (history ? weekSeries(history, heroId) : []), [history, heroId]);
  const mix = useMemo(() => (history ? kindMix(history, heroId) : []), [history, heroId]);
  const bests = useMemo(() => (history ? personalBests(history, heroId) : null), [history, heroId]);
  const milestones = useMemo(() => (history ? levelMilestones(history, heroId) : []), [history, heroId]);
  const total = weeks.reduce((sum, w) => sum + w.xp, 0);
  const busiest = mix[0];

  if (error) return <p className="py-4 text-sm text-rose-300">Couldn't load your history: {error}</p>;
  if (!history) return <p className="animate-pulse py-4 text-sm text-slate-400">Loading your history…</p>;
  if (total === 0 && mix.length === 0) {
    return <p className="py-4 text-sm text-slate-400">Nothing finished yet. Your history builds up as you close issues.</p>;
  }

  return (
    <div className="py-1">
      <WeekBars weeks={weeks} label={`${theme.words.xp} a week, last 8 weeks`} />

      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
          <dt className="font-pixel text-pixel-xs uppercase text-slate-400">Last 8 weeks</dt>
          <dd className="mt-1 tabular-nums text-amber-300">
            {total.toLocaleString()} {theme.words.xp}
          </dd>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
          <dt className="font-pixel text-pixel-xs uppercase text-slate-400">Most finished</dt>
          <dd className="mt-1" style={{ color: busiest ? KINDS[busiest.kind].color : undefined }}>
            {busiest ? (
              <>
                <span aria-hidden>{theme.kindIcons[busiest.kind]} </span>
                {KINDS[busiest.kind].label}
                <span className="text-slate-400"> ×{busiest.completed}</span>
              </>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </dd>
        </div>
      </dl>

      {mix.length > 1 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-meta text-slate-400">
          {mix.slice(1).map((kind) => (
            <li key={kind.kind}>
              <span aria-hidden>{theme.kindIcons[kind.kind]} </span>
              {KINDS[kind.kind].label} ×{kind.completed}
            </li>
          ))}
        </ul>
      )}

      {bests && bests.completed > 0 && (
        <section aria-labelledby="bests-title" className="mt-4">
          <h3 id="bests-title" className="font-pixel text-pixel-xs uppercase text-slate-400">
            Personal bests
          </h3>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            {bests.bestDay && (
              <Best label="Best day" value={`${bests.bestDay.xp.toLocaleString()} ${theme.words.xp}`} note={`${shortDay(bests.bestDay.day)} · ${bests.bestDay.completed} done`} />
            )}
            {bests.bestWeek && (
              <Best label="Best week" value={`${bests.bestWeek.xp.toLocaleString()} ${theme.words.xp}`} note={`from ${shortDay(bests.bestWeek.weekStart)}`} />
            )}
            {bests.biggest && <Best label="Biggest issue" value={`${bests.biggest.xp} ${theme.words.xp}`} note={bests.biggest.key} mono />}
            <Best label="Finished" value={String(bests.completed)} note={bests.firstDay ? `since ${shortDay(bests.firstDay)}` : ''} />
          </dl>
        </section>
      )}

      {milestones.length > 0 && (
        <section aria-labelledby="levels-title" className="mt-4">
          <h3 id="levels-title" className="font-pixel text-pixel-xs uppercase text-slate-400">
            {theme.words.level} timeline
          </h3>
          <ol className="mt-2 border-l-2 border-slate-800 pl-3 text-sm">
            {[...milestones].reverse().slice(0, MILESTONES_SHOWN).map((m, i) => (
              <li key={m.level} className="relative py-1">
                <span aria-hidden className={`absolute -left-[17px] top-2 size-2.5 rounded-full ${i === 0 ? 'bg-amber-400' : 'bg-slate-700'}`} />
                <span className={i === 0 ? 'font-pixel text-pixel-sm text-amber-300' : 'font-pixel text-pixel-sm text-slate-300'}>
                  {theme.words.level} {m.level}
                </span>
                <span className="text-slate-400">
                  {' '}
                  · {longDay(m.day)} · <span className="font-mono text-meta">{m.key}</span>
                </span>
              </li>
            ))}
            {milestones.length > MILESTONES_SHOWN && (
              <li className="py-1 text-meta text-slate-400">and {milestones.length - MILESTONES_SHOWN} earlier level-ups</li>
            )}
          </ol>
        </section>
      )}
    </div>
  );
}

function Best({ label, value, note, mono = false }: { label: string; value: string; note: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
      <dt className="font-pixel text-pixel-xs uppercase text-slate-400">{label}</dt>
      <dd className="mt-1 tabular-nums text-amber-300">{value}</dd>
      {note && <dd className={`text-meta text-slate-400 ${mono ? 'font-mono' : ''}`}>{note}</dd>}
    </div>
  );
}
