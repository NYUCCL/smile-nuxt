import { describe, it, expect, vi, afterEach } from 'vitest'

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
