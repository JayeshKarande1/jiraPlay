import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api, type ViewsInfo } from '../api';
import { activeView, removeView, upsertView, MAX_VIEWS } from '../../shared/views';

/**
 * Switches the board between named JQL queries. Switching rewrites the saved query and reloads the board, so
 * it's the one control here that changes what Jira is asked for.
 */
export function ViewPicker({ onSwitched, onError }: { onSwitched: () => void; onError: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<ViewsInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.views().then(setInfo, () => setInfo({ views: [], jql: '' }));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    // Captured, so Escape closes this menu without also leaving the page behind it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  if (!info) return null;
  const current = activeView(info.views, info.jql);

  const run = async (next: ViewsInfo['views'], jql?: string) => {
    setBusy(true);
    try {
      setInfo(await api.saveViews(next, jql));
      if (jql !== undefined) onSwitched();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch the board's query"
        className="flex h-9 max-w-44 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm text-slate-200 hover:border-slate-500"
      >
        <span aria-hidden>▦</span>
        <span className="hidden truncate sm:inline">{current?.name ?? 'This board'}</span>
        <span aria-hidden className="text-xs text-slate-400">
          ▾
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-700 bg-slate-950 p-2 shadow-2xl"
          >
            <p className="px-2 pb-2 pt-1 font-pixel text-pixel-xs text-slate-400">SAVED VIEWS</p>

            {info.views.length === 0 && <p className="px-2 pb-2 text-sm text-slate-400">None yet. Save the query you're on to come back to it.</p>}

            <ul className="space-y-1">
              {info.views.map((view) => {
                const isCurrent = view.id === current?.id;
                return (
                  <li key={view.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={busy || isCurrent}
                      aria-current={isCurrent ? 'true' : undefined}
                      onClick={() => void run(info.views, view.jql).then(() => setOpen(false))}
                      className={`min-w-0 flex-1 rounded-lg border p-2 text-left transition-colors disabled:opacity-100 ${
                        isCurrent ? 'border-amber-400 bg-slate-800/80' : 'border-transparent hover:bg-slate-900'
                      }`}
                    >
                      <span className="block truncate text-sm text-white">{view.name}</span>
                      <span className="block truncate text-meta text-slate-400">{view.jql}</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run(removeView(info.views, view.id))}
                      aria-label={`Delete the view ${view.name}`}
                      className="shrink-0 rounded-md px-2 py-1 text-slate-400 hover:text-rose-300"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-2 border-t border-slate-800 pt-2">
              {naming ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!name.trim()) return;
                    void run(upsertView(info.views, name, info.jql)).then(() => {
                      setName('');
                      setNaming(false);
                    });
                  }}
                  className="flex gap-1"
                >
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name this view"
                    className="min-w-0 flex-1 rounded-lg border-2 border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-amber-400"
                  />
                  <button type="submit" disabled={busy || !name.trim()} className="shrink-0 rounded-lg border border-amber-400/70 px-2 font-pixel text-pixel-xs uppercase text-amber-300 disabled:opacity-50">
                    Save
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  disabled={busy || !info.jql || info.views.length >= MAX_VIEWS || Boolean(current)}
                  onClick={() => setNaming(true)}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-900 disabled:opacity-50"
                >
                  {current ? `Showing “${current.name}”` : '+ Save this query as a view'}
                </button>
              )}
              <p className="px-2 pt-1 text-meta text-slate-400">Views only hold a JQL query, never your token.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
