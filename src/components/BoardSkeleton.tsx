import { useTheme } from '../lib/activeTheme';

/**
 * The board's shape while the first load is in flight. A real Jira board pages through up to ten sequential
 * requests, so this stands in for several seconds rather than a flash. It mirrors Roster's rail and
 * CharacterCard's outer geometry so nothing jumps when the real board arrives.
 */
export function BoardSkeleton() {
  const { words } = useTheme();

  return (
    <div className="bg-arena min-h-screen lg:flex">
      {/* Decorative: the status line below carries the announcement. */}
      <div aria-hidden className="border-b border-slate-800 bg-slate-950/70 lg:h-screen lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex gap-2 overflow-hidden px-3 py-4 lg:flex-col">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex w-56 shrink-0 items-center gap-3 rounded-xl border-2 border-transparent p-2 lg:w-auto">
              <Block className="size-10 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Block className="h-3 w-24 rounded-sm" />
                <Block className="h-2 w-16 rounded-sm" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p role="status" aria-live="polite" className="px-6 pt-8 font-pixel text-sm text-slate-300 lg:px-10">
          {words.loading}
        </p>

        <div aria-hidden className="flex flex-wrap items-start justify-center gap-x-6 gap-y-12 px-4 pt-10 lg:px-10">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex w-72 flex-col rounded-2xl border-2 border-slate-800 bg-slate-950/85 p-4">
              <div className="flex items-center gap-3">
                <Block className="size-14 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Block className="h-4 w-28 rounded-sm" />
                  <Block className="h-2.5 w-20 rounded-sm" />
                </div>
              </div>
              <Block className="mt-4 h-3 w-full rounded-sm" />
              <div className="mt-4 space-y-2 border-t border-slate-800 pt-3">
                {Array.from({ length: 3 }, (_, row) => (
                  <Block key={row} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** One pulsing placeholder. Reduced motion stops the pulse through the rule in index.css. */
function Block({ className }: { className: string }) {
  return <div className={`animate-pulse bg-slate-800 ${className}`} />;
}

/** Placeholder rows for a list that is still loading, e.g. the profile's issues or an issue's comments. */
export function SkeletonRows({ count, label }: { count: number; label: string }) {
  return (
    <div className="py-2">
      <p role="status" aria-live="polite" className="sr-only">
        {label}
      </p>
      <div aria-hidden className="space-y-2">
        {Array.from({ length: count }, (_, i) => (
          <Block key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
