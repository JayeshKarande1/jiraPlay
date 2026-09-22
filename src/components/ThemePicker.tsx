import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { setTheme, useTheme } from '../lib/activeTheme';
import { sfx } from '../lib/sound';
import { THEME_LIST } from '../../shared/themes';

export function ThemePicker() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    // Captured so Escape closes the menu without also leaving the hero page behind it.
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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Change theme"
        className="flex h-9 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm text-slate-200 hover:border-slate-500"
      >
        <span>{theme.icon}</span>
        <span className="hidden sm:inline">{theme.name}</span>
        <span className="text-xs text-slate-400">▾</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-700 bg-slate-950 p-2 shadow-2xl"
          >
            <p className="px-2 pb-2 pt-1 font-pixel text-pixel-xs text-slate-400">CHOOSE A THEME</p>
            <ul className="space-y-1">
              {THEME_LIST.map((t) => {
                const active = t.id === theme.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setTheme(t.id);
                        sfx.select();
                        setOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors ${
                        active ? 'border-amber-400 bg-slate-800/80' : 'border-transparent hover:bg-slate-900'
                      }`}
                    >
                      <span
                        className="grid size-11 shrink-0 place-items-center rounded-md text-xl"
                        style={{ background: t.swatch[0], boxShadow: `inset 0 0 0 2px ${t.swatch[1]}, inset 0 -8px 16px -8px ${t.swatch[2]}` }}
                      >
                        {t.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-white" style={{ fontFamily: t.font }}>
                          {t.name}
                        </span>
                        <span className="block truncate text-xs text-slate-400">{t.tagline}</span>
                      </span>
                      {active && <span className="text-amber-300">✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
