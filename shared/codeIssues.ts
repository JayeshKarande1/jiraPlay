/**
 * Turning code into Jira issues, and finding the issues already named in code.
 * Pure text work, so the VS Code host and its tests share it.
 */

/** Jira's limit. Longer summaries are rejected outright. */
export const SUMMARY_MAX = 255;

/** The comment markers that mean "unfinished work". */
export const TODO_MARKERS = ['TODO', 'FIXME', 'HACK', 'XXX', 'BUG'] as const;
export type TodoMarker = (typeof TODO_MARKERS)[number];

/**
 * A marker, optionally carrying an issue key or an owner, then the note:
 *   // TODO: wire this up
 *   # FIXME(PD-918): rounding is wrong
 *   // TODO(alice) split this
 */
const TODO_RE = new RegExp(String.raw`\b(${TODO_MARKERS.join('|')})\b\s*(?:\(([^)]*)\))?\s*:?\s*(.*)$`);

/**
 * A Jira key anywhere in a line. Case-sensitive on purpose: keys are uppercase in Jira, and lower-casing the
 * haystack first turns `utf-8`, `sha-1` and `iso-8601` into perfectly good issue keys.
 */
const KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;

/**
 * The first Jira issue key in some text, or null.
 *
 * `UTF-8` and `SHA-1` are structurally valid keys, so pass `projects` — the project prefixes actually on the
 * board — whenever they're known. That makes the match exact, and lets it accept the lowercase keys people type.
 */
export function findIssueKey(text: string, projects?: Iterable<string>): string | null {
  const known = projects && [...projects].map((p) => p.toUpperCase());
  if (!known) return KEY_RE.exec(text)?.[1] ?? null;
  if (known.length === 0) return null;
  const match = new RegExp(String.raw`\b((?:${known.join('|')})-\d+)\b`, 'i').exec(text);
  return match ? match[1].toUpperCase() : null;
}

/** The project prefixes in a set of issue keys, e.g. ['PD-1','FUN-2'] -> ['PD','FUN']. */
export function projectsOf(keys: Iterable<string>): string[] {
  const set = new Set<string>();
  for (const key of keys) {
    const prefix = /^([A-Z][A-Z0-9]+)-\d+$/.exec(key.toUpperCase())?.[1];
    if (prefix) set.add(prefix);
  }
  return [...set];
}

export interface Todo {
  /** 0-based, so it maps straight onto an editor's lines. */
  line: number;
  marker: TodoMarker;
  /** The note after the marker, without the key or owner. */
  text: string;
  /** The issue this TODO already points at, or null when it has none. */
  key: string | null;
}

/**
 * Every TODO-style comment in a file. Deliberately naive about syntax: it matches the marker wherever it appears,
 * because a per-language comment parser would be a lot of machinery for a line that is a comment in every case
 * we care about. The cost is the occasional match inside a string literal.
 */
export function findTodos(source: string, projects?: Iterable<string>): Todo[] {
  const found: Todo[] = [];
  source.split(/\r?\n/).forEach((line, index) => {
    // Only look at lines that are, or contain, a comment: this is what keeps `const TODO_MARKERS = [...]` out.
    if (!/(\/\/|\/\*|\*|#|--|<!--)/.test(line)) return;
    const match = TODO_RE.exec(line);
    if (!match) return;
    const [, marker, inParens = '', rest] = match;
    const key = findIssueKey(inParens, projects) ?? (inParens ? null : findIssueKey(rest, projects));
    found.push({
      line: index,
      marker: marker.toUpperCase() as TodoMarker,
      text: stripKey(rest, key).trim(),
      key,
    });
  });
  return found;
}

const stripKey = (text: string, key: string | null) => (key ? text.replace(new RegExp(`\\b${key}\\b[:\\s-]*`, 'i'), '') : text);

export interface CodeIssueInput {
  /** The selected code, or the TODO's line. */
  code: string;
  /** How to name the file in the issue, e.g. a workspace-relative path. */
  file: string;
  /** 1-based, as editors show them. */
  startLine: number;
  endLine: number;
  /** Markdown/ADF fence language, e.g. `ts`. Empty for none. */
  language?: string;
  /** A TODO's note, when the issue came from one. Preferred over the code for the summary. */
  note?: string;
}

/** A summary that fits Jira, from the note if there is one, else the first meaningful line of the code. */
export function summaryFor({ code, note, file, startLine }: CodeIssueInput): string {
  const firstLine = code
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  const raw = (note?.trim() || firstLine || `Follow up in ${file}:${startLine}`).replace(/\s+/g, ' ');
  return raw.length > SUMMARY_MAX ? `${raw.slice(0, SUMMARY_MAX - 1).trimEnd()}…` : raw;
}

/**
 * The issue body: where the code is, then the code. Plain text, because the store converts it to ADF;
 * a fence still reads correctly there and survives a round trip back through adfToText.
 */
export function descriptionFor({ code, file, startLine, endLine, language = '' }: CodeIssueInput): string {
  const where = startLine === endLine ? `${file}:${startLine}` : `${file}:${startLine}-${endLine}`;
  return [`From ${where}`, '', '```' + language, code.replace(/\s+$/, ''), '```'].join('\n');
}

export const codeIssue = (input: CodeIssueInput) => ({ summary: summaryFor(input), description: descriptionFor(input) });
