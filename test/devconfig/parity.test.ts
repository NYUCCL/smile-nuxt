// The build settings page re-implements how the server resolves dev and
// presentation access (it can't import the server code into plain JS). This
// keeps the two in step.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveAccess } from '../../src/runtime/shared/config-rules.js'

vi.mock('../../src/runtime/server/utils/db', () => ({ useDB: () => ({}) }))

const ACCESS = [undefined, '', 'disabled', 'password', 'open', 'Open', 'bogus']
const PASSWORD = [undefined, 'pw']
const LEGACY = [undefined, 'true', 'false']

describe('access resolution matches server/utils/dev-auth.ts', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it.each(ACCESS.flatMap(a => PASSWORD.flatMap(p => LEGACY.map(l => [a, p, l] as const))))(
    'access=%s password=%s public=%s', async (access, password, legacy) => {
      vi.stubGlobal('__SMILE_DEV_TOOLS__', true)
      for (const [k, v] of [['SMILE_DEV_ACCESS', access], ['SMILE_DEV_PASSWORD', password], ['SMILE_PRESENTATION_ACCESS', access], ['SMILE_PRESENTATION_PASSWORD', password], ['SMILE_PUBLIC_PRESENTATION', legacy]] as const) {
        if (v === undefined) vi.stubEnv(k, undefined as unknown as string)
        else vi.stubEnv(k, v)
      }
      vi.resetModules()
      const server = await import('../../src/runtime/server/utils/dev-auth')
      expect(resolveAccess(access, !!password)).toBe(server.getDevAccess())
      expect(resolveAccess(access, !!password, legacy === 'true')).toBe(server.getPresentationAccess())
    },
  )
})
