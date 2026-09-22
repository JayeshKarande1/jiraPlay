import { existsSync, readFileSync } from 'node:fs';
import type { XpEntry } from '../shared/types';
import { writePrivateFile } from './privateFile';

/** The web app's saved XP ledgers, one per Jira site. */
type LedgerFile = Record<string, XpEntry[]>;

/** The whole file, {} when it doesn't exist yet, or null when it can't be read (so it's never overwritten). */
function readAll(path: string): LedgerFile | null {
  if (!existsSync(path)) return {};
  try {
    const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as LedgerFile) : null;
  } catch {
    return null;
  }
}

const isEntry = (value: unknown): value is XpEntry => {
  const e = value as Partial<XpEntry> | null;
  return typeof e?.key === 'string' && typeof e.heroId === 'string' && typeof e.xp === 'number' && typeof e.at === 'string';
};

/** The saved ledger for a Jira site. */
export function readLedger(path: string, site: string): XpEntry[] {
  const entries = readAll(path)?.[site];
  return Array.isArray(entries) ? entries.filter(isEntry) : [];
}

/** Saves a site's ledger, keeping other sites'. A damaged file is left alone for the user to look at. */
export function saveLedger(path: string, site: string, entries: XpEntry[]) {
  const all = readAll(path);
  if (!all) {
    console.warn(`JiraPlay can't read ${path}, so it isn't saving XP there. Fix or delete the file to keep XP history.`);
    return;
  }
  writePrivateFile(path, `${JSON.stringify({ ...all, [site]: entries })}\n`);
}
