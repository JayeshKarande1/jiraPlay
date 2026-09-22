import { describe, expect, it } from 'vitest';
import type { BoardColumn } from './types';
import { columnColors, columnIndexFor, STAGES } from './stages';
import { makeQuest } from './testing';

const columns: BoardColumn[] = [
  { name: 'To Do', statusIds: ['1'], stage: 'todo' },
  { name: 'In Progress', statusIds: ['2', '3'], stage: 'doing' },
  { name: 'Code Review', statusIds: ['4'], stage: 'done' },
  { name: 'Done', statusIds: ['5'], stage: 'done' },
];

describe('columnIndexFor', () => {
  it('uses the column holding the status', () => {
    expect(columnIndexFor(makeQuest({ statusId: '3', stage: 'doing' }), columns)).toBe(1);
    expect(columnIndexFor(makeQuest({ statusId: '5', stage: 'done' }), columns)).toBe(3);
  });

  it('falls back to the first column of the same stage', () => {
    expect(columnIndexFor(makeQuest({ statusId: '', stage: 'done' }), columns)).toBe(2);
  });

  it('falls back to the first column when no stage matches', () => {
    expect(columnIndexFor(makeQuest({ statusId: '9', stage: 'doing' }), [columns[0], columns[3]])).toBe(0);
  });
});

describe('columnColors', () => {
  it('uses the stage colour for a lone column and lightens later ones in the same stage', () => {
    const colors = columnColors(columns);
    expect(colors[0]).toBe(STAGES.todo.color);
    expect(colors[1]).toBe(STAGES.doing.color);
    expect(colors[2]).toBe(STAGES.done.color);
    expect(colors[3]).toBe(`color-mix(in srgb, ${STAGES.done.color}, white 40%)`);
  });
});
