#!/usr/bin/env node
/**
 * Override / inheritance regression test — FAITHFUL non-workspace consumer install.
 *
 * Reproduces the manual `/tmp` verification: it copies the real `start/` template,
 * overlays the override probes from test/fixtures/overrides-overlay/, installs the
 * freshly *packed* module (dist tarball) into a temp project OUTSIDE the workspace
 * (separate node_modules, pnpm strict isolation), then drives a real browser. This
 * is how an actual experiment consumes the module — not a workspace import.
 * See docs/coding/organization.md and test/fixtures/overrides-overlay/README.md.
 *
 * Steps: pack -> copy start/ + overlay -> install tarball -> nuxt dev -> Playwright
 * spec -> assert the primitive-shadow build warning fired -> tear down.
 *
 * Requires network access (pnpm install in the temp consumer). Run from the repo root:
 *   pnpm test:overrides
 */
import { execFileSync, spawn } from 'node:child_process'
import { cpSync, mkdtempSync, openSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const startDir = join(repoRoot, 'start')
const overlayDir = join(repoRoot, 'test/fixtures/overrides-overlay')
const log = msg => console.log(`\n▸ [test:overrides] ${msg}`)

// Dedicated port, same default as the other e2e suites. If it's taken, fail
// fast: otherwise nuxt dev silently picks another port and the run either
// hangs waiting or tests whatever else is listening.
const PORT = Number(process.env.SMILE_E2E_PORT ?? 3100)
const BASE_URL = `http://localhost:${PORT}`

// Something answering on either loopback address means the port is taken.
// (A bind test isn't enough: on macOS, binding the wildcard address succeeds
// even while another server listens on [::1] only, as `nuxt dev` does.)
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

let consumerDir
let server

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: 'inherit', ...opts })
}

try {
  await assertPortFree(PORT) // before the slow pack/install steps

  // 1. Pack the module (prepack builds dist/).
  log('Packing @nyuccl/smile-nuxt …')
  const packDir = mkdtempSync(join(tmpdir(), 'smile-pack-'))
  run('pnpm', ['pack', '--pack-destination', packDir], { cwd: repoRoot })
  const tarball = join(packDir, readdirSync(packDir).find(f => f.endsWith('.tgz')))
  log(`Tarball: ${tarball}`)

  // 2. Fresh consumer OUTSIDE the workspace = copy of the real starter template.
  consumerDir = mkdtempSync(join(tmpdir(), 'smile-overrides-'))
  cpSync(startDir, consumerDir, { recursive: true })
  for (const junk of ['node_modules', '.nuxt', '.output', '.data', 'analysis', 'test']) {
    rmSync(join(consumerDir, junk), { recursive: true, force: true })
  }

  // 3. Overlay the override probes (everything except this README).
  cpSync(overlayDir, consumerDir, {
    recursive: true,
    filter: src => !src.endsWith('README.md'),
  })

  // 4. Point the module dep at the tarball, then install.
  const pkgPath = join(consumerDir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  pkg.dependencies['@nyuccl/smile-nuxt'] = `file:${tarball}`
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
  log(`Installing consumer in ${consumerDir} …`)
  run('pnpm', ['install'], { cwd: consumerDir })

  // 5. Ensure a browser is present (no-op if already cached).
  log('Ensuring Playwright chromium …')
  run('pnpm', ['exec', 'playwright', 'install', 'chromium'], { cwd: consumerDir })

  // 6. Start `nuxt dev`, logging to a FILE (not an in-memory stream handler):
  // step 7 below calls execFileSync, which blocks Node's event loop, so 'data'
  // events wouldn't fire during the Playwright run. Reading the file sidesteps that.
  log(`Starting nuxt dev on port ${PORT} …`)
  const logPath = join(consumerDir, 'dev.log')
  const logFd = openSync(logPath, 'a')
  const readLog = () => {
    try {
      return readFileSync(logPath, 'utf8')
    }
    catch {
      return ''
    }
  }
  server = spawn('pnpm', ['dev'], {
    cwd: consumerDir,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env, PORT: String(PORT) },
  })

  // Ready when the server answers HTTP (any status) on our port.
  const ready = await new Promise((resolve) => {
    const deadline = Date.now() + 180_000
    const timer = setInterval(async () => {
      try {
        await fetch(BASE_URL, { redirect: 'manual' })
        clearInterval(timer)
        resolve(true)
      }
      catch {
        if (Date.now() > deadline) {
          clearInterval(timer)
          resolve(false)
        }
      }
    }, 500)
  })
  if (!ready) {
    console.error(readLog())
    throw new Error('nuxt dev did not become ready within 180s')
  }

  // 7. Run the Playwright assertions against the running server.
  log('Running Playwright spec …')
  run('pnpm', ['exec', 'playwright', 'test', 'test/e2e/overrides.spec.ts'], {
    cwd: consumerDir,
    env: { ...process.env, SMILE_E2E_PORT: String(PORT) },
  })

  // 8. Assert the primitive-shadow build warning fired for both shadows.
  log('Checking for primitive-shadow build warning …')
  const serverLog = readLog()
  const warned = name =>
    serverLog.includes(`components/${name}`) && /overrides the built-in SMILE UI component/.test(serverLog)
  const missing = ['Button.vue', 'Checkbox.vue'].filter(n => !warned(n))
  if (missing.length) {
    console.error(readLog())
    throw new Error(`Expected shadow warning for: ${missing.join(', ')}`)
  }

  log('PASS — overrides behave as documented, and the shadow warning fired.')
}
finally {
  // 9. Tear down: kill the server process group, remove the temp consumer.
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM')
    }
    catch { /* already gone */ }
  }
  if (consumerDir) {
    try {
      rmSync(consumerDir, { recursive: true, force: true })
    }
    catch { /* best effort */ }
  }
}
