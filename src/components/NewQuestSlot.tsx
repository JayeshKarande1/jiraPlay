import { useState, type FormEvent } from 'react';

export function NewQuestSlot({ onCreate }: { onCreate: (summary: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = summary.trim();
    if (!text || busy) return;
    setBusy(true);
    const ok = await onCreate(text);
    setBusy(false);
    if (ok) {
      setSummary('');
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="mt-3 w-full rounded-lg border-2 border-dashed border-slate-700 py-2 font-pixel text-pixel-sm text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-300"
      >
        + NEW ISSUE
      </button>
    );
  }

  return (
    <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="mt-3">
      <input
        autoFocus
        value={summary}
        disabled={busy}
        onChange={(e) => setSummary(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setSummary('');
            setOpen(false);
          }
        }}
        onBlur={() => {
          if (!summary.trim()) setOpen(false);
        }}
        placeholder="Issue summary… (Enter)"
        className="w-full rounded-lg border-2 border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:border-slate-400 disabled:opacity-60"
      />
    </form>
  );
}
