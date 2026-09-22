import { ACHIEVEMENTS } from '../../shared/achievements';

/** Every achievement as a badge: earned ones in colour, locked ones greyed out with how to earn them. */
export function AchievementBadges({ earned }: { earned: string[] }) {
  const got = new Set(earned);
  return (
    <div>
      <p className="font-pixel text-pixel-xs text-slate-400">
        ACHIEVEMENTS · {got.size}/{ACHIEVEMENTS.length}
      </p>
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
