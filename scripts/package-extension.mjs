// Packages the extension with the user-facing docs/marketplace.md as its README.
// vsce always ships README.md, and that file is the repo's developer README, so we
// swap it in place for the duration of the run and always put it back.
import { spawnSync } from 'node:child_process'
import { copyFileSync, renameSync, rmSync, existsSync } from 'node:fs'

const README = 'README.md'
const STORE = 'docs/marketplace.md'
const BACKUP = '.README.dev.md'

if (!existsSync(STORE)) {
  console.error(`Missing ${STORE}: the marketplace README is what gets packaged.`)
  process.exit(1)
}

let swapped = false
const restore = () => {
  if (swapped && existsSync(BACKUP)) {
    renameSync(BACKUP, README)
    swapped = false
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    restore()
    process.exit(1)
  })
}
process.on('exit', restore)

try {
  rmSync(BACKUP, { force: true })
  renameSync(README, BACKUP)
  swapped = true
  copyFileSync(STORE, README)
  const args = ['vsce', 'package', '--no-dependencies', '--allow-missing-repository', '--no-rewrite-relative-links']
  const run = spawnSync('npx', args, { stdio: 'inherit' })
  process.exitCode = run.status ?? 1
} finally {
  restore()
}
