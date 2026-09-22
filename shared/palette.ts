/**
 * Ranking for the command palette: which entries match what was typed, best first. Plain logic, so the palette's
 * matching can be tested without a DOM.
 */

export interface PaletteEntry {
  id: string;
  /** What's shown and matched. */
  label: string;
  /** Extra text that also matches, e.g. an issue key or a person's name. */
  hint?: string;
  /** Groups entries under a heading; the palette keeps the group order it was given. */
  group: string;
}

/** Score for how well `text` matches `query`: higher is better, 0 is no match. */
function score(query: string, text: string): number {
  const haystack = text.toLowerCase();
  if (!query) return 1;
  const at = haystack.indexOf(query);
  // A whole-word or prefix match beats one that starts mid-word, which beats a scattered one.
  if (at === 0) return 100;
  if (at > 0) return /[\s\-_:/]/.test(haystack[at - 1]) ? 80 : 60;
  // Subsequence: every character of the query appears in order, e.g. "mkd" in "mark done".
  let i = 0;
  for (const ch of haystack) if (ch === query[i]) i++;
  return i === query.length ? 20 : 0;
}

/**
 * The entries that match `query`, best first. An empty query keeps every entry in its given order, so the
 * palette opens on a stable list rather than a shuffled one.
 */
export function rankEntries<T extends PaletteEntry>(entries: T[], query: string, limit = 40): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries.slice(0, limit);
  return entries
    .map((entry, index) => ({ entry, index, score: Math.max(score(q, entry.label), entry.hint ? score(q, entry.hint) : 0) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((m) => m.entry);
}
