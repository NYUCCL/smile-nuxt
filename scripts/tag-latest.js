#!/usr/bin/env node
/**
 * Point npm's `latest` dist-tag at the version just published (run by
 * `pnpm release` right after `pnpm publish --tag beta`).
 *
 * create-smile-nuxt downloads the template from the git tag of the module's
 * `latest` version, so `latest` must move with every release or new projects
 * get an old template with a newer module (#55). While the module is pre-1.0,
 * every release is both `beta` and `latest`.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const { name, version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

execFileSync('pnpm', ['dist-tag', 'add', `${name}@${version}`, 'latest'], { stdio: 'inherit' })
console.log(`  ✔  ${name}@${version} is now \`latest\` (and \`beta\`)`)
