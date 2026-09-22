/** Whether two flat objects have the same keys and the same values (compared with ===). */
export function shallowEqual(a: object, b: object): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((key) => Object.hasOwn(b, key) && (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key]);
}

/**
 * Reuses the previous objects for items that didn't change, and the previous array when nothing did. Each poll
 * brings a whole new board, so without this every memoised card would re-render every 30 seconds.
 */
export function keepIdentity<T extends object>(prev: T[], next: T[], idOf: (item: T) => string): T[] {
  const byId = new Map(prev.map((item) => [idOf(item), item]));
  let changed = prev.length !== next.length;
  const result = next.map((item, i) => {
    const old = byId.get(idOf(item));
    if (old && shallowEqual(old, item)) {
      if (prev[i] !== old) changed = true;
      return old;
    }
    changed = true;
    return item;
  });
  return changed ? result : prev;
}

/**
 * For a record of small nested values (like each hero's progress): keeps the previous value for every key whose
 * JSON is unchanged, and the previous record when nothing changed.
 */
export function keepEqualValues<T>(prev: Record<string, T>, next: Record<string, T>): Record<string, T> {
  const keys = Object.keys(next);
  let changed = keys.length !== Object.keys(prev).length;
  const result: Record<string, T> = {};
  for (const key of keys) {
    const old = prev[key];
    if (old !== undefined && JSON.stringify(old) === JSON.stringify(next[key])) {
      result[key] = old;
    } else {
      result[key] = next[key];
      changed = true;
    }
  }
  return changed ? result : prev;
}

/** The previous object when it's equal to the next one. */
export function keepSame<T extends object>(prev: T | null, next: T | null): T | null {
  return prev && next && shallowEqual(prev, next) ? prev : next;
}
