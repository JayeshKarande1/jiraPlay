import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Member } from '../../shared/heroes';
import { HeroAvatar } from './HeroBits';

interface Props {
  members: Member[];
  /** The member id the issue belongs to now. */
  currentId: string;
  onAssign: (memberId: string) => void;
}

/** Who has the issue, with a menu to hand it to someone else: the keyboard and screen reader way to do what dragging does. */
export function AssignPicker({ members, currentId, onAssign }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = members.find((m) => m.hero.id === currentId);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      // Close just the menu, not the issue dialog behind it.
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div ref={ref} onKeyDown={onKeyDown}>
      {/* The button's visible text is just the current name, so aria-label adds the action it performs. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${current?.hero.name ?? 'Someone not on this board'} — assign to someone else`}
        title="Assign to someone else"
        className="flex max-w-full items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-left text-sm text-slate-100 hover:border-slate-500"
      >
        {current && <HeroAvatar member={current} size="xs" />}
        <span className="min-w-0 break-words">{current?.hero.name ?? 'Someone not on this board'}</span>
        <span className="shrink-0 text-xs text-slate-400" aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <ul ref={listRef} role="menu" aria-label="Assign to" className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-1">
          {members.map((member) => {
            const selected = member.hero.id === currentId;
            return (
              <li key={member.hero.id} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  tabIndex={-1}
                  onClick={() => {
                    close();
                    if (!selected) onAssign(member.hero.id);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-100 hover:bg-slate-800 focus-visible:bg-slate-800 focus-visible:outline-offset-[-2px]"
                >
                  <HeroAvatar member={member} size="xs" />
                  <span className="min-w-0 flex-1 break-words">{member.hero.name}</span>
                  {selected && <span className="text-amber-300" aria-hidden>✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
