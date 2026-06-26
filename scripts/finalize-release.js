#!/usr/bin/env node

/**
 * Create the single release commit + annotated tag.
 *
 * Run after: bumpp (bump-only) -> sync-starter-version -> changelogen --output
 * -> prepack. Stages ONLY the release files (root + starter package.json and
 * CHANGELOG.md) so unrelated working-tree changes are never swept into the
 * release commit, then tags the commit. Because the tag is created here (after
 * all edits), it can never be orphaned by a later amend.
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const tag = `v${version}`

// `changelogen --output` labels the new section "<lastTag>...main" (it doesn't
// know the release version since we bump with bumpp, not changelogen). Normalize
// the heading and the compare link to the real version so the changelog and the
// GitHub release read cleanly.
try {
  let cl = readFileSync('CHANGELOG.md', 'utf8')
  cl = cl.replace(/^## .*$/m, `## ${tag}`)
  cl = cl.replace(/\.\.\.main(\))/, `...${tag}$1`)
  writeFileSync('CHANGELOG.md', cl)
}
catch {
  // no CHANGELOG.md yet — nothing to normalize
}

execSync('git add package.json start/package.json CHANGELOG.md', { stdio: 'inherit' })
execSync(`git commit -m "chore: release ${tag}"`, { stdio: 'inherit' })
execSync(`git tag -a "${tag}" -m "${tag}"`, { stdio: 'inherit' })

console.log(`  ✔  Committed and tagged ${tag}`)
