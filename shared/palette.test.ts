import { describe, expect, it } from 'vitest';
import { rankEntries, type PaletteEntry } from './palette';

const entries: PaletteEntry[] = [
  { id: 'refresh', label: 'Refresh the board', group: 'Board' },
  { id: 'recap', label: 'Sprint recap', group: 'Board' },
  { id: 'q1', label: 'Fix the login redirect', hint: 'PD-12', group: 'Issues' },
  { id: 'q2', label: 'Mark PD-7 as done', hint: 'PD-7', group: 'Issues' },
  { id: 'ada', label: 'Ada Lovelace', hint: 'teammate', group: 'People' },
];

describe('rankEntries', () => {
  it('keeps the given order when nothing is typed', () => {
    expect(rankEntries(entries, '  ').map((e) => e.id)).toEqual(['refresh', 'recap', 'q1', 'q2', 'ada']);
  });

  it('matches the label or the hint, prefix first', () => {
    expect(rankEntries(entries, 'pd-1').map((e) => e.id)).toEqual(['q1']);
    expect(rankEntries(entries, 'pd').map((e) => e.id)).toEqual(['q1', 'q2']);
    expect(rankEntries(entries, 're').map((e) => e.id)).toEqual(['refresh', 'recap', 'q1', 'q2']);
  });

  it('falls back to characters in order, so a few letters still find a command', () => {
    expect(rankEntries(entries, 'srcp').map((e) => e.id)).toEqual(['recap']);
    expect(rankEntries(entries, 'zzz')).toEqual([]);
  });

  it('caps the list', () => {
    expect(rankEntries(entries, '', 2)).toHaveLength(2);
  });
});
