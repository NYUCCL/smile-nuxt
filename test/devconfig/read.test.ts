// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readBuildConfig } from '../../src/devconfig/read'
import { handleDevConfig, hostName, isAllowedHost, createDevConfigHandler } from '../../src/devconfig/handler'

// Fixture secrets: none of these may ever appear in a response.
const PLAIN = 'fixture-plain-password-7731'
const HASH = `$2b$12$${'Q'.repeat(53)}`
const TOKEN = 'fixture-turso-token-5519'
const AUTH = 'fixture-auth-secret-0042'

let dir: string
const write = (name: string, text: string) => writeFileSync(join(dir, name), text)
const setting = (cfg: ReturnType<typeof readBuildConfig>, key: string) => cfg.settings.find(s => s.key === key)!

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'smile-devconfig-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('readBuildConfig', () => {
  it('everything at its default in an empty project', () => {
    const cfg = readBuildConfig({ rootDir: dir, env: {} })
    expect(setting(cfg, 'VITE_MAX_WRITES')).toMatchObject({ value: null, source: null, deployValue: null, localOnly: false })
    expect(cfg.findings).toEqual([])
    expect(cfg.vercelLinked).toBe(false)
    expect(Object.values(cfg.files).every(f => !f.exists)).toBe(true)
  })

  it('layers: environment > .env.local > .env, with the others listed', () => {
    write('.env', 'VITE_MAX_WRITES = 1000\nVITE_MAX_STEPS = 10\nVITE_ALLOW_REPEATS = false\n')
    write('.env.local', 'VITE_MAX_WRITES = 50\n')
    // Nuxt copies .env into process.env: an equal value is not "the shell".
    const cfg = readBuildConfig({ rootDir: dir, env: { VITE_MAX_WRITES: '1000', VITE_MAX_STEPS: '99' } })

    expect(setting(cfg, 'VITE_MAX_WRITES')).toMatchObject({
      value: '50', source: '.env.local', deployValue: '1000', deploySource: '.env',
      alsoIn: [{ file: '.env', value: '1000', tracked: true }],
    })
    expect(setting(cfg, 'VITE_MAX_STEPS')).toMatchObject({ value: '99', source: 'environment', deployValue: '10' })
    expect(setting(cfg, 'VITE_ALLOW_REPEATS')).toMatchObject({ value: 'false', source: '.env' })
  })

  it('.env.production wins over .env for deploys; generated values come from .env.git.local', () => {
    write('.env', 'SMILE_DEV_TOOLS=exclude\n')
    write('.env.production', 'SMILE_DEV_TOOLS=include\n')
    write('.env.git.local', 'VITE_GIT_HASH = abc1234\n')
    const cfg = readBuildConfig({ rootDir: dir, env: {} })
    expect(setting(cfg, 'SMILE_DEV_TOOLS')).toMatchObject({ deployValue: 'include', deploySource: '.env.production' })
    expect(cfg.summary.find(l => l.id === 'devtools')!.status).toBe('check')
    expect(setting(cfg, 'VITE_GIT_HASH')).toMatchObject({ value: 'abc1234', source: '.env.git.local', generated: true })
  })

  it('marks settings a deploy won\'t see', () => {
    write('.env.local', `TURSO_DATABASE_URL=libsql://x.turso.io\nTURSO_AUTH_TOKEN=${TOKEN}\n`)
    const cfg = readBuildConfig({ rootDir: dir, env: {} })
    expect(setting(cfg, 'TURSO_DATABASE_URL').localOnly).toBe(true)
    expect(cfg.findings.map(f => f.id)).toContain('local-only:TURSO_DATABASE_URL')
  })

  it('never returns a secret, from any file or the environment', () => {
    write('.env', `SMILE_DEV_PASSWORD = ${PLAIN}\n`)
    write('.env.local', `SMILE_DEV_PASSWORD = ${HASH}\nTURSO_AUTH_TOKEN=${TOKEN}\n`)
    const cfg = readBuildConfig({ rootDir: dir, env: { SMILE_AUTH_SECRET: AUTH, SMILE_PRESENTATION_PASSWORD: PLAIN } })
    const json = JSON.stringify(cfg)
    for (const secret of [PLAIN, HASH, TOKEN, AUTH]) expect(json).not.toContain(secret)

    expect(setting(cfg, 'SMILE_DEV_PASSWORD')).toMatchObject({
      value: { set: true, kind: 'bcrypt' }, source: '.env.local',
      deployValue: { set: true, kind: 'plaintext' },
      alsoIn: [{ file: '.env', value: { set: true, kind: 'plaintext' } }],
    })
    expect(setting(cfg, 'SMILE_AUTH_SECRET')).toMatchObject({ value: { set: true, kind: 'plaintext' }, source: 'environment' })
    expect(cfg.findings.map(f => f.id)).toContain('secret-tracked:SMILE_DEV_PASSWORD')
  })

  it('flags keys that look like settings but aren\'t (typos), without their values', () => {
    write('.env.local', `SMILE_DEV_PASWORD=${PLAIN}\nVITE_SOMETHING_ELSE=1\n`)
    const cfg = readBuildConfig({ rootDir: dir, env: {} })
    expect(cfg.findings.map(f => f.id)).toEqual(['unknown:SMILE_DEV_PASWORD'])
    expect(JSON.stringify(cfg)).not.toContain(PLAIN)
  })

  it('sees a linked Vercel project and passes smile.devTools through', () => {
    mkdirSync(join(dir, '.vercel'))
    write('.vercel/project.json', '{}')
    const cfg = readBuildConfig({ rootDir: dir, env: {}, devToolsOption: true })
    expect(cfg.vercelLinked).toBe(true)
    expect(cfg.devToolsOption).toBe(true)
    expect(cfg.summary.find(l => l.id === 'devtools')!.explanation).toMatch(/smile.devTools/)
  })
})

describe('the /_smile/dev-config route', () => {
  const opts = () => ({ rootDir: dir, env: {} })

  it('parses Host headers', () => {
    expect(hostName('localhost:3000')).toBe('localhost')
    expect(hostName('[::1]:3000')).toBe('[::1]')
    expect(hostName('M4MINI')).toBe('m4mini')
    expect(hostName(undefined)).toBe('')
  })

  it('answers only at localhost or a name in vite.server.allowedHosts', () => {
    expect(isAllowedHost('localhost:3100', undefined)).toBe(true)
    expect(isAllowedHost('127.0.0.1:3100', undefined)).toBe(true)
    expect(isAllowedHost('app.localhost', undefined)).toBe(true)
    expect(isAllowedHost('m4mini:3000', ['m4mini'])).toBe(true)
    expect(isAllowedHost('a.example.org', ['.example.org'])).toBe(true)
    expect(isAllowedHost('anything', true)).toBe(true)
    expect(isAllowedHost('evil.example', ['m4mini'])).toBe(false)
    expect(isAllowedHost('192.168.1.5:3000', undefined)).toBe(false)
    expect(isAllowedHost('', undefined)).toBe(false)
  })

  it('refuses other hosts and anything but GET', () => {
    expect(handleDevConfig({ method: 'GET', host: 'evil.example' }, opts).status).toBe(403)
    expect(handleDevConfig({ method: 'POST', host: 'localhost' }, opts).status).toBe(405)
    expect(handleDevConfig({ method: 'GET', host: 'localhost:3100' }, opts).status).toBe(200)
  })

  it('a read error says nothing about the files', () => {
    const res = handleDevConfig({ method: 'GET', host: 'localhost' }, () => {
      throw new Error(`boom ${PLAIN}`)
    })
    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).not.toContain(PLAIN)
  })

  it('the portable handler sets the status and no-store', () => {
    write('.env', `SMILE_DEV_PASSWORD=${PLAIN}\n`)
    const handler = createDevConfigHandler(opts, () => ['m4mini'])
    const event = {
      req: new Request('http://m4mini:3000/_smile/dev-config', { headers: { host: 'm4mini:3000' } }),
      res: { status: 0, headers: new Headers() },
    }
    const body = handler(event)
    expect(event.res.status).toBe(200)
    expect(event.res.headers.get('cache-control')).toBe('no-store')
    expect(JSON.stringify(body)).not.toContain(PLAIN)
  })
})
