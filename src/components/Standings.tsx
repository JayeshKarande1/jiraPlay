import type { HeroProgress } from '../../shared/types';
import type { Member } from '../../shared/heroes';
import { standings } from '../../shared/ledger';
import { levelStats } from '../../shared/xp';
import { useTheme } from '../lib/activeTheme';
import { HeroAvatar } from './HeroBits';

const MEDALS = ['🥇', '🥈', '🥉'];
const SHOWN = 5;

/** The party's leaderboard for this sprint, by XP earned. You're always listed once you've scored. */
export function Standings({ progress, members, meId }: { progress: Record<string, HeroProgress>; members: Member[]; meId: string | null }) {
  const { words, uiIcons } = useTheme();
  const ranked = standings(progress);
  const byId = new Map(members.map((m) => [m.hero.id, m]));
  const myRank = meId ? ranked.findIndex((p) => p.heroId === meId) : -1;
  const shown = ranked.slice(0, SHOWN);
  if (myRank >= SHOWN) shown.push(ranked[myRank]);

  return (
    <section aria-labelledby="standings-title" className="mx-auto mb-10 max-w-5xl rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <h2 id="standings-title" className="font-pixel text-pixel-sm uppercase text-slate-400">
        {words.party} standings · this sprint
      </h2>
      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Nobody has finished an issue this sprint yet. The first to finish one takes the lead.</p>
      ) : (
        <ol className="mt-3 flex flex-wrap gap-2">
          {shown.map((p) => {
            const rank = ranked.indexOf(p);
            const member = byId.get(p.heroId);
            const isMe = p.heroId === meId;
            return (
              <li
                key={p.heroId}
                className={`flex min-w-48 flex-1 items-center gap-2 rounded-xl border px-3 py-2 ${isMe ? 'border-amber-400/70 bg-amber-400/5' : 'border-slate-800'}`}
              >
                <span className="w-7 text-center font-pixel text-xs text-slate-300">
                  <span className="sr-only">Rank </span>
                  {MEDALS[rank] ?? `#${rank + 1}`}
                </span>
                {member && <HeroAvatar member={member} size="xs" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white">
                    {p.heroName}
                    {isMe && <span className="text-amber-300"> (you)</span>}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {words.level} {levelStats(p.xp).level}
                    {p.streak >= 2 && ` · ${uiIcons.streak} ${p.streak}-day streak`}
                  </span>
                </span>
                <span className="shrink-0 font-pixel text-pixel-md text-amber-300">
                  {p.sprintXp} {words.xp}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
