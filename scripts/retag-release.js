#!/usr/bin/env node

/**
 * Re-point the release tag at the *amended* release commit.
 *
 * The release pipeline runs `bumpp` (which creates the commit AND the tag),
 * then `git commit --amend` to fold in the synced starter version. The amend
 * rewrites the commit hash, leaving bumpp's tag pointing at the now-orphaned
 * pre-amend commit — so `git push --follow-tags` would push the wrong tag (or
 * none). This force-moves the annotated tag onto the final commit (HEAD).
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
)
const tag = `v${version}`

execSync(`git tag -f -a ${tag} -m ${tag}`, { stdio: 'inherit' })
console.log(`  ✔  Re-pointed ${tag} at the amended release commit (HEAD)`)
