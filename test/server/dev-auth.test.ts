import { describe, it, expect, vi, afterEach } from 'vitest'
import { setFlags, resetFlags } from '../setup/flags'

// dev-auth imports the DB helper for sessions; access resolution doesn't need it.
vi.mock('../../src/runtime/server/utils/db', () => ({ useDB: () => ({}) }))

async function load() {
  vi.resetModules()
  return await import('../../src/runtime/server/utils/dev-auth')
}

describe('dev access and the dev tools build flag (#38)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('uses the access settings when the build includes the dev tools', async () => {
    vi.stubGlobal('__SMILE_DEV_TOOLS__', true)
    vi.stubEnv('SMILE_DEV_PASSWORD', 'secret')
    const { getDevAccess, devToolsBuilt } = await load()
    expect(devToolsBuilt()).toBe(true)
    expect(getDevAccess()).toBe('password')
  })

  it('is disabled when the build left the dev tools out, whatever the env says', async () => {
    vi.stubGlobal('__SMILE_DEV_TOOLS__', false)
    vi.stubEnv('SMILE_DEV_PASSWORD', 'secret')
    vi.stubEnv('SMILE_DEV_ACCESS', 'open')
    const { getDevAccess, accessForScope, devToolsBuilt } = await load()
    expect(devToolsBuilt()).toBe(false)
    expect(getDevAccess()).toBe('disabled')
    expect(accessForScope('dev')).toBe('disabled')
  })

  it('does not affect presentation access', async () => {
    vi.stubGlobal('__SMILE_DEV_TOOLS__', false)
    vi.stubEnv('SMILE_PRESENTATION_PASSWORD', 'secret')
    const { accessForScope } = await load()
    expect(accessForScope('presentation')).toBe('password')
  })
})

describe('the secret that signs tokens (getAuthSecret)', () => {
  const SECRETS = ['SMILE_AUTH_SECRET', 'TURSO_AUTH_TOKEN', 'SMILE_DEV_PASSWORD']
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })
  const clear = () => SECRETS.forEach(name => vi.stubEnv(name, ''))

  it('is SMILE_AUTH_SECRET, else the Turso token, else the dev password', async () => {
    clear()
    const { getAuthSecret } = await load()
    vi.stubEnv('SMILE_DEV_PASSWORD', 'password')
    expect(getAuthSecret()).toBe('password')
    vi.stubEnv('TURSO_AUTH_TOKEN', 'turso')
    expect(getAuthSecret()).toBe('turso')
    vi.stubEnv('SMILE_AUTH_SECRET', 'dedicated')
    expect(getAuthSecret()).toBe('dedicated')
  })

  it('is the built-in key when none is set, with one warning however often it is asked for', async () => {
    clear()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getAuthSecret } = await load()
    expect(getAuthSecret()).toBe('smile-local-dev-key')
    expect(getAuthSecret()).toBe('smile-local-dev-key')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toContain('Set SMILE_AUTH_SECRET')
  })

  it('does not warn on a local dev server, where the built-in key is expected', async () => {
    clear()
    setFlags({ dev: true })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getAuthSecret } = await load()
    expect(getAuthSecret()).toBe('smile-local-dev-key')
    resetFlags()
    expect(warn).not.toHaveBeenCalled()
  })

  it('does not warn when a secret is set', async () => {
    clear()
    vi.stubEnv('SMILE_AUTH_SECRET', 'dedicated')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getAuthSecret } = await load()
    getAuthSecret()
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('session tokens', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('a token names its session and scope and is signed with the secret', async () => {
    vi.stubEnv('SMILE_AUTH_SECRET', 'one')
    const { signSessionToken, sessionIdFromToken } = await load()
    const token = signSessionToken('abc', 'dev')
    expect(token).toMatch(/^abc\.dev\.[0-9a-f]{64}$/)
    expect(signSessionToken('abc', 'dev')).toBe(token)
    expect(signSessionToken('abc', 'presentation').split('.')[2]).not.toBe(token.split('.')[2])
    vi.stubEnv('SMILE_AUTH_SECRET', 'two')
    expect(signSessionToken('abc', 'dev')).not.toBe(token)
    expect(sessionIdFromToken(token)).toBe('abc')
  })

  it('sessionIdFromToken returns null for no token or an empty one', async () => {
    const { sessionIdFromToken } = await load()
    expect(sessionIdFromToken(undefined)).toBeNull()
    expect(sessionIdFromToken('')).toBeNull()
    expect(sessionIdFromToken('.dev.sig')).toBeNull()
  })

  it('names the cookie and the password of each scope', async () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'd')
    vi.stubEnv('SMILE_PRESENTATION_PASSWORD', 'p')
    const { cookieNameForScope, passwordForScope } = await load()
    expect(cookieNameForScope('dev')).toBe('smile_dev_session')
    expect(cookieNameForScope('presentation')).toBe('smile_presentation_session')
    expect(passwordForScope('dev')).toBe('d')
    expect(passwordForScope('presentation')).toBe('p')
  })
})
