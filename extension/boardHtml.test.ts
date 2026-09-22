import { describe, expect, it } from 'vitest';
import { boardPage, NOT_BUILT_PAGE, type BoardPageInput } from './boardHtml';

const page = (overrides: Partial<BoardPageInput> = {}) =>
  boardPage({
    entry: { file: 'assets/index.js', css: ['assets/index.css'] },
    asset: (path) => `vscode-webview://board/${path}`,
    cspSource: 'vscode-webview://board',
    theme: 'arcade',
    allowedHosts: [],
    nonce: 'NONCE123',
    ...overrides,
  });

const cspOf = (html: string) => /content="([^"]*)"/.exec(html)?.[1] ?? '';

describe('boardPage', () => {
  it('explains how to build rather than rendering a blank webview', () => {
    expect(page({ entry: undefined })).toBe(NOT_BUILT_PAGE);
    expect(NOT_BUILT_PAGE).toContain('npm run build');
  });

  it('loads the built bundle and stamps the theme for the first paint', () => {
    const html = page({ theme: 'daylight' });
    expect(html).toContain('data-theme="daylight"');
    expect(html).toContain('src="vscode-webview://board/assets/index.js"');
    expect(html).toContain('href="vscode-webview://board/assets/index.css"');
  });

  it('marks a system preference next to the resolved theme, so the page can follow the editor', () => {
    expect(page({ theme: 'daylight', themePref: 'system' })).toContain('data-theme="daylight" data-theme-pref="system"');
    expect(page({ theme: 'daylight', themePref: 'daylight' })).not.toContain('data-theme-pref');
  });

  it('runs scripts only by nonce or from the bundle, and nothing else at all', () => {
    const csp = cspOf(page());
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'nonce-NONCE123' vscode-webview://board");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    // Style attributes are needed by React and motion; style elements are not.
    expect(csp).toContain("style-src-attr 'unsafe-inline'");
    expect(csp).toContain('style-src-elem vscode-webview://board');
    expect(csp).not.toContain("style-src-elem 'unsafe-inline'");
  });

  it('carries the nonce on the one script tag it emits', () => {
    const html = page();
    expect([...html.matchAll(/<script/g)]).toHaveLength(1);
    expect(html).toContain('nonce="NONCE123"');
  });

  it('allows avatars from Atlassian and Gravatar, plus any configured host', () => {
    const csp = cspOf(page({ allowedHosts: ['jira.example.com'] }));
    expect(csp).toContain('https://*.atlassian.net');
    expect(csp).toContain('https://secure.gravatar.com');
    expect(csp).toContain('https://jira.example.com');
    expect(csp).toContain('https://*.jira.example.com');
  });

  it('keeps the policy inside its attribute', () => {
    // allowedHostsSetting drops anything but a plain hostname; this is the reason it has to.
    const html = page({ allowedHosts: ['jira.example.com'] });
    const head = html.slice(0, html.indexOf('</head>'));
    expect([...head.matchAll(/http-equiv="Content-Security-Policy"/g)]).toHaveLength(1);
    expect(cspOf(html)).not.toContain('"');
    expect(cspOf(html)).toContain("frame-ancestors 'none'");
  });
});
