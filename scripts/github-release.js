#!/usr/bin/env node

/**
 * Create the GitHub release for the current version, using the newest section
 * of CHANGELOG.md as the release notes. Run last, after `git push --follow-tags`
 * (so the tag already exists on the remote). Requires the GitHub CLI (`gh`).
 *
 * Non-fatal by nature: the npm publish + git push have already happened by the
 * time this runs, so if `gh` is missing or this errors you can re-run
 * `gh release create` by hand.
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const tag = `v${version}`
const prerelease = version.includes('-') // 0.2.0-beta.5 -> prerelease

// Pull the top "## ..." section out of the changelog for the release notes.
let notes = `Release ${tag}`
try {
  const lines = readFileSync('CHANGELOG.md', 'utf8').split('\n')
  const start = lines.findIndex(l => l.startsWith('## '))
  if (start !== -1) {
    const rest = lines.slice(start + 1)
    const nextRel = rest.findIndex(l => l.startsWith('## '))
    const end = nextRel === -1 ? lines.length : start + 1 + nextRel
    notes = lines.slice(start, end).join('\n').trim()
  }
}
catch {
  // no CHANGELOG.md — fall back to the default note
}

const tmp = '.release-notes.tmp.md'
writeFileSync(tmp, notes + '\n')
try {
  execSync(
    `gh release create "${tag}" --title "${tag}"${prerelease ? ' --prerelease' : ''} --notes-file "${tmp}"`,
    { stdio: 'inherit' },
  )
  console.log(`  ✔  Created GitHub release ${tag}`)
}
finally {
  rmSync(tmp, { force: true })
}
