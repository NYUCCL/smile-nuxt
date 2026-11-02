#!/usr/bin/env node
/**
 * Starter smoke test (#55): scaffold a project the way a researcher does, then
 * build it and run the starter's own e2e suite (start/test/e2e) in it.
 *
 * Two modes:
 *
 *   pnpm test:starter               Local. Packs this checkout's module, runs the
 *                                   local create-smile-nuxt CLI with the template
 *                                   copied from start/ (SMILE_TEMPLATE_DIR), and
 *                                   installs the tarball. Catches template/module
 *                                   mismatches before anything is published.
 *
 *   pnpm test:starter --published [version]
 *                                   After a release. Runs the published CLI
 *                                   (pnpm dlx @nyuccl/create-smile-nuxt@latest)
 *                                   with the template from the v<version> tag,
 *                                   and installs @nyuccl/smile-nuxt@<version>
 *                                   (default: this checkout's version) from npm.
 *                                   This is exactly what a new user gets.
 *
 * Either way the project lives in a temp dir OUTSIDE the workspace (its own
 * node_modules, pnpm strict isolation), like a real consumer. Steps: scaffold ->
 * install -> nuxt build -> starter Playwright suite (it starts nuxt dev on
 * SMILE_E2E_PORT, default 3100) -> tear down. Needs network access.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const log = msg => console.log(`\n▸ [test:starter] ${msg}`)
const PORT = Number(process.env.SMILE_E2E_PORT ?? 3100)
const PROJECT = 'smile-starter-check'

const argv = process.argv.slice(2)
const published = argv.includes('--published')
const versionArg = argv.find(a => !a.startsWith('-'))
const moduleVersion = versionArg ?? JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version
const keep = argv.includes('--keep') // leave the temp project for inspection

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: 'inherit', ...opts })
}

// Something answering on either loopback address means the port is taken
// (see scripts/test-overrides.mjs for why a bind test isn't enough on macOS).
function answersOn(host, port) {
  return new Promise((resolve) => {
    const socket = connect({ host, port })
    socket.setTimeout(1000)
    const done = (answered) => {
      socket.destroy()
      resolve(answered)
    }
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => resolve(false))
  })
}

async function assertPortFree(port) {
  for (const host of ['127.0.0.1', '::1']) {
    if (await answersOn(host, port)) {
      throw new Error(`Port ${port} is already in use (${host}). Stop that server or set SMILE_E2E_PORT to a free port.`)
    }
  }
}

let workDir

try {
  await assertPortFree(PORT)
  workDir = mkdtempSync(join(tmpdir(), 'smile-starter-'))
  const projectDir = join(workDir, PROJECT)
  // A clean env for the consumer: no workspace or CI variables from this repo
  // leaking into the scaffold, except CI so Playwright starts its own server.
  const env = { ...process.env, CI: '1', SMILE_E2E_PORT: String(PORT) }
  delete env.npm_config_user_agent

  let moduleSpec
  if (published) {
    // Right after `pnpm publish`, the registry can 404 a new version for a
    // minute or two. Wait for it rather than failing the check.
    log(`Waiting for @nyuccl/smile-nuxt@${moduleVersion} on npm …`)
    const deadline = Date.now() + 5 * 60_000
    for (;;) {
      try {
        execFileSync('pnpm', ['view', `@nyuccl/smile-nuxt@${moduleVersion}`, 'version'], { stdio: 'pipe' })
        break
      }
      catch {
        if (Date.now() > deadline) throw new Error(`@nyuccl/smile-nuxt@${moduleVersion} is not on npm after 5 minutes`)
        await new Promise(resolve => setTimeout(resolve, 10_000))
      }
    }
    log(`Scaffolding with the published CLI into ${projectDir} …`)
    // The template from this version's release tag (what the CLI picks by default
    // once this version is npm's latest).
    run('pnpm', ['dlx', '@nyuccl/create-smile-nuxt@latest', PROJECT, '--no-install', '--no-git', '--template-ref', `v${moduleVersion}`], { cwd: workDir, env })
    moduleSpec = moduleVersion
  }
  else {
    log('Packing @nyuccl/smile-nuxt …')
    const packDir = mkdtempSync(join(tmpdir(), 'smile-pack-'))
    run('pnpm', ['pack', '--pack-destination', packDir], { cwd: repoRoot })
    const tarball = join(packDir, readdirSync(packDir).find(f => f.endsWith('.tgz')))
    log(`Scaffolding with the local CLI (template from start/) into ${projectDir} …`)
    run('node', [join(repoRoot, 'create-smile-nuxt/src/index.mjs'), PROJECT, '--no-install', '--no-git'], {
      cwd: workDir,
      env: { ...env, SMILE_TEMPLATE_DIR: join(repoRoot, 'start') },
    })
    moduleSpec = `file:${tarball}`
  }

  // Point the module dependency at what we're testing.
  const pkgPath = join(projectDir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  if (pkg.name !== PROJECT) throw new Error(`CLI should rename the package to ${PROJECT}, got ${pkg.name}`)
  log(`Template wants @nyuccl/smile-nuxt ${pkg.dependencies['@nyuccl/smile-nuxt']}; testing ${moduleSpec}`)
  pkg.dependencies['@nyuccl/smile-nuxt'] = moduleSpec
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  log('Installing …')
  run('pnpm', ['install'], { cwd: projectDir, env })

  log('Production build (nuxt build) …')
  run('pnpm', ['exec', 'nuxt', 'build'], { cwd: projectDir, env })

  log('Ensuring Playwright chromium …')
  run('pnpm', ['exec', 'playwright', 'install', 'chromium'], { cwd: projectDir, env })

  log(`Running the starter's e2e suite (port ${PORT}) …`)
  run('pnpm', ['exec', 'playwright', 'test', '--retries=0'], { cwd: projectDir, env })

  log(`PASS — a fresh ${published ? 'published' : 'local'} scaffold builds and passes its own e2e suite.`)
}
finally {
  if (workDir && !keep) {
    try {
      rmSync(workDir, { recursive: true, force: true })
    }
    catch { /* best effort */ }
  }
  else if (workDir) {
    log(`Kept ${workDir}`)
  }
}
