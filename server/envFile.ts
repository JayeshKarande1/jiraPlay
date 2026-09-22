import { existsSync, readFileSync } from 'node:fs';
import { writePrivateFile } from './privateFile';
import { StoreError } from './store';

/** Sets keys in a .env file. Other lines are kept; existing or commented-out lines for the same key become one line. */
export function updateEnvFile(path: string, values: Record<string, string>) {
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/) : [];
  const written = new Set<string>();
  const next: string[] = [];

  for (const line of lines) {
    const key = /^\s*(?:#\s*)?(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1];
    if (key === undefined || !Object.hasOwn(values, key)) {
      next.push(line);
    } else if (!written.has(key)) {
      written.add(key);
      next.push(`${key}=${envValue(values[key])}`);
    }
  }

  while (next.length > 0 && next[next.length - 1] === '') next.pop();
  for (const [key, value] of Object.entries(values)) {
    if (!written.has(key)) next.push(`${key}=${envValue(value)}`);
  }
  writePrivateFile(path, `${next.join('\n')}\n`);
}

/** Quotes a value so dotenv reads it back unchanged. */
function envValue(value: string): string {
  const text = value.replace(/[\r\n]+/g, ' ');
  if (/^[\w.@:/+=-]*$/.test(text)) return text;
  const quote = ["'", '"', '`'].find((q) => !text.includes(q));
  if (!quote) throw new StoreError(400, "Values can't contain single quotes, double quotes and backticks all at once");
  return `${quote}${text}${quote}`;
}
