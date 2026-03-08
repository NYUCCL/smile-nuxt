#!/usr/bin/env node

/**
 * Syncs the root package.json version into the starter template's
 * @nyuccl/smile dependency, so they never drift apart.
 *
 * Run automatically as part of the release pipeline (after bumpp).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')

const rootPkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'))
const version = rootPkg.version

const starterPkgPath = resolve(rootDir, 'starter-template/package.json')
const starterPkg = JSON.parse(readFileSync(starterPkgPath, 'utf8'))

starterPkg.dependencies['@nyuccl/smile'] = `^${version}`

writeFileSync(starterPkgPath, JSON.stringify(starterPkg, null, 2) + '\n')

console.log(`  ✔  Synced starter-template @nyuccl/smile to ^${version}`)
