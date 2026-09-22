import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { api } from '../api';
import logoBanner from '../assets/logo-banner.webp';
import type { SetupInfo, SetupResult } from '../../shared/types';
import { openExternal, vscodeApi } from '../lib/host';
import { useDialog } from '../lib/useDialog';

const TOKEN_PAGE = 'https://id.atlassian.com/manage-profile/security/api-tokens';

interface Props {
  onClose: () => void;
  onConnected: (result: SetupResult) => void;
}

/** JQL for the common cases: the project's open sprints, or open and recently finished work for teams without sprints. */
function jqlFor(projectKey: string, sprints: boolean): string {
  const key = projectKey.trim().toUpperCase();
  if (!key) return '';
  return sprints ? `project = ${key} AND sprint in openSprints()` : `project = ${key} AND (statusCategory != Done OR resolved >= -14d)`;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

const inputClass =
  'mt-2 w-full rounded-lg border-2 border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 disabled:opacity-60';

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className="flex gap-4">
      <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-amber-400 font-pixel text-pixel-md text-amber-300">
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-medium text-white">{title}</h3>
        {children}
      </div>
    </section>
  );
}

const Hint = ({ children }: { children: ReactNode }) => <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{children}</p>;

/** Walks the user through connecting their Jira Cloud account, in the browser and in VS Code. */
export function SetupGuide({ onClose, onConnected }: Props) {
  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [projectKey, setProjectKey] = useState('');
  const [sprints, setSprints] = useState(true);
  /** Set when the user writes their own JQL instead of picking a project. */
  const [customJql, setCustomJql] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useDialog<HTMLFormElement>();

  useEffect(() => {
    let cancelled = false;
    api.setup().then(
      (saved) => {
        if (cancelled) return;
        setInfo(saved);
        setBaseUrl(saved.baseUrl);
        setEmail(saved.email);
        setProjectKey(saved.projectKey);
        if (saved.jql && saved.jql === jqlFor(saved.projectKey, false)) setSprints(false);
        else if (saved.jql && saved.jql !== jqlFor(saved.projectKey, true)) setCustomJql(saved.jql);
      },
      (err: unknown) => {
        if (!cancelled) setError(errorText(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const jql = customJql ?? jqlFor(projectKey, sprints);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onConnected(await api.connect({ baseUrl, email, token, jql, projectKey }));
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.form
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
        onSubmit={submit}
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="my-auto w-full max-w-xl rounded-2xl border-2 border-amber-400 bg-slate-950 p-6 shadow-2xl sm:p-8"
      >
        <img src={logoBanner} alt="JiraPlay, gamified task management" className="mx-auto -mt-2 mb-6 w-full max-w-xs rounded-xl" />

        <div className="flex items-start justify-between gap-4">
          <div>
            <p id="setup-title" className="font-pixel text-sm leading-relaxed text-amber-300">
              🗝️ CONNECT JIRA
            </p>
            <p className="mt-2 text-sm text-slate-400">
              {info?.live
                ? 'Update the Jira account and issues this board uses.'
                : "Bring in your team's real Jira Cloud issues. It takes about two minutes. Until then you're looking at demo data."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>

        <div className="mt-7 space-y-7">
          <Step number={1} title="Your Jira site">
            <input
              data-autofocus
              required
              aria-label="Jira site"
              value={baseUrl}
              disabled={busy}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="your-team.atlassian.net"
              autoComplete="url"
              className={inputClass}
            />
            <Hint>Copy it from your browser's address bar while you're in Jira. Any Jira link from your site works too.</Hint>
          </Step>

          <Step number={2} title="Your Jira email">
            <input
              required
              type="email"
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              className={inputClass}
            />
            <Hint>The email you log into Jira with. Jira only accepts the API token together with this email.</Hint>
          </Step>

          <Step number={3} title="Create an API token">
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
              <li>
                <a
                  href={TOKEN_PAGE}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    if (openExternal(TOKEN_PAGE)) e.preventDefault();
                  }}
                  className="text-amber-300 underline hover:text-amber-200"
                >
                  Open your Atlassian API tokens page ↗
                </a>{' '}
                and log in with the same account.
              </li>
              <li>
                Click <b className="text-white">Create API token</b>. Don't pick "Create API token with scopes"; JiraPlay can't use
                those.
              </li>
              <li>
                Name it <code className="rounded bg-slate-800 px-1">JiraPlay</code>, choose when it expires, and click{' '}
                <b className="text-white">Create</b>.
              </li>
              <li>
                Click <b className="text-white">Copy</b> and paste it below. Atlassian shows the token only once.
              </li>
            </ol>
            <div className="relative">
              <input
                required={!info?.hasToken}
                type={showToken ? 'text' : 'password'}
                value={token}
                disabled={busy}
                onChange={(e) => setToken(e.target.value)}
                placeholder={info?.hasToken ? 'Leave empty to keep your saved token' : 'Paste your API token'}
                autoComplete="off"
                spellCheck={false}
                className={`${inputClass} pr-16 font-mono`}
              />
              <button
                type="button"
                onClick={() => setShowToken((s) => !s)}
                className="absolute bottom-2.5 right-3 text-xs text-slate-400 hover:text-slate-200"
              >
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
            <Hint>
              🔒{' '}
              {vscodeApi
                ? 'Kept in your system keychain and only sent to your Jira site. Every change is made as you.'
                : "Saved in the .env file in this app's folder on this computer and only sent to your Jira site."}
            </Hint>
          </Step>

          <Step number={4} title="Choose your board's issues">
            <input
              value={projectKey}
              disabled={busy}
              onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
              placeholder="Project key, e.g. ABC"
              spellCheck={false}
              className={`${inputClass} font-mono`}
            />
            <Hint>
              The letters before issue numbers: for ABC-123 it's ABC.{' '}
              {customJql === null ? '' : 'With your own JQL, the key is only used for new issues.'}
            </Hint>

            {customJql === null ? (
              <>
                <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={sprints} disabled={busy} onChange={(e) => setSprints(e.target.checked)} className="size-4 accent-amber-400" />
                  My team works in sprints
                </label>
                <Hint>{sprints ? 'Shows issues in the active sprint.' : 'Shows open issues plus anything finished in the last 14 days.'}</Hint>
                <p className="mt-3 text-xs text-slate-400">
                  JQL: <code className="break-all text-slate-300">{jql || 'enter a project key'}</code>{' '}
                  <button type="button" onClick={() => setCustomJql(jql)} className="ml-1 text-amber-300 hover:text-amber-200">
                    Write my own
                  </button>
                </p>
              </>
            ) : (
              <>
                <textarea
                  required
                  rows={2}
                  value={customJql}
                  disabled={busy}
                  onChange={(e) => setCustomJql(e.target.value)}
                  placeholder="project = ABC AND assignee in membersOf('my-team')"
                  spellCheck={false}
                  className={`${inputClass} font-mono`}
                />
                <Hint>
                  Any JQL works; the board shows every issue it matches.{' '}
                  <button type="button" onClick={() => setCustomJql(null)} className="text-amber-300 hover:text-amber-200">
                    Use the project key instead
                  </button>
                </Hint>
              </>
            )}
          </Step>
        </div>

        {error && (
          <p role="alert" className="mt-6 rounded-lg border border-rose-500/40 bg-rose-950/40 px-4 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500"
          >
            {info?.live ? 'Cancel' : 'Explore demo data first'}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-amber-400 px-4 py-2 font-pixel text-pixel-md text-slate-950 transition-transform enabled:hover:scale-105 disabled:opacity-60"
          >
            {busy ? 'CHECKING…' : '▶ CONNECT'}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}
