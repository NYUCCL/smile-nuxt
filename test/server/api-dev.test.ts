// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import bcrypt from 'bcryptjs'
import { startServer, projectConfig, type TestServer, type Browser } from './handler-helpers'
import { schema } from './db-helpers'
import { setFlags, resetFlags } from '../setup/flags'

vi.mock('h3', async () => (await import('./handler-helpers')).loadH3())
vi.mock('nitropack/runtime', async () => (await import('./handler-helpers')).nitroRuntime())

/**
 * Signing in (server/api/auth), the guard on /dev and /presentation
 * (middleware/dev-auth.ts), and the routes for developers (db-info,
 * projects, qr), as a deployed server runs them: `import.meta.dev` is not
 * set here, so nothing is open just because the server is local.
 */

const ENV = [
  'SMILE_AUTH_SECRET', 'SMILE_DEV_PASSWORD', 'SMILE_DEV_ACCESS',
  'SMILE_PRESENTATION_PASSWORD', 'SMILE_PRESENTATION_ACCESS', 'SMILE_PUBLIC_PRESENTATION',
]

let server: TestServer
let browser: Browser
let warn: MockInstance
beforeEach(async () => {
  for (const key of ENV) vi.stubEnv(key, '')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  Object.assign(projectConfig, { owner: undefined, repo: undefined, branch: undefined })
  server = await startServer({
    routes: [
      ['get', '/api/noid/participants', 'api/projects/[id]/participants.get.ts'],
      ['get', '/api/noid/participant', 'api/projects/[id]/participants/[participantId].get.ts'],
    ],
  })
  browser = server.browser()
})
afterEach(() => {
  server.close()
  vi.restoreAllMocks()
})

const sessions = () => server.db.select().from(schema.devSessions).all()
const signIn = async (b: Browser, password = 'letmein', scope?: string) => b.post('/api/auth/login', scope ? { password, scope } : { password })

describe('POST /api/auth/login', () => {
  it('answers 404 when dev access is not set up', async () => {
    const reply = await signIn(browser)
    expect(reply.status).toBe(404)
    expect(await sessions()).toHaveLength(0)
  })

  it('answers 400 when the route is open and needs no login', async () => {
    vi.stubEnv('SMILE_DEV_ACCESS', 'open')
    const reply = await signIn(browser)
    expect(reply.status).toBe(400)
    expect(reply.body.statusMessage).toBe('No login required')
  })

  it('answers 500 when access is "password" and no password is set', async () => {
    vi.stubEnv('SMILE_DEV_ACCESS', 'password')
    const reply = await signIn(browser)
    expect(reply.status).toBe(500)
    expect(reply.body.statusMessage).toBe('Password not configured')
  })

  it('answers 400 to a missing password or one that is not a string', async () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'letmein')
    for (const body of [{}, { password: 5 }, { password: null }, { password: ['letmein'] }, { password: { a: 1 } }]) {
      const reply = await browser.post('/api/auth/login', body)
      expect(reply.status).toBe(400)
      expect(reply.body.statusMessage).toBe('Password required')
    }
    expect((await browser.post('/api/auth/login')).status).toBe(400)
    expect(await sessions()).toHaveLength(0)
  })

  it('answers 401 to a wrong password and makes no session', async () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'letmein')
    const reply = await signIn(browser, 'guess')
    expect(reply.status).toBe(401)
    expect(browser.lastSetCookies).toHaveLength(0)
    expect(await sessions()).toHaveLength(0)
  })

  it('signs in with a plaintext password, warns about it, and sets a session cookie for 7 days', async () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'letmein')
    const reply = await signIn(browser)
    expect(reply.status).toBe(200)
    expect(reply.body).toEqual({ success: true, scope: 'dev' })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('stored in plaintext'))

    const stored = await sessions()
    expect(stored).toHaveLength(1)
    const days = (stored[0]!.expiresAt.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThan(7.1)

    const cookie = browser.lastSetCookies[0]!
    expect(cookie).toMatch(new RegExp(`^smile_dev_session=${stored[0]!.id}\\.dev\\.[0-9a-f]{64};`))
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Max-Age=604800')
    expect(cookie).not.toContain('Secure')
  })

  it('marks the cookie Secure over https', async () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'letmein')
    await browser.post('/api/auth/login', { password: 'letmein' }, { 'x-forwarded-proto': 'https' })
    expect(browser.lastSetCookies[0]).toContain('Secure')
  })

  it('checks a bcrypt hash without a warning', async () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', bcrypt.hashSync('letmein', 4))
    expect((await signIn(browser, 'wrong')).status).toBe(401)
    expect((await signIn(browser, 'letmein')).status).toBe(200)
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('plaintext'))
  })

  it('signs in to the presentation with its own password and cookie', async () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'letmein')
    vi.stubEnv('SMILE_PRESENTATION_PASSWORD', 'slides')
    expect((await signIn(browser, 'letmein', 'presentation')).status).toBe(401)
    const reply = await signIn(browser, 'slides', 'presentation')
    expect(reply.body).toEqual({ success: true, scope: 'presentation' })
    expect(browser.cookies.has('smile_presentation_session')).toBe(true)
    expect(browser.cookies.has('smile_dev_session')).toBe(false)
  })

  it('deletes expired sessions at a login and keeps live ones', async () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'letmein')
    await server.db.insert(schema.devSessions).values([
      { id: 'old', expiresAt: new Date(Date.now() - 60_000) },
      { id: 'live', expiresAt: new Date(Date.now() + 3_600_000) },
    ])
    await signIn(browser)
    const ids = (await sessions()).map(s => s.id)
    expect(ids).toContain('live')
    expect(ids).not.toContain('old')
    expect(ids).toHaveLength(2)
  })
})

describe('POST /api/auth/login when expired sessions cannot be deleted', () => {
  it('still signs in, and warns', async () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'letmein')
    vi.spyOn(server.db, 'delete').mockImplementation(() => {
      throw new Error('database is locked')
    })
    const reply = await signIn(browser)
    expect(reply.status).toBe(200)
    expect(browser.cookies.has('smile_dev_session')).toBe(true)
    expect(warn).toHaveBeenCalledWith('[smile] Could not delete expired sessions:', expect.any(Error))
  })
})

describe('GET /api/auth/session', () => {
  beforeEach(() => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'letmein')
    vi.stubEnv('SMILE_PRESENTATION_PASSWORD', 'slides')
  })

  it('says whether the browser is signed in, per scope', async () => {
    expect((await browser.get('/api/auth/session')).body).toEqual({ authenticated: false, scope: 'dev' })
    await signIn(browser)
    expect((await browser.get('/api/auth/session')).body).toEqual({ authenticated: true, scope: 'dev' })
    expect((await browser.get('/api/auth/session?scope=presentation')).body).toEqual({ authenticated: false, scope: 'presentation' })
  })

  it('a dev token is not accepted as a presentation token, or the other way round', async () => {
    await signIn(browser)
    const dev = browser.cookies.get('smile_dev_session')!
    const swapped = server.browser()
    swapped.cookies.set('smile_presentation_session', dev)
    expect((await swapped.get('/api/auth/session?scope=presentation')).body.authenticated).toBe(false)
    // Nor with its scope rewritten: the scope is part of what is signed
    swapped.cookies.set('smile_presentation_session', dev.replace('.dev.', '.presentation.'))
    expect((await swapped.get('/api/auth/session?scope=presentation')).body.authenticated).toBe(false)
  })

  it('refuses a token that is malformed, has a changed signature, or was signed with another secret', async () => {
    await signIn(browser)
    const good = browser.cookies.get('smile_dev_session')!
    const check = async (token: string) => {
      const b = server.browser()
      b.cookies.set('smile_dev_session', token)
      return (await b.get('/api/auth/session')).body.authenticated
    }
    expect(await check(good)).toBe(true)
    expect(await check(good.slice(0, -1) + (good.endsWith('0') ? '1' : '0'))).toBe(false)
    expect(await check(good.slice(0, -2))).toBe(false)
    expect(await check(good.split('.').slice(0, 2).join('.'))).toBe(false)
    expect(await check('nonsense')).toBe(false)
    vi.stubEnv('SMILE_AUTH_SECRET', 'rotated')
    expect(await check(good)).toBe(false)
  })

  it('refuses a session that has expired or was deleted', async () => {
    await signIn(browser)
    await server.db.update(schema.devSessions).set({ expiresAt: new Date(Date.now() - 1000) })
    expect((await browser.get('/api/auth/session')).body.authenticated).toBe(false)
    await server.db.update(schema.devSessions).set({ expiresAt: new Date(Date.now() + 60_000) })
    expect((await browser.get('/api/auth/session')).body.authenticated).toBe(true)
    await server.db.delete(schema.devSessions)
    expect((await browser.get('/api/auth/session')).body.authenticated).toBe(false)
  })
})

describe('POST /api/auth/logout', () => {
  it('deletes the sessions of both scopes and clears their cookies', async () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'letmein')
    vi.stubEnv('SMILE_PRESENTATION_PASSWORD', 'slides')
    await signIn(browser)
    await signIn(browser, 'slides', 'presentation')
    const other = server.browser()
    await signIn(other)
    expect(await sessions()).toHaveLength(3)

    const reply = await browser.post('/api/auth/logout')
    expect(reply.body).toEqual({ success: true })
    expect(browser.cookies.size).toBe(0)
    expect(await sessions()).toHaveLength(1)
    // The other browser is still signed in
    expect((await other.get('/api/auth/session')).body.authenticated).toBe(true)
  })

  it('succeeds with no cookies', async () => {
    const reply = await browser.post('/api/auth/logout')
    expect(reply.status).toBe(200)
    expect(reply.body).toEqual({ success: true })
  })
})

describe('the guard on /dev and /presentation (middleware/dev-auth.ts)', () => {
  it('leaves other pages alone', async () => {
    expect((await browser.get('/welcome')).status).toBe(200)
  })

  it('answers 404 for both when nothing is set up', async () => {
    for (const path of ['/dev', '/dev/', '/dev/data', '/presentation', '/presentation/x']) {
      expect((await browser.get(path)).status).toBe(404)
    }
  })

  it('answers 404 when access is "password" and no password is set', async () => {
    vi.stubEnv('SMILE_DEV_ACCESS', 'password')
    expect((await browser.get('/dev')).status).toBe(404)
  })

  it('lets everyone in when access is "open"', async () => {
    vi.stubEnv('SMILE_DEV_ACCESS', 'open')
    vi.stubEnv('SMILE_PRESENTATION_ACCESS', 'open')
    expect((await browser.get('/dev/data')).status).toBe(200)
    expect((await browser.get('/presentation')).status).toBe(200)
  })

  it('opens the presentation with the older SMILE_PUBLIC_PRESENTATION=true', async () => {
    vi.stubEnv('SMILE_PUBLIC_PRESENTATION', 'true')
    expect((await browser.get('/presentation')).status).toBe(200)
    expect((await browser.get('/dev')).status).toBe(404)
  })

  it('an explicit access setting wins over a password and over the older setting', async () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'letmein')
    vi.stubEnv('SMILE_DEV_ACCESS', ' Disabled ')
    vi.stubEnv('SMILE_PUBLIC_PRESENTATION', 'true')
    vi.stubEnv('SMILE_PRESENTATION_ACCESS', 'disabled')
    expect((await browser.get('/dev')).status).toBe(404)
    expect((await browser.get('/presentation')).status).toBe(404)
  })

  it('sends a visitor without a session to the login page, with the path and the scope', async () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'letmein')
    vi.stubEnv('SMILE_PRESENTATION_PASSWORD', 'slides')
    const dev = await browser.get('/dev/data')
    expect(dev.status).toBe(302)
    expect(dev.headers.get('location')).toBe('/dev-login?redirect=%2Fdev%2Fdata&scope=dev')
    const pres = await browser.get('/presentation')
    expect(pres.status).toBe(302)
    expect(pres.headers.get('location')).toBe('/dev-login?redirect=%2Fpresentation&scope=presentation')
  })

  it('lets a signed-in browser into its own scope only', async () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'letmein')
    vi.stubEnv('SMILE_PRESENTATION_PASSWORD', 'slides')
    await signIn(browser)
    expect((await browser.get('/dev/data')).status).toBe(200)
    expect((await browser.get('/presentation')).status).toBe(302)
    const viewer = server.browser()
    await signIn(viewer, 'slides', 'presentation')
    expect((await viewer.get('/presentation')).status).toBe(200)
    expect((await viewer.get('/dev')).status).toBe(302)
  })

  it('does not guard paths that only start with the same letters (the login page among them)', async () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'letmein')
    vi.stubEnv('SMILE_PRESENTATION_PASSWORD', 'slides')
    for (const path of ['/dev-login', '/devices', '/presentations']) {
      expect((await browser.get(path)).status).toBe(200)
    }
  })
})

describe('routes for developers (requireDevAuth)', () => {
  const routes = ['/api/db-info', '/api/projects', '/api/projects/x/participants', '/api/projects/x/participants/y']

  it('answer 404 when dev access is not set up, or is "password" with no password', async () => {
    for (const path of routes) expect((await browser.get(path)).status).toBe(404)
    vi.stubEnv('SMILE_DEV_ACCESS', 'password')
    for (const path of routes) expect((await browser.get(path)).status).toBe(404)
  })

  it('answer 403 without a session when a password is set', async () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'letmein')
    for (const path of routes) expect((await browser.get(path)).status).toBe(403)
  })

  it('do not accept a presentation session', async () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'letmein')
    vi.stubEnv('SMILE_PRESENTATION_PASSWORD', 'slides')
    await signIn(browser, 'slides', 'presentation')
    for (const path of routes) expect((await browser.get(path)).status).toBe(403)
  })

  it('answer a signed-in developer, and anyone when access is "open"', async () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'letmein')
    await signIn(browser)
    expect((await browser.get('/api/db-info')).status).toBe(200)
    expect((await browser.get('/api/projects')).status).toBe(200)
    vi.stubEnv('SMILE_DEV_ACCESS', 'open')
    expect((await server.browser().get('/api/projects')).status).toBe(200)
  })
})

describe('GET /api/db-info', () => {
  beforeEach(() => vi.stubEnv('SMILE_DEV_ACCESS', 'open'))

  it('describes a local database and the current project', async () => {
    Object.assign(projectConfig, { owner: 'nyuccl', repo: 'stroop', branch: 'pilot' })
    const reply = await browser.get('/api/db-info')
    expect(reply.body).toEqual({
      type: 'Local SQLite',
      url: server.url,
      project: { id: 'nyuccl:stroop:pilot:live', owner: 'nyuccl', repo: 'stroop', branch: 'pilot', mode: 'live' },
    })
  })

  it('falls back to local:experiment:main when the config names no project', async () => {
    expect((await browser.get('/api/db-info')).body.project.id).toBe('local:experiment:main:live')
  })

  it('names Turso and hides anything before an @ in its address', async () => {
    // The handler only reads the address; the server keeps the connection it already has
    vi.stubEnv('TURSO_DATABASE_URL', 'libsql://user:secret@my-db.example.invalid')
    const reply = await browser.get('/api/db-info')
    expect(reply.body.type).toBe('Turso')
    expect(reply.body.url).toBe('libsql://***@my-db.example.invalid')
    vi.stubEnv('TURSO_DATABASE_URL', 'ws://localhost:8080')
    expect((await browser.get('/api/db-info')).body.type).toBe('LibSQL')
    vi.stubEnv('TURSO_DATABASE_URL', server.url)
  })
})

describe('the project routes (scoped to this owner and repo)', () => {
  const at = (seconds: number) => new Date(seconds * 1000)
  beforeEach(async () => {
    vi.stubEnv('SMILE_DEV_ACCESS', 'open')
    Object.assign(projectConfig, { owner: 'nyuccl', repo: 'stroop' })
    await server.db.insert(schema.projects).values([
      { id: 'nyuccl:stroop:main:live', owner: 'nyuccl', repo: 'stroop', branch: 'main', mode: 'live', createdAt: at(1000) },
      { id: 'nyuccl:stroop:pilot:test', owner: 'nyuccl', repo: 'stroop', branch: 'pilot', mode: 'test', createdAt: at(2000) },
      { id: 'nyuccl:other:main:live', owner: 'nyuccl', repo: 'other', branch: 'main', mode: 'live', createdAt: at(3000) },
      { id: 'elsewhere:stroop:main:live', owner: 'elsewhere', repo: 'stroop', branch: 'main', mode: 'live', createdAt: at(4000) },
    ])
    await server.db.insert(schema.participants).values([
      { id: 'a', projectId: 'nyuccl:stroop:main:live', data: { n: 1 }, createdAt: at(5000), updatedAt: at(6000) },
      { id: 'b', projectId: 'nyuccl:stroop:main:live', data: { n: 2 }, createdAt: at(5000), updatedAt: at(7000) },
      { id: 'c', projectId: 'nyuccl:other:main:live', data: { n: 3 }, createdAt: at(5000), updatedAt: at(8000) },
      { id: 'd', projectId: 'elsewhere:stroop:main:live', data: { n: 4 }, createdAt: at(5000), updatedAt: at(9000) },
    ])
  })
  const enc = encodeURIComponent

  it('GET /api/projects lists this owner and repo only, with counts and the last update', async () => {
    const reply = await browser.get('/api/projects')
    const byId = Object.fromEntries((reply.body as { id: string }[]).map(p => [p.id, p]))
    expect(Object.keys(byId).sort()).toEqual(['nyuccl:stroop:main:live', 'nyuccl:stroop:pilot:test'])
    expect(byId['nyuccl:stroop:main:live']).toEqual({
      id: 'nyuccl:stroop:main:live',
      owner: 'nyuccl',
      repo: 'stroop',
      branch: 'main',
      mode: 'live',
      createdAt: at(1000).toISOString(),
      recordCount: 2,
      lastUpdated: at(7000).toISOString(),
    })
    expect(byId['nyuccl:stroop:pilot:test']).toMatchObject({ recordCount: 0, lastUpdated: null })
  })

  it('GET /api/projects is empty for an owner and repo with no rows', async () => {
    Object.assign(projectConfig, { owner: 'nobody', repo: 'nothing' })
    expect((await browser.get('/api/projects')).body).toEqual([])
  })

  it('GET /api/projects/:id/participants lists a project\'s participants without their data', async () => {
    const reply = await browser.get(`/api/projects/${enc('nyuccl:stroop:main:live')}/participants`)
    expect(reply.status).toBe(200)
    expect(reply.body).toEqual([
      { id: 'a', projectId: 'nyuccl:stroop:main:live', createdAt: at(5000).toISOString(), updatedAt: at(6000).toISOString() },
      { id: 'b', projectId: 'nyuccl:stroop:main:live', createdAt: at(5000).toISOString(), updatedAt: at(7000).toISOString() },
    ])
    expect((await browser.get(`/api/projects/${enc('nyuccl:stroop:pilot:test')}/participants`)).body).toEqual([])
  })

  it('GET /api/projects/:id/participants/:participantId returns one record', async () => {
    const reply = await browser.get(`/api/projects/${enc('nyuccl:stroop:main:live')}/participants/a`)
    expect(reply.body).toEqual({
      id: 'a',
      projectId: 'nyuccl:stroop:main:live',
      data: { n: 1 },
      createdAt: at(5000).toISOString(),
      updatedAt: at(6000).toISOString(),
    })
  })

  it('both answer 404 for a project that does not exist', async () => {
    expect((await browser.get('/api/projects/none/participants')).status).toBe(404)
    expect((await browser.get('/api/projects/none/participants/a')).status).toBe(404)
  })

  it('both answer 403 for a project of another owner or another repo', async () => {
    for (const id of ['nyuccl:other:main:live', 'elsewhere:stroop:main:live']) {
      expect((await browser.get(`/api/projects/${enc(id)}/participants`)).status).toBe(403)
      expect((await browser.get(`/api/projects/${enc(id)}/participants/${id.startsWith('nyuccl') ? 'c' : 'd'}`)).status).toBe(403)
    }
  })

  it('answers 404 for a participant of another project, even one in scope', async () => {
    const reply = await browser.get(`/api/projects/${enc('nyuccl:stroop:pilot:test')}/participants/a`)
    expect(reply.status).toBe(404)
    expect(reply.body.statusMessage).toBe('Participant not found in this project')
    expect((await browser.get(`/api/projects/${enc('nyuccl:stroop:main:live')}/participants/zzz`)).status).toBe(404)
  })

  it('both answer 400 when the route gives no ids', async () => {
    expect((await browser.get('/api/noid/participants')).status).toBe(400)
    expect((await browser.get('/api/noid/participant')).status).toBe(400)
  })
})

describe('GET /api/qr', () => {
  it('returns an SVG for the url given, cacheable for a day', async () => {
    const reply = await browser.get('/api/qr?url=' + encodeURIComponent('https://example.org/study/'))
    expect(reply.status).toBe(200)
    expect(reply.headers.get('content-type')).toBe('image/svg+xml')
    expect(reply.headers.get('cache-control')).toBe('public, max-age=86400')
    expect(reply.text).toContain('<svg')
    expect(reply.text).toContain('width="256"')
  })

  it('makes the same code with or without a trailing slash, and a different one for another url', async () => {
    const withSlash = await browser.get('/api/qr?url=' + encodeURIComponent('https://example.org/study/'))
    const without = await browser.get('/api/qr?url=' + encodeURIComponent('https://example.org/study'))
    const other = await browser.get('/api/qr?url=' + encodeURIComponent('https://example.org/other'))
    expect(withSlash.text).toBe(without.text)
    expect(other.text).not.toBe(without.text)
  })

  it('uses the address of the request when no url is given', async () => {
    const none = await browser.get('/api/qr')
    const same = await browser.get('/api/qr?url=' + encodeURIComponent('http://localhost'))
    expect(none.status).toBe(200)
    expect(none.text).toBe(same.text)
  })

  it('answers 400 to a url given twice or one over 2000 characters', async () => {
    const twice = await browser.get('/api/qr?url=a&url=b')
    expect(twice.status).toBe(400)
    expect(twice.body.statusMessage).toBe('url must be given once')
    const long = await browser.get('/api/qr?url=' + 'a'.repeat(2001))
    expect(long.status).toBe(400)
    expect((await browser.get('/api/qr?url=' + 'a'.repeat(2000))).status).toBe(200)
  })

  it('needs no session', async () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'letmein')
    expect((await server.browser().get('/api/qr')).status).toBe(200)
  })
})

describe('on a local dev server (import.meta.dev)', () => {
  beforeEach(() => setFlags({ dev: true }))
  afterEach(resetFlags)

  it('opens /dev and /presentation with nothing set up', async () => {
    for (const path of ['/dev', '/dev/data', '/presentation', '/presentation/x']) {
      expect((await browser.get(path)).status).toBe(200)
    }
  })

  it('answers the routes for developers without a session', async () => {
    expect((await browser.get('/api/db-info')).status).toBe(200)
    expect((await browser.get('/api/projects')).status).toBe(200)
  })

  it('still asks for a password that is set when the server is not local', async () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'letmein')
    expect((await browser.get('/api/projects')).status).toBe(200)
    resetFlags()
    expect((await browser.get('/api/projects')).status).toBe(403)
  })

  it('names the project\'s mode "test"; a deployed server names it "live"', async () => {
    const { getCurrentProjectInfo } = await import('../../src/runtime/server/utils/project')
    expect(getCurrentProjectInfo()).toEqual({ owner: 'local', repo: 'experiment', branch: 'main', mode: 'test' })
    resetFlags()
    expect(getCurrentProjectInfo().mode).toBe('live')
  })
})
