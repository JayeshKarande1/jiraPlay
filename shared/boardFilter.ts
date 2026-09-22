import type { Member } from './heroes';
import { memberStats } from './heroes';
import type { Quest, QuestKind, QuestStage } from './types';
import { isOverdue } from './xp';

/** Which issues the board shows. Stage 'overdue' is a view, not a Jira stage. */
export interface QuestFilter {
  /** Matched against the summary and the issue key, case-insensitively. */
  text: string;
  /** Empty means every kind. */
  kinds: QuestKind[];
  stage: QuestStage | 'all' | 'overdue';
}

export const EMPTY_FILTER: QuestFilter = { text: '', kinds: [], stage: 'all' };

/** True when the filter would hide nothing, so the board can skip the work and the "showing N of M" note. */
export const isEmptyFilter = (filter: QuestFilter): boolean => filter.text.trim() === '' && filter.kinds.length === 0 && filter.stage === 'all';

export function questMatches(quest: Quest, filter: QuestFilter): boolean {
  if (filter.kinds.length > 0 && !filter.kinds.includes(quest.kind)) return false;
  if (filter.stage === 'overdue') {
    if (!isOverdue(quest)) return false;
  } else if (filter.stage !== 'all' && quest.stage !== filter.stage) {
    return false;
  }
  const text = filter.text.trim().toLowerCase();
  if (!text) return true;
  return quest.summary.toLowerCase().includes(text) || quest.key.toLowerCase().includes(text);
}

/** Returns the same array when nothing is filtered out, so memoised cards can skip a render. */
export function filterQuests(quests: Quest[], filter: QuestFilter): Quest[] {
  if (isEmptyFilter(filter)) return quests;
  const kept = quests.filter((quest) => questMatches(quest, filter));
  return kept.length === quests.length ? quests : kept;
}

/** How the party is ordered on the board. */
export type MemberSort = 'board' | 'level' | 'name' | 'open' | 'overdue';

export const MEMBER_SORTS: { id: MemberSort; label: string }[] = [
  { id: 'board', label: 'Board order' },
  { id: 'level', label: 'Highest level' },
  { id: 'open', label: 'Most open' },
  { id: 'overdue', label: 'Most overdue' },
  { id: 'name', label: 'Name' },
];

/**
 * Sorts a copy of the party. Unassigned always sits last whatever the sort: it isn't a teammate, and it would
 * otherwise top "most open" on a busy board. Ties keep board order, so the list doesn't shuffle between polls.
 */
export function sortMembers(members: Member[], sort: MemberSort): Member[] {
  if (sort === 'board') return members;
  const rank = new Map(members.map((m, i) => [m.hero.id, i]));
  const openOf = (m: Member) => m.quests.filter((q) => !q.done).length;
  const score = (m: Member): number => {
    switch (sort) {
      case 'level':
        return memberStats(m).level;
      case 'open':
        return openOf(m);
      case 'overdue':
        return memberStats(m).overdue;
      default:
        return 0;
    }
  };
  return [...members].sort((a, b) => {
    if (a.isTavern !== b.isTavern) return a.isTavern ? 1 : -1;
    if (sort === 'name') return a.hero.name.localeCompare(b.hero.name) || rank.get(a.hero.id)! - rank.get(b.hero.id)!;
    return score(b) - score(a) || rank.get(a.hero.id)! - rank.get(b.hero.id)!;
  });
}
