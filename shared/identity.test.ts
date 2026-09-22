import { describe, expect, it } from 'vitest';
import { keepEqualValues, keepIdentity, keepSame, shallowEqual } from './identity';
import { makeQuest } from './testing';

describe('keepIdentity', () => {
  const byKey = (q: { key: string }) => q.key;

  it('returns the previous array when nothing changed', () => {
    const prev = [makeQuest({ key: 'A-1' }), makeQuest({ key: 'A-2' })];
    const next = prev.map((q) => ({ ...q }));
    expect(keepIdentity(prev, next, byKey)).toBe(prev);
  });

  it('keeps unchanged items and takes changed or new ones', () => {
    const prev = [makeQuest({ key: 'A-1' }), makeQuest({ key: 'A-2' })];
    const next = [{ ...prev[0] }, { ...prev[1], done: true }, makeQuest({ key: 'A-3' })];
    const result = keepIdentity(prev, next, byKey);
    expect(result).not.toBe(prev);
    expect(result[0]).toBe(prev[0]);
    expect(result[1]).toBe(next[1]);
    expect(result[2]).toBe(next[2]);
  });

  it('notices a reorder', () => {
    const prev = [makeQuest({ key: 'A-1' }), makeQuest({ key: 'A-2' })];
    const result = keepIdentity(prev, [{ ...prev[1] }, { ...prev[0] }], byKey);
    expect(result).toEqual([prev[1], prev[0]]);
    expect(result).not.toBe(prev);
  });
});

describe('keepEqualValues', () => {
  it('keeps unchanged nested values and the whole record when nothing changed', () => {
    const prev = { a: { list: [1, 2] }, b: { list: [3] } };
    expect(keepEqualValues(prev, { a: { list: [1, 2] }, b: { list: [3] } })).toBe(prev);
    const next = keepEqualValues(prev, { a: { list: [1, 2] }, b: { list: [3, 4] } });
    expect(next).not.toBe(prev);
    expect(next.a).toBe(prev.a);
    expect(next.b).toEqual({ list: [3, 4] });
  });
});

describe('shallowEqual and keepSame', () => {
  it('compares flat objects', () => {
    expect(shallowEqual({ a: 1, b: null }, { a: 1, b: null })).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    const prev = { id: 'x' };
    expect(keepSame(prev, { id: 'x' })).toBe(prev);
    expect(keepSame(prev, null)).toBeNull();
  });
});
