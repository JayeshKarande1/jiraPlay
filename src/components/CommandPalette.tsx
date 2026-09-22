import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { rankEntries, type PaletteEntry } from '../../shared/palette';
import { useDialog } from '../lib/useDialog';

/** One thing the palette can do. `run` returns a new page of entries to keep the palette open on a follow-up choice. */
export interface PaletteCommand extends PaletteEntry {
  icon?: ReactNode;
  /** Shown on the right, e.g. a status or a keyboard shortcut. */
  meta?: string;
  run: () => PalettePage | void;
}

/** A follow-up step, e.g. "which issue?" after "Mark done…". */
export interface PalettePage {
  title: string;
  placeholder: string;
  commands: PaletteCommand[];
}

interface Props {
  root: PalettePage;
  onClose: () => void;
}

const MAX_SHOWN = 40;

/**
 * ⌘K: jump to any issue or teammate, run the board's commands and walk multi-step ones (mark done, assign, move)
 * without leaving the keyboard. Arrows move, Enter runs, Escape steps back or closes.
 */
export function CommandPalette({ root, onClose }: Props) {
  const ref = useDialog<HTMLDivElement>();
  const listRef = useRef<HTMLUListElement>(null);
  const [pages, setPages] = useState<PalettePage[]>([root]);
  const page = pages[pages.length - 1];
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const shown = useMemo(() => rankEntries(page.commands, query, MAX_SHOWN), [page.commands, query]);
  const current = Math.min(active, Math.max(0, shown.length - 1));

  const run = (command: PaletteCommand) => {
    const next = command.run();
    if (next) {
      setPages((list) => [...list, next]);
      setQuery('');
      setActive(0);
    } else {
      onClose();
    }
  };

  const back = () => {
    if (pages.length > 1) {
      setPages((list) => list.slice(0, -1));
      setQuery('');
      setActive(0);
    } else {
      onClose();
    }
  };

  useEffect(() => {
    // Optional call: jsdom has no scrollIntoView.
    listRef.current?.querySelector<HTMLElement>(`[data-index="${current}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [current, shown]);

  /** Groups keep their first-seen order, so results read as sections rather than one long list. */
  const groups = useMemo(() => {
    const byGroup = new Map<string, { command: PaletteCommand; index: number }[]>();
    shown.forEach((command, index) => byGroup.set(command.group, [...(byGroup.get(command.group) ?? []), { command, index }]));
    return [...byGroup];
  }, [shown]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="fixed inset-0 z-[55] flex items-start justify-center bg-slate-950/70 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        tabIndex={-1}
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => (shown.length === 0 ? 0 : (Math.min(i, shown.length - 1) + 1) % shown.length));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => (shown.length === 0 ? 0 : (Math.min(i, shown.length - 1) - 1 + shown.length) % shown.length));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (shown[current]) run(shown[current]);
          } else if (e.key === 'Escape') {
            // Captured here so the board behind doesn't also act on it.
            e.preventDefault();
            e.stopPropagation();
            back();
          } else if (e.key === 'Backspace' && !query && pages.length > 1) {
            e.preventDefault();
            back();
          }
        }}
        className="w-full max-w-xl overflow-hidden rounded-2xl border-2 border-slate-700 bg-slate-950 shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-slate-800 px-3">
          {pages.length > 1 && (
            <button type="button" onClick={back} aria-label="Back" className="rounded px-1 font-pixel text-pixel-xs text-slate-400 hover:text-white">
              ◀ {pages[pages.length - 2].title.toUpperCase()}
            </button>
          )}
          <span className="font-pixel text-pixel-xs uppercase text-amber-300">{page.title}</span>
          <input
            data-autofocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder={page.placeholder}
            aria-label={page.placeholder}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={shown[current] ? `palette-${shown[current].id}` : undefined}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent px-2 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <kbd className="hidden rounded border border-slate-700 px-1.5 py-0.5 font-mono text-pixel-xs text-slate-400 sm:inline">esc</kbd>
        </div>

        <ul id="palette-list" ref={listRef} role="listbox" className="max-h-[50vh] overflow-y-auto overscroll-contain p-2">
          {groups.map(([group, items]) => (
            <li key={group} role="presentation">
              <p className="px-2 pb-1 pt-2 font-pixel text-pixel-xs uppercase text-slate-400">{group}</p>
              <ul role="group" aria-label={group}>
                {items.map(({ command, index }) => {
                  const selected = index === current;
                  return (
                    <li
                      key={command.id}
                      id={`palette-${command.id}`}
                      role="option"
                      aria-selected={selected}
                      data-index={index}
                      onPointerMove={() => setActive(index)}
                      onClick={() => run(command)}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm ${selected ? 'bg-slate-800 text-white' : 'text-slate-300'}`}
                    >
                      <span aria-hidden className="grid w-6 shrink-0 place-items-center text-base">
                        {command.icon ?? '›'}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{command.label}</span>
                      {command.hint && command.hint !== command.label && <span className="shrink-0 font-mono text-meta text-slate-400">{command.hint}</span>}
                      {command.meta && <span className="shrink-0 text-meta text-slate-400">{command.meta}</span>}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
          {shown.length === 0 && <li className="px-2 py-6 text-center text-sm text-slate-400">Nothing matches.</li>}
        </ul>

        <p className="border-t border-slate-800 px-3 py-1.5 font-pixel text-pixel-xs uppercase text-slate-400">↑↓ move · enter run · esc {pages.length > 1 ? 'back' : 'close'}</p>
      </motion.div>
    </motion.div>
  );
}
