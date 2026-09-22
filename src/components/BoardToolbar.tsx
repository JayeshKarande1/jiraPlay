import { useEffect, useRef } from 'react';
import { MEMBER_SORTS, type MemberSort, type QuestFilter } from '../../shared/boardFilter';
import { KINDS } from '../../shared/kinds';
import { STAGES } from '../../shared/stages';
import type { QuestKind } from '../../shared/types';
import { useTheme } from '../lib/activeTheme';

export type BoardGrouping = 'party' | 'status';

interface Props {
  filter: QuestFilter;
  onFilter: (next: QuestFilter) => void;
  sort: MemberSort;
  onSort: (next: MemberSort) => void;
  grouping: BoardGrouping;
  onGrouping: (next: BoardGrouping) => void;
  /** How many issues the filter keeps, and how many there are. */
  showing: number;
  total: number;
}

const STAGE_TABS: { id: QuestFilter['stage']; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'todo', label: STAGES.todo.title },
  { id: 'doing', label: STAGES.doing.title },
  { id: 'done', label: STAGES.done.title },
  { id: 'overdue', label: 'Overdue' },
];

/** Find, narrow and reorder the board. Everything here is a view: nothing is sent to Jira. */
export function BoardToolbar({ filter, onFilter, sort, onSort, grouping, onGrouping, showing, total }: Props) {
  const theme = useTheme();
  const search = useRef<HTMLInputElement>(null);

  // ⌘/Ctrl+F puts the cursor in the board's search rather than the browser's.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        search.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleKind = (kind: QuestKind) =>
    onFilter({ ...filter, kinds: filter.kinds.includes(kind) ? filter.kinds.filter((k) => k !== kind) : [...filter.kinds, kind] });

  const narrowed = showing !== total;

  return (
    <section aria-label="Board filters" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
      <label className="flex min-w-0 flex-1 basis-56 items-center gap-2">
        <span className="sr-only">Search issues</span>
        <input
          ref={search}
          type="search"
          value={filter.text}
          onChange={(e) => onFilter({ ...filter, text: e.target.value })}
          placeholder="Find an issue… (⌘F)"
          className="min-w-0 flex-1 rounded-lg border-2 border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400"
        />
      </label>

      <div role="group" aria-label="Status" className="flex flex-wrap gap-1">
        {STAGE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={filter.stage === tab.id}
            onClick={() => onFilter({ ...filter, stage: tab.id })}
            className={`rounded-full border px-2.5 py-1 font-pixel text-pixel-xs uppercase transition-colors ${
              filter.stage === tab.id ? 'border-amber-400 bg-amber-400/15 text-amber-200' : 'border-slate-700 text-slate-400 hover:border-slate-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="group" aria-label="Issue type" className="flex flex-wrap gap-1">
        {(Object.keys(KINDS) as QuestKind[]).map((kind) => {
          const on = filter.kinds.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={on}
              title={KINDS[kind].label}
              onClick={() => toggleKind(kind)}
              className="rounded-md border px-1.5 py-1 text-sm transition-colors"
              style={{
                borderColor: on ? KINDS[kind].color : 'transparent',
                background: on ? `color-mix(in srgb, ${KINDS[kind].color} 15%, transparent)` : 'transparent',
                opacity: on || filter.kinds.length === 0 ? 1 : 0.45,
              }}
            >
              <span aria-hidden>{theme.kindIcons[kind]}</span>
              <span className="sr-only">{KINDS[kind].label}</span>
            </button>
          );
        })}
      </div>

      <label className="flex items-center gap-1.5 font-pixel text-pixel-xs uppercase text-slate-400">
        <span>Group</span>
        <select
          value={grouping}
          onChange={(e) => onGrouping(e.target.value as BoardGrouping)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 font-sans text-sm text-slate-100"
        >
          <option value="party">By {theme.words.hero}</option>
          <option value="status">By status</option>
        </select>
      </label>

      {grouping === 'party' && (
        <label className="flex items-center gap-1.5 font-pixel text-pixel-xs uppercase text-slate-400">
          <span>Sort</span>
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value as MemberSort)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 font-sans text-sm text-slate-100"
          >
            {MEMBER_SORTS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <p role="status" className={`text-meta ${narrowed ? 'text-amber-300' : 'text-slate-400'}`}>
        {narrowed ? `${showing} of ${total} issues` : `${total} issues`}
      </p>

      {narrowed && (
        <button type="button" onClick={() => onFilter({ text: '', kinds: [], stage: 'all' })} className="text-meta text-slate-400 underline hover:text-slate-200">
          Clear
        </button>
      )}
    </section>
  );
}
