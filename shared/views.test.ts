import { describe, expect, it } from 'vitest';
import { activeView, MAX_VIEWS, parseViews, removeView, upsertView, viewId, type SavedView } from './views';

const view = (id: string, name: string, jql: string): SavedView => ({ id, name, jql });

describe('viewId', () => {
  it('slugifies the name', () => {
    expect(viewId('My Sprint!')).toBe('my-sprint');
    expect(viewId('  Bugs  ')).toBe('bugs');
  });

  it('falls back rather than producing an empty id', () => {
    expect(viewId('!!!')).toBe('view');
  });

  it('avoids ids already taken', () => {
    expect(viewId('Bugs', ['bugs'])).toBe('bugs-2');
    expect(viewId('Bugs', ['bugs', 'bugs-2'])).toBe('bugs-3');
  });
});

describe('parseViews', () => {
  it('is empty for anything that is not a list', () => {
    for (const bad of [null, undefined, 'x', 42, {}]) expect(parseViews(bad)).toEqual([]);
  });

  it('drops malformed entries instead of throwing, so one typo cannot stop the board', () => {
    const parsed = parseViews([
      view('a', 'Mine', 'assignee = currentUser()'),
      { id: 'b', name: '', jql: 'x' },
      { id: 'c', name: 'No query', jql: '   ' },
      { name: 'No id', jql: 'x' },
      'nonsense',
    ]);
    expect(parsed.map((v) => v.id)).toEqual(['a']);
  });

  it('drops duplicate ids, keeping the first', () => {
    expect(parseViews([view('a', 'One', 'x'), view('a', 'Two', 'y')]).map((v) => v.name)).toEqual(['One']);
  });

  it('trims and caps the list', () => {
    expect(parseViews([{ id: 'a', name: '  Mine  ', jql: '  x  ' }])[0]).toEqual({ id: 'a', name: 'Mine', jql: 'x' });
    const many = Array.from({ length: MAX_VIEWS + 5 }, (_, i) => view(`v${i}`, `V${i}`, 'x'));
    expect(parseViews(many)).toHaveLength(MAX_VIEWS);
  });
});

describe('activeView', () => {
  const views = [view('a', 'Mine', 'assignee = currentUser()'), view('b', 'Bugs', 'type = Bug')];

  it('matches on the query, ignoring surrounding space', () => {
    expect(activeView(views, '  assignee = currentUser()  ')?.id).toBe('a');
    expect(activeView(views, 'type = Bug')?.id).toBe('b');
  });

  it('is null when the running JQL is not saved', () => {
    expect(activeView(views, 'project = PD')).toBeNull();
  });
});

describe('upsertView', () => {
  const views = [view('mine', 'Mine', 'assignee = currentUser()')];

  it('adds a new view', () => {
    const next = upsertView(views, 'Bugs', 'type = Bug');
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual({ id: 'bugs', name: 'Bugs', jql: 'type = Bug' });
  });

  it('replaces the query of a view with the same name, whatever its case', () => {
    const next = upsertView(views, 'mine', 'project = PD');
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({ id: 'mine', name: 'Mine', jql: 'project = PD' });
  });

  it('returns the same array when nothing would change', () => {
    expect(upsertView(views, 'Mine', 'assignee = currentUser()')).toBe(views);
    expect(upsertView(views, '   ', 'x')).toBe(views);
    expect(upsertView(views, 'Empty', '  ')).toBe(views);
  });

  it('refuses to grow past the cap', () => {
    const full = Array.from({ length: MAX_VIEWS }, (_, i) => view(`v${i}`, `V${i}`, 'x'));
    expect(upsertView(full, 'One more', 'y')).toBe(full);
  });
});

describe('removeView', () => {
  it('removes by id and leaves the rest alone', () => {
    const views = [view('a', 'A', 'x'), view('b', 'B', 'y')];
    expect(removeView(views, 'a').map((v) => v.id)).toEqual(['b']);
    expect(removeView(views, 'nope')).toHaveLength(2);
  });
});
