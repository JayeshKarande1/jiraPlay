import { ACHIEVEMENTS } from '../../shared/achievements';

interface Props {
  earned: string[];
  /**
   * The full cabinet: every badge with its name and how to earn it, locked ones greyed with the hint in plain
   * sight. The default is the compact row of icons, with the hint on hover.
   */
  cabinet?: boolean;
}

/** Every achievement as a badge: earned ones in colour, locked ones greyed out with how to earn them. */
export function AchievementBadges({ earned, cabinet = false }: Props) {
  const got = new Set(earned);
  const heading = (
    <p className="font-pixel text-pixel-xs text-slate-400">
      ACHIEVEMENTS · {got.size}/{ACHIEVEMENTS.length}
    </p>
  );

  if (cabinet) {
    return (
      <div>
        {heading}
        <ul className="mt-2 grid grid-cols-2 gap-1.5">
          {ACHIEVEMENTS.map((a) => {
            const has = got.has(a.id);
            return (
              <li
                key={a.id}
                aria-label={`${a.name}, ${has ? 'earned' : 'locked'}: ${a.description}`}
                className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${has ? 'border-amber-400/60 bg-amber-400/10' : 'border-slate-800 bg-slate-900/60'}`}
              >
                <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-md text-lg ${has ? '' : 'opacity-40 grayscale'}`}>
                  {a.icon}
                </span>
                <span className="min-w-0">
                  <span className={`block truncate text-xs font-medium ${has ? 'text-white' : 'text-slate-400'}`}>{a.name}</span>
                  <span className="block truncate text-pixel-xs text-slate-400">{has ? 'Earned' : a.description}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div>
      {heading}
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {ACHIEVEMENTS.map((a) => {
          const has = got.has(a.id);
          return (
            <li
              key={a.id}
              title={`${a.name}: ${a.description}${has ? '' : ' (locked)'}`}
              aria-label={`${a.name}, ${has ? 'earned' : 'locked'}: ${a.description}`}
              className={`grid size-9 place-items-center rounded-lg border text-lg ${
                has ? 'border-amber-400/60 bg-amber-400/10' : 'border-slate-800 bg-slate-900 opacity-40 grayscale'
              }`}
            >
              <span aria-hidden>{a.icon}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
