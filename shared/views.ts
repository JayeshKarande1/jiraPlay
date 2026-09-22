/**
 * Saved views: named JQL queries you can switch the board between. A view is only ever a query — it never
 * carries credentials — so both hosts can keep them in ordinary settings.
 */

export interface SavedView {
  id: string;
  name: string;
  jql: string;
}

export const MAX_VIEWS = 20;
const MAX_NAME = 60;
const MAX_JQL = 2000;

/** Ids only have to be unique within one user's list, and stable enough to survive a rename. */
export const viewId = (name: string, existing: Iterable<string> = []): string => {
  const taken = new Set(existing);
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'view';
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now()}`;
};

const isView = (value: unknown): value is SavedView => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.name === 'string' && typeof v.jql === 'string' && v.name.trim() !== '' && v.jql.trim() !== '';
};

/**
 * Reads a views list from settings or a file, which are both hand-editable. Anything malformed is dropped
 * rather than throwing: a typo in one view shouldn't stop the board loading.
 */
export function parseViews(value: unknown): SavedView[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const views: SavedView[] = [];
  for (const raw of value) {
    if (!isView(raw) || seen.has(raw.id)) continue;
    seen.add(raw.id);
    views.push({ id: raw.id, name: raw.name.trim().slice(0, MAX_NAME), jql: raw.jql.trim().slice(0, MAX_JQL) });
    if (views.length >= MAX_VIEWS) break;
  }
  return views;
}

/** The view whose JQL is running now, matched on the query rather than on a saved id that could drift. */
export const activeView = (views: SavedView[], jql: string): SavedView | null => views.find((v) => v.jql.trim() === jql.trim()) ?? null;

/** Adds a view, or replaces one with the same name. Returns the same array when nothing would change. */
export function upsertView(views: SavedView[], name: string, jql: string): SavedView[] {
  const trimmed = name.trim().slice(0, MAX_NAME);
  const query = jql.trim().slice(0, MAX_JQL);
  if (!trimmed || !query) return views;
  const at = views.findIndex((v) => v.name.toLowerCase() === trimmed.toLowerCase());
  if (at >= 0) {
    if (views[at].jql === query) return views;
    return views.map((v, i) => (i === at ? { ...v, jql: query } : v));
  }
  if (views.length >= MAX_VIEWS) return views;
  return [...views, { id: viewId(trimmed, views.map((v) => v.id)), name: trimmed, jql: query }];
}

export const removeView = (views: SavedView[], id: string): SavedView[] => views.filter((v) => v.id !== id);
