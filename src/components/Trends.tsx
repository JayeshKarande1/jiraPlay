import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { XpEntry } from '../../shared/types';
import { kindMix, weekSeries } from '../../shared/recap';
import { KINDS } from '../../shared/kinds';
import { useTheme } from '../lib/activeTheme';
import { WeekBars } from './Charts';

/** Your own last eight weeks, from the saved XP ledger. No Jira requests: the host already has this. */
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
    </div>
  );
}
