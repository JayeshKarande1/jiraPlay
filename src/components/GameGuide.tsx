import { motion } from 'motion/react';
import { useTheme } from '../lib/activeTheme';
import { useDialog } from '../lib/useDialog';

interface Props {
  /** Shown once after connecting, when the wording changes from "what is this?" to "what changed?". */
  justConnected: boolean;
  onClose: () => void;
}

/**
 * The game's terms next to the Jira terms they stand for. Opens once when demo data becomes a real board, and
 * from the ? button whenever someone forgets what a heart is.
 */
export function GameGuide({ justConnected, onClose }: Props) {
  const theme = useTheme();
  const { words } = theme;
  const ref = useDialog<HTMLDivElement>();

  const rows: { game: string; icon: string; jira: string; note: string }[] = [
    { game: `A ${words.hero}`, icon: theme.classes[0].icon, jira: 'An assignee', note: 'Everyone with an issue on the board gets a card and a class.' },
    { game: `The ${words.party}`, icon: theme.partyIcon, jira: 'Your team', note: 'Unassigned issues wait in their own column until someone picks them up.' },
    { game: 'An issue with stars', icon: '★', jira: 'Story points or priority', note: 'More points means more stars, and more XP when it is finished.' },
    { game: words.xp, icon: '✦', jira: 'Finished issues', note: `10 ${words.xp} per story point (10 without points), credited on the day Jira resolved it.` },
    { game: `${words.level}`, icon: '⬆', jira: 'All-time progress', note: 'Levels come from XP and stay when issues leave the board. Reopening an issue takes its XP back.' },
    { game: 'Hearts', icon: theme.heart, jira: 'Overdue issues', note: 'One heart is lost for every open issue past its due date.' },
    { game: theme.boss.name, icon: theme.boss.icon, jira: 'The sprint', note: 'Its HP is the XP of everything still open. Finishing an issue hits it; finishing everything defeats it.' },
    { game: 'Streak', icon: theme.uiIcons.streak, jira: 'Days in a row with finished work', note: 'Weekends without work do not break it.' },
    { game: 'Achievements', icon: '🏅', jira: 'Milestones', note: 'Badges earned from finished work only, so they are never lost by waiting.' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        tabIndex={-1}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        onClick={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-2xl rounded-2xl border-2 border-amber-400 bg-slate-950 p-5 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-pixel text-pixel-xs uppercase tracking-widest text-slate-400">{justConnected ? 'You are live' : 'How to read the board'}</p>
            <h2 id="guide-title" className="mt-1 font-pixel text-base leading-relaxed text-white">
              {justConnected ? 'Your Jira board, as a game' : 'What everything means'}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {justConnected
                ? 'The demo is gone; every card is now a real teammate and every issue is real. Here is how Jira maps onto the game.'
                : 'Nothing here changes Jira on its own. Marking an issue done, moving it or reassigning it does, and those ask first or can be undone.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the guide"
            className="shrink-0 rounded-lg border border-slate-700 px-2 py-1 text-slate-300 hover:border-slate-500"
          >
            ✕
          </button>
        </div>

        <dl className="mt-5 grid gap-2 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.game} className="flex gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2.5">
              <span aria-hidden className="mt-0.5 w-6 shrink-0 text-center text-lg">
                {row.icon}
              </span>
              <div className="min-w-0">
                <dt className="text-sm text-white">
                  {row.game} <span className="text-slate-400">= </span>
                  <span className="text-amber-300">{row.jira}</span>
                </dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-slate-400">{row.note}</dd>
              </div>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-xs text-slate-400">
          Press <kbd className="rounded border border-slate-700 bg-slate-900 px-1 font-mono">⌘K</kbd> or{' '}
          <kbd className="rounded border border-slate-700 bg-slate-900 px-1 font-mono">Ctrl+K</kbd> for the command palette: jump to any issue or teammate, mark
          things done, switch views and themes.
        </p>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            className="rounded-lg bg-amber-400 px-4 py-2 font-pixel text-pixel-md text-slate-950 transition-transform hover:scale-105"
          >
            {justConnected ? '▶ TO THE BOARD' : 'GOT IT'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
