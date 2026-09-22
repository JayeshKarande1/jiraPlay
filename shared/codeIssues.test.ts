import { describe, expect, it } from 'vitest';
import { codeIssue, descriptionFor, findIssueKey, findTodos, projectsOf, summaryFor, SUMMARY_MAX } from './codeIssues';

describe('findIssueKey', () => {
  it('finds an uppercase key anywhere in the text', () => {
    expect(findIssueKey('see PD-918 for why')).toBe('PD-918');
    expect(findIssueKey('ABC1-7')).toBe('ABC1-7');
    expect(findIssueKey('no key here')).toBeNull();
    expect(findIssueKey('2026-09-18')).toBeNull();
  });

  it('ignores lowercase, which is where the lookalikes live', () => {
    expect(findIssueKey('utf-8')).toBeNull();
    expect(findIssueKey('sha-1')).toBeNull();
  });

  it('is exact when the board’s projects are known, and then accepts any case', () => {
    // UTF-8 and SHA-1 are structurally valid keys; only the project list can tell them apart.
    expect(findIssueKey('encoded as UTF-8')).toBe('UTF-8');
    expect(findIssueKey('encoded as UTF-8', ['PD', 'FUN'])).toBeNull();
    expect(findIssueKey('see fun-101', ['PD', 'FUN'])).toBe('FUN-101');
    expect(findIssueKey('see PD-918', [])).toBeNull();
  });
});

describe('projectsOf', () => {
  it('reduces board keys to their project prefixes', () => {
    expect(projectsOf(['PD-1', 'PD-2', 'FUN-30']).sort()).toEqual(['FUN', 'PD']);
    expect(projectsOf(['not a key', ''])).toEqual([]);
  });
});

describe('findTodos', () => {
  it('finds each marker and keeps the note', () => {
    const todos = findTodos(['// TODO: wire this up', 'const x = 1;', '# FIXME rounding is wrong', '/* HACK works for now */'].join('\n'));
    expect(todos.map((t) => [t.line, t.marker, t.text])).toEqual([
      [0, 'TODO', 'wire this up'],
      [2, 'FIXME', 'rounding is wrong'],
      [3, 'HACK', 'works for now */'],
    ]);
  });

  it('picks up an issue key from the parens or the note', () => {
    const todos = findTodos(['// TODO(PD-918): rounding', '// TODO: see FUN-101 first', '// TODO(alice): no key here'].join('\n'), ['PD', 'FUN']);
    expect(todos.map((t) => t.key)).toEqual(['PD-918', 'FUN-101', null]);
    // The key is stripped out of the note, so it doesn't end up in the summary twice.
    expect(todos[0].text).toBe('rounding');
    expect(todos[2].text).toBe('no key here');
  });

  it('ignores a marker that is not in a comment', () => {
    // Otherwise this project's own TODO_MARKERS array would light up with CodeLenses.
    expect(findTodos("const markers = ['TODO', 'FIXME'];")).toEqual([]);
    expect(findTodos('function todoCount() { return 0 }')).toEqual([]);
  });

  it('reports 0-based lines, so they map onto an editor', () => {
    expect(findTodos('a\nb\n// TODO: third line')[0].line).toBe(2);
  });
});

describe('summaryFor', () => {
  const base = { code: 'const x = 1;', file: 'src/a.ts', startLine: 3, endLine: 3 };

  it('prefers the TODO note over the code', () => {
    expect(summaryFor({ ...base, note: 'wire this up' })).toBe('wire this up');
  });

  it('falls back to the first meaningful line of the selection', () => {
    expect(summaryFor({ ...base, code: '\n\n   const x = 1;\n  more' })).toBe('const x = 1;');
  });

  it('falls back to the location when there is nothing to say', () => {
    expect(summaryFor({ ...base, code: '   \n  ' })).toBe('Follow up in src/a.ts:3');
  });

  it('collapses whitespace and fits Jira’s limit', () => {
    expect(summaryFor({ ...base, note: 'a\t\t b   c' })).toBe('a b c');
    const long = summaryFor({ ...base, note: 'x'.repeat(400) });
    expect(long).toHaveLength(SUMMARY_MAX);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('descriptionFor', () => {
  it('says where the code came from and fences it', () => {
    expect(descriptionFor({ code: 'const x = 1;', file: 'src/a.ts', startLine: 3, endLine: 5, language: 'ts' })).toBe(
      'From src/a.ts:3-5\n\n```ts\nconst x = 1;\n```',
    );
  });

  it('names a single line without a range', () => {
    expect(descriptionFor({ code: 'x', file: 'a.py', startLine: 9, endLine: 9 })).toContain('From a.py:9');
  });
});

describe('codeIssue', () => {
  it('builds both halves of what createQuest needs', () => {
    const issue = codeIssue({ code: 'broken()', file: 'src/a.ts', startLine: 2, endLine: 2, language: 'ts', note: 'fix rounding' });
    expect(issue).toEqual({ summary: 'fix rounding', description: 'From src/a.ts:2\n\n```ts\nbroken()\n```' });
  });
});
