import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Quest, QuestTransition } from '../../shared/types';
import { STAGES } from '../../shared/stages';

/** Wait after a change before asking Jira what comes next, so the transition has finished. */
const RELOAD_DELAY_MS = 800;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The workflow's name for a move, unless it only repeats the target status ("From In Progress to Code Review"). */
function moveLabel(transition: QuestTransition): string | null {
  return transition.name.toLowerCase().includes(transition.toStatus.toLowerCase()) ? null : transition.name;
}

/**
 * The issue's status with a menu of the moves its Jira workflow allows.
 * The menu opens inline rather than as a native select, so long names wrap inside the dialog.
 */
export function StatusPicker({ quest, onChange }: { quest: Quest; onChange: (transition: QuestTransition) => void }) {
  const [transitions, setTransitions] = useState<QuestTransition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const loaded = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    // The reset clears the previous status's moves while the new ones load.
    // oxlint-disable-next-line react/set-state-in-effect -- the moves come from Jira's workflow, the external system.
    setTransitions(null);
    setError(null);
    const timer = setTimeout(
      () => {
        api.transitions(quest.key).then(
          (next) => {
            loaded.current = true;
            if (!cancelled) setTransitions(next);
          },
          (err: unknown) => {
            if (!cancelled) setError(errorText(err));
          },
        );
      },
      loaded.current ? RELOAD_DELAY_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [quest.key, quest.status]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const options = transitions?.filter((t) => t.toStatus !== quest.status) ?? [];
  const canChange = options.length > 0;
  const hint = error
    ? `Couldn't load status changes: ${error}`
    : !transitions
      ? 'Loading status changes…'
      : canChange
        ? 'Change status'
        : 'Your Jira workflow has no moves from this status';

  return (
    <div
      ref={ref}
      onKeyDown={(e) => {
        // Close just the menu, not the issue dialog behind it.
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        disabled={!canChange}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={hint}
        className="flex max-w-full items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-left text-sm text-slate-100 enabled:hover:border-slate-500 disabled:cursor-default disabled:border-transparent disabled:bg-transparent disabled:px-0"
      >
        <span className="size-2 shrink-0 rounded-full" style={{ background: STAGES[quest.stage].color }} aria-hidden />
        <span className="min-w-0 break-words">{quest.status}</span>
        {!transitions && !error && <span className="animate-pulse text-slate-400">…</span>}
        {canChange && <span className="shrink-0 text-xs text-slate-400">{open ? '▴' : '▾'}</span>}
      </button>

      {open && (
        <ul className="mt-2 space-y-1 rounded-lg border border-slate-700 bg-slate-900 p-1" aria-label="Move to">
          {options.map((t) => {
            const label = moveLabel(t);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onChange(t);
                  }}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-800 focus-visible:bg-slate-800"
                >
                  <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: STAGES[t.toStage].color }} aria-hidden />
                  <span className="min-w-0">
                    <span className="block break-words text-sm text-slate-100">{t.toStatus}</span>
                    {label && <span className="block break-words text-xs text-slate-400">{label}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
