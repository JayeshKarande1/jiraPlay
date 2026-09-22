import type { BoardColumn, Quest, QuestStage } from './types';

/** Icons come from the active theme (`theme.stageIcons`). */
export interface StageMeta {
  title: string;
  /**
   * Like Jira's board colours (grey to do, blue in progress, green done), as a CSS colour each theme can re-point
   * (`--stage-*` in src/index.css). Mix it with color-mix() rather than appending hex alpha.
   */
  color: string;
}

export const STAGE_ORDER: QuestStage[] = ['todo', 'doing', 'done'];

export const STAGES: Record<QuestStage, StageMeta> = {
  todo: { title: 'TO DO', color: 'var(--stage-todo)' },
  doing: { title: 'IN PROGRESS', color: 'var(--stage-doing)' },
  done: { title: 'DONE', color: 'var(--stage-done)' },
};

/** Used when Jira gives no columns at all, e.g. a board with no issues and no Jira board. */
export const DEFAULT_COLUMNS: BoardColumn[] = STAGE_ORDER.map((stage) => ({ name: STAGES[stage].title, statusIds: [], stage }));

/** The column an issue belongs in: the one holding its status, else the first column of the same category. */
export function columnIndexFor(quest: Quest, columns: BoardColumn[]): number {
  const exact = columns.findIndex((c) => c.statusIds.includes(quest.statusId));
  if (exact >= 0) return exact;
  return Math.max(
    columns.findIndex((c) => c.stage === quest.stage),
    0,
  );
}

/** Column colours: each takes its category's colour, lightened a step for later columns in the same category. */
export function columnColors(columns: BoardColumn[]): string[] {
  const totals: Record<QuestStage, number> = { todo: 0, doing: 0, done: 0 };
  for (const column of columns) totals[column.stage]++;
  const seen: Record<QuestStage, number> = { todo: 0, doing: 0, done: 0 };
  return columns.map(({ stage }) => {
    const step = seen[stage]++;
    const lighten = totals[stage] > 1 ? Math.round((step / (totals[stage] - 1)) * 40) : 0;
    return lighten ? `color-mix(in srgb, ${STAGES[stage].color}, white ${lighten}%)` : STAGES[stage].color;
  });
}
