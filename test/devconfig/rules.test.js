import { describe, it, expect } from 'vitest'
import { checkConfig, deploySummary, devToolsIncluded, isBcryptHash, redactSecret, resolveAccess, validateValue } from '../../src/runtime/shared/config-rules.js'
import { SETTINGS, SECRET_KEYS } from '../../src/runtime/shared/config-schema.js'

const HASH = `$2b$12$${'a'.repeat(53)}`
const line = (ctx, id) => deploySummary(ctx).find(l => l.id === id)
const ids = ctx => checkConfig(ctx).map(f => f.id)

describe('settings schema', () => {
  it('has unique keys, a description and a way to change each one', () => {
    const keys = SETTINGS.map(s => s.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const s of SETTINGS) {
      expect(s.description, s.key).toBeTruthy()
      expect(s.change, s.key).toBeTruthy()
      expect(['build', 'runtime']).toContain(s.phase)
    }
  })

  it('marks the passwords, the auth secret and the Turso token as secrets', () => {
    expect(SECRET_KEYS.sort()).toEqual(['SMILE_AUTH_SECRET', 'SMILE_DEV_PASSWORD', 'SMILE_PRESENTATION_PASSWORD', 'TURSO_AUTH_TOKEN'])
  })
})

describe('helpers', () => {
  it('recognises a bcrypt hash and redacts secrets to set/kind', () => {
    expect(isBcryptHash(HASH)).toBe(true)
    expect(isBcryptHash('hunter2')).toBe(false)
    expect(redactSecret(undefined)).toEqual({ set: false })
    expect(redactSecret('hunter2')).toEqual({ set: true, kind: 'plaintext' })
    expect(redactSecret(HASH)).toEqual({ set: true, kind: 'bcrypt' })
  })

  it('resolves the dev tools build like module.ts', () => {
    expect(devToolsIncluded(undefined, undefined)).toEqual({ included: false, from: 'default' })
    expect(devToolsIncluded(undefined, true)).toEqual({ included: true, from: 'smile.devTools' })
    expect(devToolsIncluded('include', false).included).toBe(true)
    expect(devToolsIncluded(' ON ', true).included).toBe(true)
    expect(devToolsIncluded('exclude', true).included).toBe(false)
    expect(devToolsIncluded('maybe', true)).toEqual({ included: true, from: 'smile.devTools' })
  })

  it('resolves access like dev-auth.ts', () => {
    expect(resolveAccess(undefined, false)).toBe('disabled')
    expect(resolveAccess(undefined, true)).toBe('password')
    expect(resolveAccess('open', true)).toBe('open')
    expect(resolveAccess('DISABLED', true)).toBe('disabled')
    expect(resolveAccess(undefined, true, true)).toBe('open')
  })

  it('validates values by type', () => {
    expect(validateValue('VITE_ALLOW_REPEATS', 'true')).toBeNull()
    expect(validateValue('VITE_ALLOW_REPEATS', 'yes')).toMatch(/true or false/)
    expect(validateValue('VITE_MAX_WRITES', '10k')).toMatch(/whole number/)
    expect(validateValue('VITE_WINDOWSIZER_REQUEST', '800x600')).toBeNull()
    expect(validateValue('VITE_WINDOWSIZER_REQUEST', '800')).toMatch(/WIDTHxHEIGHT/)
    expect(validateValue('SMILE_DEV_ACCESS', 'public')).toMatch(/disabled, password, open/)
    expect(validateValue('SMILE_DEV_TOOLS', 'yes')).toBeNull()
    expect(validateValue('SMILE_DEV_PASSWORD', { set: true })).toBeNull()
  })
})

describe('deploySummary', () => {
  it('defaults: no dev tools, presentation disabled, data to Vercel\'s Turso, auto-save on', () => {
    const ctx = { deploy: {} }
    expect(line(ctx, 'devtools')).toMatchObject({ status: 'ok' })
    expect(line(ctx, 'dev')).toMatchObject({ status: 'ok', answer: expect.stringMatching(/isn't in the build/) })
    expect(line(ctx, 'presentation')).toMatchObject({ status: 'ok' })
    expect(line(ctx, 'database')).toMatchObject({ status: 'check' })
    expect(line(ctx, 'authsecret')).toMatchObject({ status: 'check' })
    expect(line(ctx, 'saving')).toMatchObject({ status: 'ok' })
  })

  it('flags dev tools on every deploy, and open dev access as a risk', () => {
    const ctx = { deploy: { SMILE_DEV_TOOLS: 'include', SMILE_DEV_ACCESS: 'open' } }
    expect(line(ctx, 'devtools').status).toBe('check')
    expect(line(ctx, 'dev')).toMatchObject({ status: 'risk', answer: expect.stringMatching(/Anyone/) })
  })

  it('takes smile.devTools when the variable is unset', () => {
    expect(line({ deploy: {}, devToolsOption: true }, 'devtools').explanation).toMatch(/smile.devTools/)
  })

  it('password access: ok with a hash, check when the password must come from Vercel', () => {
    const base = { SMILE_DEV_TOOLS: 'include', SMILE_DEV_ACCESS: 'password' }
    expect(line({ deploy: { ...base, SMILE_DEV_PASSWORD: { set: true, kind: 'bcrypt' } } }, 'dev').status).toBe('ok')
    expect(line({ deploy: { ...base, SMILE_DEV_PASSWORD: { set: true, kind: 'plaintext' } } }, 'dev').recommendation).toMatch(/hash/)
    expect(line({ deploy: base }, 'dev')).toMatchObject({ status: 'check', answer: expect.stringMatching(/Vercel/) })
  })

  it('dev tools in the build with access disabled are dead weight', () => {
    expect(line({ deploy: { SMILE_DEV_TOOLS: 'include' } }, 'dev').status).toBe('check')
  })

  it('public presentation (also the legacy flag) is a check, not a risk', () => {
    expect(line({ deploy: { SMILE_PRESENTATION_ACCESS: 'open' } }, 'presentation').status).toBe('check')
    expect(line({ deploy: { SMILE_PUBLIC_PRESENTATION: 'true' } }, 'presentation').status).toBe('check')
  })

  it('auto-save off is a risk; a Turso URL in tracked files is ok', () => {
    expect(line({ deploy: { VITE_AUTO_SAVE_DATA: 'false' } }, 'saving').status).toBe('risk')
    expect(line({ deploy: { TURSO_DATABASE_URL: 'libsql://x.turso.io' } }, 'database').status).toBe('ok')
  })
})

describe('checkConfig', () => {
  it('nothing to say about an empty project', () => {
    expect(checkConfig({ deploy: {}, local: {} })).toEqual([])
  })

  it('a secret in a tracked file is an error, listed first', () => {
    const f = checkConfig({ local: { VITE_ALLOW_REPEATS: 'true' }, deploy: { VITE_ALLOW_REPEATS: 'true' }, tracked: ['SMILE_DEV_PASSWORD'] })
    expect(f[0]).toMatchObject({ level: 'error', id: 'secret-tracked:SMILE_DEV_PASSWORD' })
  })

  it('dev access configured but the dev tools excluded (as module.ts warns)', () => {
    expect(ids({ deploy: { SMILE_DEV_ACCESS: 'password' }, local: {} })).toContain('devtools-excluded-access:deploy')
    expect(ids({ deploy: {}, local: { SMILE_DEV_PASSWORD: { set: true, kind: 'bcrypt' } } })).toContain('devtools-excluded-access:local')
    expect(ids({ deploy: { SMILE_DEV_TOOLS: 'include', SMILE_DEV_ACCESS: 'password' }, local: {} }))
      .not.toContain('devtools-excluded-access:deploy')
  })

  it('reports invalid values once, and unknown keys', () => {
    const f = ids({ deploy: { VITE_MAX_WRITES: 'lots' }, local: { VITE_MAX_WRITES: 'lots' }, unknown: ['SMILE_DEV_PASWORD'] })
    expect(f.filter(id => id === 'invalid:VITE_MAX_WRITES')).toHaveLength(1)
    expect(f).toContain('unknown:SMILE_DEV_PASWORD')
  })

  it('settings only on this machine', () => {
    const f = checkConfig({ deploy: {}, local: {}, localOnly: ['TURSO_DATABASE_URL', 'VITE_MAX_STEPS', 'VITE_GIT_HASH'] })
    expect(f.find(x => x.id === 'local-only:TURSO_DATABASE_URL').fix).toMatch(/Vercel/)
    expect(f.find(x => x.id === 'local-only:VITE_MAX_STEPS').fix).toMatch(/\.env/)
    expect(f.find(x => x.id === 'local-only:VITE_GIT_HASH')).toBeUndefined()
  })

  it('plaintext passwords, Turso without a token, repeats, fast writes, the legacy flag', () => {
    const f = ids({
      local: { SMILE_DEV_PASSWORD: { set: true, kind: 'plaintext' }, TURSO_DATABASE_URL: 'libsql://x', SMILE_PUBLIC_PRESENTATION: 'true' },
      deploy: { VITE_ALLOW_REPEATS: 'true', VITE_MIN_WRITE_INTERVAL: '100' },
    })
    expect(f).toEqual(expect.arrayContaining(['plaintext:SMILE_DEV_PASSWORD', 'turso-no-token', 'allow-repeats', 'fast-writes', 'legacy-public-presentation']))
    expect(ids({ local: { SMILE_DEV_PASSWORD: { set: true, kind: 'bcrypt' } }, deploy: { SMILE_DEV_TOOLS: 'include' } }))
      .not.toContain('plaintext:SMILE_DEV_PASSWORD')
  })
})
