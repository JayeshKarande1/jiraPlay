/**
 * Atlassian Document Format: the shape Jira stores descriptions and comments in. Both directions are pure,
 * and neither knows anything about the rest of the Jira client.
 */


/** Flattens Atlassian Document Format into plain text. */
export function adfToText(node: unknown): string {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  const n = node as { type?: string; text?: string; content?: unknown[]; attrs?: { text?: string; url?: string } };
  if (n.type === 'text') return n.text ?? '';
  if (n.type === 'hardBreak') return '\n';
  if (n.type === 'mention' || n.type === 'emoji') return n.attrs?.text ?? '';
  if (n.type === 'inlineCard') return n.attrs?.url ?? '';
  const inner = (n.content ?? []).map(adfToText).join('');
  const isBlock = ['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote'].includes(n.type ?? '');
  return isBlock ? `${inner}\n` : inner;
}

/** Turns plain text into Atlassian Document Format, one paragraph per line. */
export function textToAdf(text: string) {
  return {
    type: 'doc',
    version: 1,
    content: text.split(/\r?\n/).map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })),
  };
}
