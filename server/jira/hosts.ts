import { StoreError } from '../store';


/** Atlassian Cloud's domains. The API token is only ever sent to a site under one of these, or an allowed host. */
const ATLASSIAN_DOMAINS = ['atlassian.net', 'jira.com', 'jira-dev.com'];

/**
 * Whether a configured extra host is usable. Settings and .env are edited by hand, so a host has to be a plain
 * hostname before it widens where the token may go, or gets interpolated into the webview's CSP header.
 * At least two labels, so a bare TLD like "com" can't allowlist every .com through isAllowedJiraHost's suffix match.
 */
export function isValidAllowedHost(host: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host);
}

/** Reads a comma-separated host list, e.g. from JIRA_ALLOWED_HOSTS. Anything that isn't a plain hostname is dropped. */
export function allowedHostsFrom(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(isValidAllowedHost);
}

/** Whether the token may be sent to this site: https, and a subdomain of Atlassian Cloud or an allowed host. */
export function isAllowedJiraHost(baseUrl: string, allowedHosts: string[] = []): boolean {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return (
    ATLASSIAN_DOMAINS.some((domain) => host.endsWith(`.${domain}`)) ||
    allowedHosts.some((allowed) => host === allowed.toLowerCase() || host.endsWith(`.${allowed.toLowerCase()}`))
  );
}

export const hostRefusal = (baseUrl: string) =>
  new StoreError(
    400,
    `${baseUrl} isn't a Jira Cloud address like your-team.atlassian.net, so JiraPlay won't send your API token there. For a custom domain, add it to JIRA_ALLOWED_HOSTS (jiraPlay.allowedHosts in VS Code).`,
  );
