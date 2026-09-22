import { existsSync, readFileSync } from 'node:fs';
import { parseViews, type SavedView } from '../shared/views';
import { writePrivateFile } from './privateFile';

/**
 * The web app's saved views, per Jira site. They hold only JQL, never a token, but they live in the same
 * private file style as the ledger so a stray query isn't world-readable either.
 */
type ViewsFile = Record<string, SavedView[]>;

/** The whole file, {} when it doesn't exist yet, or null when it can't be read (so it's never overwritten). */
function readAll(path: string): ViewsFile | null {
  if (!existsSync(path)) return {};
  try {
    const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as ViewsFile) : null;
  } catch {
    return null;
  }
}

export function readViews(path: string, site: string): SavedView[] {
  return parseViews(readAll(path)?.[site]);
}

/** Saves this site's views, leaving other sites' alone. A damaged file is left untouched rather than replaced. */
export function saveViews(path: string, site: string, views: SavedView[]) {
  const all = readAll(path);
  if (!all) {
    console.warn(`JiraPlay: ${path} is not readable as saved views, so they were not saved.`);
    return;
  }
  writePrivateFile(path, JSON.stringify({ ...all, [site]: views }, null, 2));
}
