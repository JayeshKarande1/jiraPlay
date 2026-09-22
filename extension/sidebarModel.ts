import { bossState } from '../shared/boss';
import { standings } from '../shared/ledger';
import { THEMES, type ThemeId } from '../shared/themes';
import type { Board, Quest, QuestKind } from '../shared/types';
import { byUrgency, heroStats } from '../shared/xp';

/** One row in the JiraPlay sidebar, as plain data so it can be tested without VS Code. */
export interface SidebarNode {
  /** Unique across the whole tree. */
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  /** A codicon name, e.g. "bug". */
  icon?: string;
  command?: { command: string; title: string; arguments?: unknown[] };
  children?: SidebarNode[];
  /** Whether a row with children starts open. */
  expanded?: boolean;
}

const KIND_ICONS: Record<QuestKind, string> = { story: 'book', task: 'tasklist', bug: 'bug', epic: 'rocket', subtask: 'checklist' };
const MEDALS = ['🥇', '🥈', '🥉'];
const STANDINGS_SHOWN = 5;
const OPEN_BOARD = { command: 'jiraPlay.openBoard', title: 'Open Board' };

/**
 * The sidebar for a live Jira board: your level and streak, your open issues, the sprint boss and the standings.
 * Empty without a board or on demo data, so VS Code shows the welcome buttons instead.
 */
export function sidebarModel(board: Board | null, themeId: ThemeId): SidebarNode[] {
  if (!board || board.source !== 'jira') return [];
  const theme = THEMES[themeId];
  const { words } = theme;
  const nodes: SidebarNode[] = [];

  if (board.me) {
    const mine = board.quests.filter((q) => q.assigneeId === board.me?.id);
    const progress = board.progress[board.me.id];
    const stats = heroStats(mine, progress?.xp);
    nodes.push({
      id: 'level',
      label: `${words.level} ${stats.level} · ${stats.xp} ${words.xp}`,
      description: `${stats.toNext} to ${words.level} ${stats.level + 1}`,
      tooltip: `${board.me.name}: ${stats.xp} ${words.xp} in total`,
      icon: 'star-full',
      command: OPEN_BOARD,
    });
    if (progress && progress.streak > 0) {
      nodes.push({ id: 'streak', label: `${progress.streak}-day streak`, description: `best ${progress.bestStreak}`, icon: 'flame' });
    }
    const open = mine.filter((q) => !q.done).sort(byUrgency);
    nodes.push({
      id: 'mine',
      label: 'My open issues',
      description: String(open.length),
      icon: 'account',
      expanded: true,
      children: open.length > 0 ? open.map(questNode) : [{ id: 'mine-none', label: words.allDone, icon: 'check' }],
    });
  }

  const sprint = board.sprints[0] ?? null;
  const boss = bossState(board.quests, sprint);
  nodes.push({
    id: 'boss',
    label: boss.defeated ? `${theme.boss.name} defeated` : theme.boss.name,
    description: `${boss.hp}/${boss.maxHp} HP${boss.enraged ? ' · enraged' : ''}`,
    tooltip: sprint ? `Sprint boss for ${sprint.name}. Finishing issues deals damage.` : 'Board boss. Finishing issues deals damage.',
    icon: boss.defeated ? 'pass-filled' : 'shield',
    command: OPEN_BOARD,
  });

  const ranked = standings(board.progress).slice(0, STANDINGS_SHOWN);
  if (ranked.length > 0) {
    nodes.push({
      id: 'standings',
      label: 'Standings',
      description: 'this sprint',
      icon: 'list-ordered',
      children: ranked.map((p, i) => ({
        id: `rank-${p.heroId}`,
        label: `${MEDALS[i] ?? `#${i + 1}`} ${p.heroName}`,
        description: `${p.sprintXp} ${words.xp}${p.streak >= 2 ? ` · 🔥${p.streak}` : ''}`,
      })),
    });
  }
  return nodes;
}

function questNode(quest: Quest): SidebarNode {
  return {
    id: `quest-${quest.key}`,
    label: quest.summary,
    description: `${quest.key} · ${quest.status}`,
    tooltip: `${quest.key}: ${quest.summary}`,
    icon: KIND_ICONS[quest.kind],
    command: { command: 'jiraPlay.openIssue', title: 'Open issue', arguments: [quest.key] },
  };
}
