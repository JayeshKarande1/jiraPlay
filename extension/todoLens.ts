import { projectsOf, type Todo } from '../shared/codeIssues';
import type { Board } from '../shared/types';

/** What a lens shows about an issue. A subset of Quest, so this file stays free of VS Code and of the board's shape. */
export interface LensQuest {
  summary: string;
  status: string;
  done: boolean;
}

/** What the lens needs to know about the board, so the provider doesn't reach into the extension. */
export interface BoardLookup {
  /** Project prefixes on the board, so `UTF-8` isn't mistaken for an issue. Empty until a board has loaded. */
  projects(): string[];
  /** The issue for a key, when the board has it. */
  quest(key: string): LensQuest | undefined;
}

/** A TODO naming an issue the board doesn't have is still worth linking; this is what the lens says. */
export function lensTitle(todo: Todo, found: LensQuest | undefined): string {
  if (!todo.key) return '$(add) Create Jira issue';
  if (!found) return `$(link-external) ${todo.key}`;
  return `${found.done ? '$(check)' : '$(circle-outline)'} ${todo.key} · ${found.status}`;
}

/** Board -> BoardLookup. Reads through a getter, so lenses follow the newest board without re-registering. */
export function boardLookup(getBoard: () => Board | null): BoardLookup {
  return {
    projects: () => projectsOf(getBoard()?.quests.map((q) => q.key) ?? []),
    quest: (key) => {
      const quest = getBoard()?.quests.find((q) => q.key.toUpperCase() === key.toUpperCase());
      return quest && { summary: quest.summary, status: quest.status, done: quest.done };
    },
  };
}
