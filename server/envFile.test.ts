import { chmodSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse } from 'dotenv';
import { describe, expect, it } from 'vitest';
import { updateEnvFile } from './envFile';
import { StoreError } from './store';

const tempEnv = (contents: string) => {
  const path = join(mkdtempSync(join(tmpdir(), 'jiraplay-env-')), '.env');
  writeFileSync(path, contents);
  return path;
};

describe('updateEnvFile', () => {
  it('replaces commented examples, keeps other lines and adds new keys', () => {
    const path = tempEnv('# Board query\n# JIRA_JQL=project = ABC\nOTHER=1\n');
    updateEnvFile(path, { JIRA_JQL: 'project = "Web App" AND status != Done', NEW_KEY: 'x' });

    const text = readFileSync(path, 'utf8');
    expect(text).toContain('# Board query');
    expect(text).not.toContain('# JIRA_JQL');
    expect(parse(text)).toEqual({ JIRA_JQL: 'project = "Web App" AND status != Done', OTHER: '1', NEW_KEY: 'x' });
  });

  it('collapses duplicate lines for a key into one', () => {
    const path = tempEnv('JIRA_EMAIL=old@example.com\nJIRA_EMAIL=older@example.com\n');
    updateEnvFile(path, { JIRA_EMAIL: 'new@example.com' });
    expect(readFileSync(path, 'utf8').match(/JIRA_EMAIL/g)).toHaveLength(1);
    expect(parse(readFileSync(path, 'utf8')).JIRA_EMAIL).toBe('new@example.com');
  });

  it('creates the file when it does not exist', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'jiraplay-env-')), '.env');
    updateEnvFile(path, { JIRA_BASE_URL: 'https://team.atlassian.net' });
    expect(parse(readFileSync(path, 'utf8')).JIRA_BASE_URL).toBe('https://team.atlassian.net');
  });

  it('refuses values it cannot quote safely', () => {
    const path = tempEnv('');
    expect(() => updateEnvFile(path, { JIRA_JQL: `it's "odd" \`here\`` })).toThrow(StoreError);
  });

  it.skipIf(process.platform === 'win32')('makes the file private to the user, even one that was readable by others', () => {
    const path = tempEnv('JIRA_API_TOKEN=old\n');
    chmodSync(path, 0o644);
    updateEnvFile(path, { JIRA_API_TOKEN: 'new' });
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('leaves no temp files behind', () => {
    const path = tempEnv('A=1\n');
    updateEnvFile(path, { A: '2' });
    expect(readdirSync(dirname(path))).toEqual(['.env']);
  });
});
