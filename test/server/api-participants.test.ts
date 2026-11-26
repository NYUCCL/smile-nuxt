// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { startServer, gzipped, projectConfig, type TestServer, type Browser } from './handler-helpers'
import { schema } from './db-helpers'
import { signParticipantToken, PARTICIPANT_COOKIE } from '../../src/runtime/server/utils/participant-token'
import { MAX_BODY_BYTES } from '../../src/runtime/server/utils/participant-save'

vi.mock('h3', async () => (await import('./handler-helpers')).loadH3())
vi.mock('nitropack/runtime', async () => (await import('./handler-helpers')).nitroRuntime())

/**
 * The participant routes (server/api/participants) with the middleware in
 * front of them, against a real SQLite file: what each answers, and what is
 * in the database afterwards.
 */

// With no secret in the environment, tokens are signed with this key (utils/dev-auth.ts)
const BUILTIN_SECRET = 'smile-local-dev-key'

let server: TestServer
let browser: Browser
beforeEach(async () => {
  vi.stubEnv('SMILE_AUTH_SECRET', '')
  vi.stubEnv('SMILE_DEV_PASSWORD', '')
  vi.stubEnv('SMILE_DEV_ACCESS', '')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  Object.assign(projectConfig, { owner: undefined, repo: undefined, branch: undefined })
  server = await startServer({
    routes: [
      ['get', '/api/noid/get', 'api/participants/[id].get.ts'],
      ['patch', '/api/noid/patch', 'api/participants/[id].patch.ts'],
      ['patch', '/api/noid/private-patch', 'api/participants/[id]/private.patch.ts'],
      ['post', '/api/noid/private-post', 'api/participants/[id]/private.post.ts'],
    ],
  })
  browser = server.browser()
})
afterEach(() => {
  server.close()
  vi.restoreAllMocks()
})

const participant = (id: string) => server.db.select().from(schema.participants).where(eq(schema.participants.id, id)).get()
const privateRows = (id: string) => server.db.select().from(schema.privateData).where(eq(schema.privateData.participantId, id)).all()

/** Creates a participant with this browser and returns its id */
async function create(b: Browser = browser, data: Record<string, unknown> = { seed: 1 }) {
  const reply = await b.post('/api/participants', { data })
  expect(reply.status).toBe(200)
  return reply.body.id as string
}

/** A browser holding a valid token for an id that has no row */
function browserFor(id: string, issuedAt?: number) {
  const b = server.browser()
  b.cookies.set(PARTICIPANT_COOKIE, signParticipantToken(id, BUILTIN_SECRET, issuedAt))
  return b
}

describe('POST /api/participants', () => {
  it('creates a row, answers with its id and rev 0, and sets the token cookie', async () => {
    const reply = await browser.post('/api/participants', {
      data: { consented: true, done: false, recruitmentService: 'prolific', starttime: 1700000000000, note: 'é' },
    })
    expect(reply.status).toBe(200)
    expect(reply.body).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), rev: 0 })

    const row = await participant(reply.body.id)
    expect(row).toMatchObject({
      projectId: 'local:experiment:main:live',
      data: { consented: true, done: false, recruitmentService: 'prolific', starttime: 1700000000000, note: 'é' },
      rev: 0,
      resume: null,
      consented: true,
      done: false,
      withdrawn: null,
      recruitmentService: 'prolific',
      startedAt: 1700000000000,
      endedAt: null,
      saveCount: 0,
      oversize: false,
    })
    expect(row!.dataBytes).toBe(Buffer.byteLength(JSON.stringify(row!.data), 'utf8'))

    expect(browser.lastSetCookies).toHaveLength(1)
    const cookie = browser.lastSetCookies[0]!
    expect(cookie).toMatch(new RegExp(`^${PARTICIPANT_COOKIE}=${reply.body.id}\\.\\d+\\.[0-9a-f]{64};`))
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('Max-Age=2592000')
    expect(cookie).not.toContain('Secure')
  })

  it('marks the cookie Secure when the request came over https', async () => {
    await browser.post('/api/participants', { data: {} }, { 'x-forwarded-proto': 'https' })
    expect(browser.lastSetCookies[0]).toContain('Secure')
  })

  it('takes the project from the server config, and makes its row once', async () => {
    Object.assign(projectConfig, { owner: 'nyuccl', repo: 'stroop', branch: 'pilot' })
    const first = await create(server.browser())
    const second = await create(server.browser())
    expect((await participant(first))!.projectId).toBe('nyuccl:stroop:pilot:live')
    expect((await participant(second))!.projectId).toBe('nyuccl:stroop:pilot:live')
    const projects = await server.db.select().from(schema.projects).all()
    expect(projects).toHaveLength(1)
    expect(projects[0]).toMatchObject({ id: 'nyuccl:stroop:pilot:live', owner: 'nyuccl', repo: 'stroop', branch: 'pilot', mode: 'live' })
  })

  it('ignores a project named in the body', async () => {
    const reply = await browser.post('/api/participants', { data: {}, projectId: 'someone:else:main:live' })
    expect((await participant(reply.body.id))!.projectId).toBe('local:experiment:main:live')
  })

  it('stores {} when the body has no data', async () => {
    const reply = await browser.post('/api/participants', {})
    expect(reply.status).toBe(200)
    expect((await participant(reply.body.id))!.data).toEqual({})
  })

  it('accepts a gzipped body', async () => {
    const reply = await browser.post('/api/participants', gzipped({ data: { zipped: true } }))
    expect(reply.status).toBe(200)
    expect((await participant(reply.body.id))!.data).toEqual({ zipped: true })
  })

  const refused: [string, string | undefined][] = [
    ['no body', undefined],
    ['invalid JSON', '{"data": '],
    ['an array', '[1]'],
    ['data that is a string', '{"data": "x"}'],
    ['data that is an array', '{"data": [1]}'],
  ]
  for (const [name, body] of refused) {
    it(`refuses ${name} with a marked 400 and stores nothing`, async () => {
      const reply = await browser.post('/api/participants', body)
      expect(reply.status).toBe(400)
      expect(reply.body.data).toEqual({ smile: 'refused' })
      expect(reply.body.statusMessage.length).toBeGreaterThan(5)
      expect(await server.db.select().from(schema.participants).all()).toHaveLength(0)
      expect(browser.lastSetCookies).toHaveLength(0)
    })
  }
})

describe('GET /api/participants/:id', () => {
  it('returns the record, its rev and its resume state to the browser that made it', async () => {
    const id = await create()
    expect((await browser.get(`/api/participants/${id}`)).body).toEqual({ data: { seed: 1 }, rev: 0, resume: null })

    await browser.patch(`/api/participants/${id}`, { rev: 3, data: { seed: 1, a: 2 }, resume: { view: 'task' } })
    const reply = await browser.get(`/api/participants/${id}`)
    expect(reply.status).toBe(200)
    expect(reply.body).toEqual({ data: { seed: 1, a: 2 }, rev: 3, resume: { view: 'task' } })
  })

  it('answers a marked 404 when the token is good and the row is gone', async () => {
    const reply = await browserFor('gone').get('/api/participants/gone')
    expect(reply.status).toBe(404)
    expect(reply.body.data).toEqual({ smile: 'no-participant' })
  })

  it('answers 400 when the route gives no id', async () => {
    expect((await browser.get('/api/noid/get')).status).toBe(400)
  })
})

describe('PATCH /api/participants/:id', () => {
  let id: string
  beforeEach(async () => {
    id = await create()
  })
  const save = (body: unknown, b = browser) => b.patch(`/api/participants/${id}`, body)

  it('stores a save with a newer rev and answers with that rev', async () => {
    const reply = await save({ rev: 1, data: { consented: true, endtime: 5 }, resume: { view: 'consent' } })
    expect(reply.status).toBe(200)
    expect(reply.body).toEqual({ success: true, rev: 1 })
    expect(await participant(id)).toMatchObject({
      data: { consented: true, endtime: 5 },
      resume: { view: 'consent' },
      rev: 1,
      consented: true,
      endedAt: 5,
      saveCount: 1,
    })
  })

  it('accepts a gzipped save', async () => {
    const reply = await save(gzipped({ rev: 1, data: { text: 'x'.repeat(5000) } }))
    expect(reply.body).toEqual({ success: true, rev: 1 })
    expect((await participant(id))!.data).toEqual({ text: 'x'.repeat(5000) })
  })

  it('accepts the same save twice (a resend) without writing again', async () => {
    const body = { rev: 2, data: { a: 1 }, resume: { view: 'x' } }
    expect((await save(body)).body).toEqual({ success: true, rev: 2 })
    expect((await save(body)).body).toEqual({ success: true, rev: 2 })
    expect((await participant(id))!.saveCount).toBe(1)
  })

  it('refuses an older or different save with 409 and the stored rev, and leaves the row', async () => {
    await save({ rev: 5, data: { a: 1 } })
    for (const body of [{ rev: 4, data: { a: 2 } }, { rev: 5, data: { a: 2 } }]) {
      const reply = await save(body)
      expect(reply.status).toBe(409)
      expect(reply.body.data).toEqual({ rev: 5 })
    }
    expect(await participant(id)).toMatchObject({ data: { a: 1 }, rev: 5, saveCount: 1 })
  })

  it('stores a save without a rev only until a save with resume state has been stored', async () => {
    expect((await save({ data: { old: 1 } })).body).toEqual({ success: true, rev: 1 })
    expect((await save({ data: { old: 2 } })).body).toEqual({ success: true, rev: 2 })
    await save({ rev: 3, data: { now: 1 }, resume: { view: 'a' } })
    const reply = await save({ data: { old: 3 } })
    expect(reply.status).toBe(409)
    expect(reply.body.data).toEqual({ rev: 3 })
    expect((await participant(id))!.data).toEqual({ now: 1 })
  })

  it('stores the private data sent with a save, merged into one row', async () => {
    await save({ rev: 1, data: { a: 1 }, private: { recruitment: { id: 'P1' } } })
    await save({ rev: 2, data: { a: 2 }, private: { withdraw: { why: 'tired' } } })
    const rows = await privateRows(id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.data).toEqual({ recruitment: { id: 'P1' }, withdraw: { why: 'tired' } })
    expect((await participant(id))!.data).toEqual({ a: 2 })
  })

  it('stores no private data when the save has none, or when the record is refused', async () => {
    await save({ rev: 2, data: { a: 1 } })
    const reply = await save({ rev: 1, data: { a: 0 }, private: { x: 1 } })
    expect(reply.status).toBe(409)
    expect(await privateRows(id)).toHaveLength(0)
  })

  it('stores the private data again when a save is sent again', async () => {
    const body = { rev: 1, data: { a: 1 }, private: { x: 1 } }
    await save(body)
    await server.db.delete(schema.privateData)
    expect((await save(body)).status).toBe(200)
    expect((await privateRows(id))[0]!.data).toEqual({ x: 1 })
  })

  it('notes an oversize report on the row and leaves the record', async () => {
    await save({ rev: 1, data: { a: 1 } })
    const reply = await save({ oversize: true, dataBytes: 5_000_000 })
    expect(reply.body).toEqual({ success: true })
    const row = await participant(id)
    expect(row).toMatchObject({ oversize: true, data: { a: 1 }, rev: 1 })
    expect(row!.lastError).toContain('5000000 bytes')
    // The next save that arrives clears it
    await save({ rev: 2, data: { a: 2 } })
    expect(await participant(id)).toMatchObject({ oversize: false, lastError: null })
  })

  it('notes a limit report on the row and leaves the record', async () => {
    await save({ rev: 1, data: { a: 1 } })
    const reply = await save({ limit: true, sends: 10000 })
    expect(reply.body).toEqual({ success: true })
    const row = await participant(id)
    expect(row).toMatchObject({ oversize: false, data: { a: 1 }, rev: 1 })
    expect(row!.lastError).toContain('(10000)')
  })

  it('answers a marked 404 to a save or a report for a row that is gone', async () => {
    const b = browserFor('gone')
    for (const body of [{ rev: 1, data: {} }, { data: {} }, { oversize: true, dataBytes: 1 }, { limit: true, sends: 1 }]) {
      const reply = await b.patch('/api/participants/gone', body)
      expect(reply.status).toBe(404)
      expect(reply.body.data).toEqual({ smile: 'no-participant' })
    }
  })

  const refused: [string, unknown, number][] = [
    ['no body', undefined, 400],
    ['invalid JSON', '{"rev": 1, "data": {', 400],
    ['a body that is an array', '[]', 400],
    ['no data', { rev: 1 }, 400],
    ['data that is an array', { rev: 1, data: [] }, 400],
    ['a rev that is a string', { rev: '2', data: {} }, 400],
    ['a rev of zero', { rev: 0, data: {} }, 400],
    ['resume that is a string', { rev: 1, data: {}, resume: 'x' }, 400],
    ['private that is an array', { rev: 1, data: {}, private: [] }, 400],
    ['gzip bytes that are cut short', gzipped({ rev: 1, data: { a: 'x'.repeat(2000) } }).slice(0, 30), 400],
  ]
  for (const [name, body, status] of refused) {
    it(`refuses ${name} with a marked ${status} and leaves the row`, async () => {
      const reply = await save(body)
      expect(reply.status).toBe(status)
      expect(reply.body.data).toEqual({ smile: 'refused' })
      expect(await participant(id)).toMatchObject({ data: { seed: 1 }, rev: 0, saveCount: 0 })
    })
  }

  it('refuses a body over the wire limit with a marked 413', async () => {
    const reply = await save(JSON.stringify({ rev: 1, data: { big: 'x'.repeat(MAX_BODY_BYTES) } }))
    expect(reply.status).toBe(413)
    expect(reply.body.data).toEqual({ smile: 'refused' })
    expect((await participant(id))!.rev).toBe(0)
  })

  it('refuses a body whose declared length is over the limit before reading it', async () => {
    const reply = await save({ rev: 1, data: {} }, undefined)
    expect(reply.status).toBe(200)
    const declared = await browser.request('PATCH', `/api/participants/${id}`, { rev: 2, data: {} }, { 'content-length': String(MAX_BODY_BYTES + 1) })
    expect(declared.status).toBe(413)
    expect(declared.body.data).toEqual({ smile: 'refused' })
    expect((await participant(id))!.rev).toBe(1)
  })

  it('answers 400 when the route gives no id', async () => {
    expect((await browser.patch('/api/noid/patch', { rev: 1, data: {} })).status).toBe(400)
  })
})

describe('PATCH and POST /api/participants/:id/private', () => {
  let id: string
  beforeEach(async () => {
    id = await create()
  })

  it('PATCH creates the row, then merges the parts sent into it', async () => {
    expect((await browser.patch(`/api/participants/${id}/private`, { data: { a: 1, b: 1 } })).body).toEqual({ success: true })
    expect((await browser.patch(`/api/participants/${id}/private`, { data: { b: 2, c: 3 } })).body).toEqual({ success: true })
    const rows = await privateRows(id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.data).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('PATCH refuses a body without a data object', async () => {
    for (const [body, message] of [[{}, 'Missing "data"'], [{ data: [1] }, '"data" must be a JSON object'], [{ data: null }, '"data" must be a JSON object']] as const) {
      const reply = await browser.patch(`/api/participants/${id}/private`, body)
      expect(reply.status).toBe(400)
      expect(reply.body.statusMessage).toBe(message)
    }
    const bad = await browser.patch(`/api/participants/${id}/private`, 'not json')
    expect(bad.status).toBe(400)
    expect(bad.body.data).toEqual({ smile: 'refused' })
    expect(await privateRows(id)).toHaveLength(0)
  })

  it('POST creates the row and answers with its id; a second POST updates the same row', async () => {
    const first = await browser.post(`/api/participants/${id}/private`, { data: { a: 1 } })
    expect(first.status).toBe(200)
    const second = await browser.post(`/api/participants/${id}/private`, { data: { b: 2 } })
    expect(second.body).toEqual({ id: first.body.id })
    const rows = await privateRows(id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: first.body.id, data: { a: 1, b: 2 } })
  })

  it('POST refuses a body that is not JSON', async () => {
    const reply = await browser.post(`/api/participants/${id}/private`, '{')
    expect(reply.status).toBe(400)
    expect(reply.body.data).toEqual({ smile: 'refused' })
  })

  it('both answer a marked 404 when the participant is gone', async () => {
    const b = browserFor('gone')
    for (const method of ['PATCH', 'POST']) {
      const reply = await b.request(method, '/api/participants/gone/private', { data: { a: 1 } })
      expect(reply.status).toBe(404)
      expect(reply.body.data).toEqual({ smile: 'no-participant' })
    }
  })

  it('both answer 400 when the route gives no id', async () => {
    expect((await browser.patch('/api/noid/private-patch', { data: {} })).status).toBe(400)
    expect((await browser.post('/api/noid/private-post', { data: {} })).status).toBe(400)
  })

  it('the private data is never sent back to the browser', async () => {
    await browser.patch(`/api/participants/${id}/private`, { data: { secret: 'ip' } })
    const reply = await browser.get(`/api/participants/${id}`)
    expect(JSON.stringify(reply.body)).not.toContain('secret')
    expect((await browser.get(`/api/participants/${id}/private`)).status).toBe(404)
  })
})

describe('the participant token (middleware/participant-auth.ts)', () => {
  let id: string
  beforeEach(async () => {
    id = await create()
  })

  const paths = (pid: string): [string, string, unknown][] => [
    ['GET', `/api/participants/${pid}`, undefined],
    ['PATCH', `/api/participants/${pid}`, { rev: 9, data: { stolen: true } }],
    ['PATCH', `/api/participants/${pid}/private`, { data: { stolen: true } }],
    ['POST', `/api/participants/${pid}/private`, { data: { stolen: true } }],
  ]

  it('refuses every participant route without a cookie, with a marked 403', async () => {
    const stranger = server.browser()
    for (const [method, path, body] of paths(id)) {
      const reply = await stranger.request(method, path, body)
      expect(reply.status).toBe(403)
      expect(reply.body.data).toEqual({ smile: 'bad-token' })
    }
    expect(await participant(id)).toMatchObject({ data: { seed: 1 }, rev: 0 })
    expect(await privateRows(id)).toHaveLength(0)
  })

  it('refuses another participant\'s cookie, and clears it', async () => {
    const other = server.browser()
    await create(other)
    for (const [method, path, body] of paths(id)) {
      const b = server.browser()
      b.cookies.set(PARTICIPANT_COOKIE, other.cookies.get(PARTICIPANT_COOKIE)!)
      const reply = await b.request(method, path, body)
      expect(reply.status).toBe(403)
      expect(b.cookies.has(PARTICIPANT_COOKIE)).toBe(false)
    }
    expect(await participant(id)).toMatchObject({ data: { seed: 1 }, rev: 0 })
  })

  const badTokens: [string, (_good: string) => string][] = [
    ['a changed signature', t => t.slice(0, -1) + (t.endsWith('0') ? '1' : '0')],
    ['a signature of the wrong length', t => t.slice(0, -4)],
    ['a changed issue time', t => t.replace(/\.(\d+)\./, (_, n) => `.${Number(n) - 10}.`)],
    ['an issue time that is not a number', t => t.replace(/\.(\d+)\./, '.soon.')],
    ['two parts', t => t.split('.').slice(0, 2).join('.')],
    ['four parts', t => `${t}.extra`],
    ['a token signed with another secret', t => signParticipantToken(t.split('.')[0]!, 'another secret')],
    ['a token issued 31 days ago', t => signParticipantToken(t.split('.')[0]!, BUILTIN_SECRET, Math.floor(Date.now() / 1000) - 31 * 86400)],
    ['a token issued 10 minutes in the future', t => signParticipantToken(t.split('.')[0]!, BUILTIN_SECRET, Math.floor(Date.now() / 1000) + 600)],
    ['an empty token', () => ''],
  ]
  for (const [name, change] of badTokens) {
    it(`refuses ${name}`, async () => {
      const b = server.browser()
      const token = change(browser.cookies.get(PARTICIPANT_COOKIE)!)
      const reply = await b.get(`/api/participants/${id}`, { cookie: `${PARTICIPANT_COOKIE}=${token}` })
      expect(reply.status).toBe(403)
      expect(reply.body.data).toEqual({ smile: 'bad-token' })
    })
  }

  it('accepts a token issued a few minutes in the future (clocks differ between servers)', async () => {
    const b = browserFor(id, Math.floor(Date.now() / 1000) + 120)
    expect((await b.get(`/api/participants/${id}`)).status).toBe(200)
  })

  it('does not issue a fresh token again', async () => {
    await browser.get(`/api/participants/${id}`)
    expect(browser.lastSetCookies).toHaveLength(0)
  })

  it('issues the token again when it is more than a day old', async () => {
    const old = signParticipantToken(id, BUILTIN_SECRET, Math.floor(Date.now() / 1000) - 2 * 86400)
    const b = server.browser()
    b.cookies.set(PARTICIPANT_COOKIE, old)
    const reply = await b.patch(`/api/participants/${id}`, { rev: 1, data: { a: 1 } })
    expect(reply.status).toBe(200)
    expect(b.lastSetCookies).toHaveLength(1)
    const renewed = b.cookies.get(PARTICIPANT_COOKIE)!
    expect(renewed).not.toBe(old)
    const issuedAt = Number(renewed.split('.')[1])
    expect(Math.abs(issuedAt - Date.now() / 1000)).toBeLessThan(5)
    expect(b.lastSetCookies[0]).toContain('Max-Age=2592000')
    // And the new one works
    expect((await b.get(`/api/participants/${id}`)).status).toBe(200)
  })

  it('signs with SMILE_AUTH_SECRET when it is set: a token made with the built-in key is refused', async () => {
    vi.stubEnv('SMILE_AUTH_SECRET', 'a real secret')
    expect((await browser.get(`/api/participants/${id}`)).status).toBe(403)
    const b = server.browser()
    b.cookies.set(PARTICIPANT_COOKIE, signParticipantToken(id, 'a real secret'))
    expect((await b.get(`/api/participants/${id}`)).status).toBe(200)
  })

  it('does not ask for a token to create a participant', async () => {
    expect((await server.browser().post('/api/participants', { data: {} })).status).toBe(200)
  })

  it('lets a signed-in developer read any participant', async () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'letmein')
    vi.stubEnv('SMILE_AUTH_SECRET', BUILTIN_SECRET) // keep signing as before the password was set
    const dev = server.browser()
    expect((await dev.get(`/api/participants/${id}`)).status).toBe(403)
    expect((await dev.post('/api/auth/login', { password: 'letmein' })).status).toBe(200)
    const reply = await dev.get(`/api/participants/${id}`)
    expect(reply.status).toBe(200)
    expect(reply.body.data).toEqual({ seed: 1 })
  })

  it('does not let a presentation session read a participant', async () => {
    vi.stubEnv('SMILE_PRESENTATION_PASSWORD', 'slides')
    const viewer = server.browser()
    expect((await viewer.post('/api/auth/login', { password: 'slides', scope: 'presentation' })).status).toBe(200)
    expect((await viewer.get(`/api/participants/${id}`)).status).toBe(403)
  })
})
