import type { QuestKind } from './types';

/** Icons come from the active theme (`theme.kindIcons`); colours from its CSS (`--kind-*` in src/index.css). */
export interface KindMeta {
  /** The Jira issue type name. */
  label: string;
  /** A CSS colour that follows the theme. Mix it with color-mix() rather than appending hex alpha. */
  color: string;
}

export const KINDS: Record<QuestKind, KindMeta> = {
  story: { label: 'Story', color: 'var(--kind-story)' },
  task: { label: 'Task', color: 'var(--kind-task)' },
  bug: { label: 'Bug', color: 'var(--kind-bug)' },
  epic: { label: 'Epic', color: 'var(--kind-epic)' },
  subtask: { label: 'Subtask', color: 'var(--kind-subtask)' },
};
