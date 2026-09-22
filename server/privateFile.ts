import { randomBytes } from 'node:crypto';
import { chmodSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/**
 * Replaces a file only this user may read (the .env with the API token, the XP ledger). The new contents go to a
 * private temp file in the same folder, which is then renamed over the old file, so a crash never leaves a
 * half-written file and the contents are never readable by other users, even for a moment. An existing file that
 * was readable by others is made private too.
 */
export function writePrivateFile(path: string, text: string) {
  const temp = join(dirname(path), `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    writeFileSync(temp, text, { mode: 0o600, flag: 'wx' });
    renameSync(temp, path);
  } catch (err) {
    rmSync(temp, { force: true });
    throw err;
  }
  chmodSync(path, 0o600);
}
