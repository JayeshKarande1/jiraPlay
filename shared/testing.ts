import type { Quest } from './types';

/** A to-do issue with sensible defaults, for tests. */
export function makeQuest(overrides: Partial<Quest> = {}): Quest {
  return {
    key: 'T-1',
    summary: 'An issue',
    kind: 'task',
    status: 'To Do',
    statusId: '1',
    stage: 'todo',
    done: false,
    points: null,
    priority: null,
    dueDate: null,
    description: '',
    url: null,
    assigneeId: 'hero',
    resolvedAt: null,
    ...overrides,
  };
}
