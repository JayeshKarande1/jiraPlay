const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Whether a URL's origin is a page served from this computer. */
function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && LOCAL_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Why a request to the local API should be refused, or null to allow it. The web app's server acts with the
 * saved Jira token, so it only answers pages on this computer:
 * - the Host must be a local name, which stops DNS rebinding (another site's name pointed at 127.0.0.1);
 * - a browser's Origin, when sent, must be local too, which stops other sites posting to 127.0.0.1;
 * - Sec-Fetch-Site "cross-site" is refused for the same reason, covering requests that carry no Origin.
 */
export function refuseNonLocal(hostname: string, origin: string | undefined, fetchSite: string | undefined): string | null {
  if (!LOCAL_HOSTNAMES.has(hostname.toLowerCase())) return 'JiraPlay only answers requests addressed to this computer';
  if (origin !== undefined && !isLocalOrigin(origin)) return "JiraPlay doesn't accept requests from other websites";
  if (fetchSite === 'cross-site') return "JiraPlay doesn't accept requests from other websites";
  return null;
}
