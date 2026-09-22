import { useId, useState } from 'react';
import type { DayPoint, WeekPoint } from '../../shared/recap';

/*
 * Two small charts, both a single series, so neither needs a legend: the title names the series.
 * Every colour comes from the theme's own CSS variables — the accent for the marks, slate for ink and grid —
 * so these follow all eight themes, including Daylight, without a palette of their own.
 */

const ACCENT = 'var(--color-amber-400)';
const GRID = 'color-mix(in srgb, var(--color-slate-400) 22%, transparent)';
/* Recessive: the line carries the shape, the fill only weights it. Much above this and amber on a dark
 * ground goes muddy brown. */
const FILL = 'color-mix(in srgb, var(--color-amber-400) 13%, transparent)';

const shortDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** A hidden table, so the numbers are readable without seeing the drawing. */
function DataTable({ caption, rows }: { caption: string; rows: [string, string][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const W = 320;
const H = 120;
const PAD = { top: 12, right: 10, bottom: 18, left: 10 };

/** Cumulative XP across the sprint: how the work actually landed, not just the total. */
export function SprintChart({ series, label }: { series: DayPoint[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();

  if (series.length < 2) return null;
  const peak = Math.max(...series.map((p) => p.total), 1);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (series.length - 1)) * plotW;
  const y = (total: number) => PAD.top + plotH - (total / peak) * plotH;

  const line = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ');
  const area = `${line} L${x(series.length - 1).toFixed(1)},${PAD.top + plotH} L${x(0).toFixed(1)},${PAD.top + plotH} Z`;
  const last = series[series.length - 1];
  const active = hover === null ? null : series[hover];

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${label}. ${last.total} XP by ${shortDay(last.day)}.`}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
          </clipPath>
        </defs>

        {/* Recessive grid: only the two lines a reader needs, the baseline and the peak. */}
        <line x1={PAD.left} y1={PAD.top + plotH} x2={W - PAD.right} y2={PAD.top + plotH} stroke={GRID} strokeWidth="1" />
        <line x1={PAD.left} y1={PAD.top} x2={W - PAD.right} y2={PAD.top} stroke={GRID} strokeWidth="1" strokeDasharray="2 3" />

        <path d={area} fill={FILL} clipPath={`url(#${clipId})`} />
        <path d={line} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {/* The endpoint is the number people came for, so it gets the marker. */}
        <circle cx={x(series.length - 1)} cy={y(last.total)} r="4" fill={ACCENT} stroke="var(--color-slate-950)" strokeWidth="2" />

        {active && (
          <g>
            <line x1={x(hover!)} y1={PAD.top} x2={x(hover!)} y2={PAD.top + plotH} stroke={GRID} strokeWidth="1" />
            <circle cx={x(hover!)} cy={y(active.total)} r="4" fill={ACCENT} stroke="var(--color-slate-950)" strokeWidth="2" />
          </g>
        )}

        <text x={PAD.left} y={H - 5} className="text-pixel-xs" fill="var(--color-slate-400)">
          {shortDay(series[0].day)}
        </text>
        <text x={W - PAD.right} y={H - 5} textAnchor="end" className="text-pixel-xs" fill="var(--color-slate-400)">
          {shortDay(last.day)}
        </text>
        <text x={W - PAD.right} y={PAD.top - 3} textAnchor="end" className="text-pixel-xs" fill="var(--color-slate-300)">
          {peak.toLocaleString()} XP
        </text>

        {/* Wide invisible hit targets, so the crosshair is easy to catch on a 320-wide chart. */}
        {series.map((point, i) => (
          <rect
            key={point.day}
            x={x(i) - plotW / (series.length - 1) / 2}
            y={PAD.top}
            width={plotW / (series.length - 1)}
            height={plotH}
            fill="transparent"
            onPointerEnter={() => setHover(i)}
          />
        ))}
      </svg>

      <figcaption className="mt-1 h-4 text-center text-meta text-slate-400" aria-hidden>
        {active ? `${shortDay(active.day)} · ${active.total.toLocaleString()} XP · +${active.completed} done` : label}
      </figcaption>
      <DataTable caption={label} rows={series.map((p) => [shortDay(p.day), `${p.total} XP total, ${p.completed} finished`])} />
    </figure>
  );
}

const BAR_W = 320;
const BAR_H = 92;

/** Eight weeks of finished work. Bars, because the question is "how much", week by week. */
export function WeekBars({ weeks, label }: { weeks: WeekPoint[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (weeks.length === 0) return null;

  const peak = Math.max(...weeks.map((w) => w.xp), 1);
  const plotH = BAR_H - 26;
  const slot = BAR_W / weeks.length;
  // A 2px gap of surface between neighbours keeps them separate marks rather than one block.
  const width = Math.max(slot - 2, 3);
  const best = weeks.reduce((top, w, i) => (w.xp > weeks[top].xp ? i : top), 0);
  const active = hover === null ? null : weeks[hover];

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${BAR_W} ${BAR_H}`} className="w-full" role="img" aria-label={label} onPointerLeave={() => setHover(null)}>
        <line x1="0" y1={plotH + 8} x2={BAR_W} y2={plotH + 8} stroke={GRID} strokeWidth="1" />
        {weeks.map((week, i) => {
          const height = week.xp === 0 ? 0 : Math.max((week.xp / peak) * (plotH - 10), 3);
          const x = i * slot + 1;
          return (
            <g key={week.weekStart} onPointerEnter={() => setHover(i)}>
              {/* Full-height hit target, so an empty week is still hoverable. */}
              <rect x={x} y="0" width={width} height={plotH + 8} fill="transparent" />
              {height > 0 && (
                <rect
                  x={x}
                  y={plotH + 8 - height}
                  width={width}
                  height={height}
                  rx="3"
                  fill={hover === i ? ACCENT : FILL}
                  stroke={ACCENT}
                  strokeWidth={hover === i ? 0 : 1}
                />
              )}
            </g>
          );
        })}
        {/* One direct label, on the best week — a number on every bar is noise. */}
        {weeks[best].xp > 0 && (
          <text
            x={best * slot + 1 + width / 2}
            y={plotH + 8 - Math.max((weeks[best].xp / peak) * (plotH - 10), 3) - 3}
            textAnchor="middle"
            className="text-pixel-xs"
            fill="var(--color-slate-300)"
          >
            {weeks[best].xp}
          </text>
        )}
        <text x="0" y={BAR_H - 4} className="text-pixel-xs" fill="var(--color-slate-400)">
          {shortDay(weeks[0].weekStart)}
        </text>
        <text x={BAR_W} y={BAR_H - 4} textAnchor="end" className="text-pixel-xs" fill="var(--color-slate-400)">
          this week
        </text>
      </svg>

      <figcaption className="mt-1 h-4 text-center text-meta text-slate-400" aria-hidden>
        {active ? `Week of ${shortDay(active.weekStart)} · ${active.xp} XP · ${active.completed} done` : label}
      </figcaption>
      <DataTable caption={label} rows={weeks.map((w) => [`Week of ${shortDay(w.weekStart)}`, `${w.xp} XP, ${w.completed} finished`])} />
    </figure>
  );
}
