import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { XpEntry } from '../shared/types';
import { readLedger, saveLedger } from './ledgerFile';

const path = () => join(mkdtempSync(join(tmpdir(), 'jiraplay-ledger-')), 'ledger.json');
const entry: XpEntry = { key: 'A-1', heroId: 'z', heroName: 'Zoe', xp: 30, kind: 'task', points: 3, due: null, at: '2026-09-14T10:00:00.000Z' };

describe('ledger file', () => {
  it('saves and reads each site separately', () => {
    const file = path();
    expect(readLedger(file, 'https://a.atlassian.net')).toEqual([]);
    saveLedger(file, 'https://a.atlassian.net', [entry]);
    saveLedger(file, 'https://b.atlassian.net', []);
    expect(readLedger(file, 'https://a.atlassian.net')).toEqual([entry]);
    expect(readLedger(file, 'https://b.atlassian.net')).toEqual([]);
  });

  it('never overwrites a damaged file', () => {
    const file = path();
    writeFileSync(file, '{ not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    saveLedger(file, 'https://a.atlassian.net', [entry]);
    expect(readFileSync(file, 'utf8')).toBe('{ not json');
    expect(readLedger(file, 'https://a.atlassian.net')).toEqual([]);
    warn.mockRestore();
  });
});
