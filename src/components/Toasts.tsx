import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

export interface Toast {
  id: number;
  text: string;
  tone: 'error' | 'success' | 'info';
  durationMs: number;
  /** A button on the toast, e.g. Undo. The toast closes when it's pressed. */
  action?: { label: string; onAction: () => void };
}

const TONES: Record<Toast['tone'], string> = {
  error: 'border-rose-500/70 text-rose-100',
  success: 'border-emerald-500/70 text-emerald-100',
  info: 'border-slate-600 text-slate-100',
};

/** Notifications stacked at the bottom of the screen. Each one closes after its duration, paused while hovered or focused. */
export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      role="region"
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastView key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastView({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const { id, durationMs, action } = toast;

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(id), durationMs);
    return () => clearTimeout(timer);
  }, [paused, id, durationMs, onDismiss]);

  return (
    <motion.div
      layout
      role={toast.tone === 'error' ? 'alert' : 'status'}
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 12, opacity: 0 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg border bg-slate-950 px-4 py-3 text-sm shadow-xl ${TONES[toast.tone]}`}
    >
      <p className="min-w-0 flex-1">{toast.text}</p>
      {action && (
        <button
          type="button"
          onClick={() => {
            action.onAction();
            onDismiss(id);
          }}
          className="shrink-0 rounded-md border border-amber-400/70 px-2.5 py-1.5 font-pixel text-pixel-sm uppercase text-amber-300 hover:bg-amber-400/10"
        >
          {action.label}
        </button>
      )}
      <button type="button" onClick={() => onDismiss(id)} aria-label="Dismiss notification" className="shrink-0 text-slate-400 hover:text-slate-100">
        ✕
      </button>
    </motion.div>
  );
}
