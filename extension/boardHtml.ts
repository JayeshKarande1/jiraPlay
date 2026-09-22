import type { ThemeId } from '../shared/themes';

/** What the Vite manifest says the board's entry point is. */
export interface BoardEntry {
  file: string;
  css?: string[];
}

export interface BoardPageInput {
  /** The entry from dist/manifest.json, or undefined when the board hasn't been built. */
  entry: BoardEntry | undefined;
  /** Turns a path inside dist/ into a URL the webview may load. */
  asset: (path: string) => string;
  /** The webview's own source, the only origin the bundle is served from. */
  cspSource: string;
  theme: ThemeId;
  /** Extra hosts avatars may come from. Already validated; see allowedHostsSetting. */
  allowedHosts: string[];
  /** A fresh, per-page nonce. The only thing that may run a script besides the bundle itself. */
  nonce: string;
}

export const NOT_BUILT_PAGE =
  '<!doctype html><body style="font-family:sans-serif;padding:24px">The JiraPlay board has not been built. Run <code>npm run build</code> in the project folder.</body>';

/**
 * The webview's page: the Vite bundle behind a Content Security Policy that allows nothing else.
 * Pure, so the policy it produces can be tested without a webview.
 */
export function boardPage({ entry, asset, cspSource, theme, allowedHosts, nonce }: BoardPageInput): string {
  if (!entry) return NOT_BUILT_PAGE;

  // Avatars come from the Jira site, Atlassian's avatar CDN or Gravatar. Nothing else is loaded from the network.
  const imageHosts = ['https://*.atlassian.net', 'https://*.atlassian.com', 'https://*.atl-paas.net', 'https://secure.gravatar.com'];
  for (const host of allowedHosts) imageHosts.push(`https://${host}`, `https://*.${host}`);
  const csp = [
    "default-src 'none'",
    `img-src ${cspSource} data: ${imageHosts.join(' ')}`,
    // Style elements only from the bundle; style attributes stay allowed for React and motion.
    `style-src ${cspSource}`,
    `style-src-elem ${cspSource}`,
    "style-src-attr 'unsafe-inline'",
    `font-src ${cspSource}`,
    `script-src 'nonce-${nonce}' ${cspSource}`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

  return `<!doctype html>
<html lang="en" data-theme="${theme}">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${(entry.css ?? []).map((css) => `<link rel="stylesheet" href="${asset(css)}" />`).join('\n    ')}
    <title>JiraPlay</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" nonce="${nonce}" src="${asset(entry.file)}"></script>
  </body>
</html>`;
}
