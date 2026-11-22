// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { eq } from 'drizzle-orm'
import { seededDatabase, schema } from './db-helpers'
import {
  MAX_TEXT_BYTES, parseSaveBody, parseDataBody, parseJsonObject, statusFromData,
  saveParticipant, savePrivateData, deleteParticipant, parseOversizeReport, markOversize, parseLimitReport, markSendLimit,
} from '../../src/runtime/server/utils/participant-save'
import { toPlainJSON } from '../../src/runtime/utils/plainJSON.js'
import { BAD_VALUES } from '../fixtures/bad-values.js'

/**
 * The server side of saving (plans/sync_engine.md, "The server"): a body the
 * server can't use gets a 4xx that says why and never an exception, and the
 * stored row is left as it was.
 */

let t: Awaited<ReturnType<typeof seededDatabase>>
beforeEach(async () => {
  t = await seededDatabase()
})
afterEach(() => t.close())

const row = (id = 'p1') => t.db.select().from(schema.participants).where(eq(schema.participants.id, id)).get()
const body = (v: unknown) => JSON.stringify(v)

describe('parseSaveBody', () => {
  const refused: [string, string | undefined, number][] = [
    ['no body', undefined, 400],
    ['an empty body', '', 400],
    ['invalid JSON', '{"data": {"a": 1', 400],
    ['a bare word', 'hello', 400],
    ['body is an array', '[1, 2]', 400],
    ['body is a string', '"text"', 400],
    ['body is null', 'null', 400],
    ['body is a number', '5', 400],
    ['no data field', '{}', 400],
    ['data is null', '{"data": null}', 400],
    ['data is a string', '{"data": "text"}', 400],
    ['data is an array', '{"data": [1, 2]}', 400],
    ['data is a number', '{"data": 5}', 400],
    ['data is true', '{"data": true}', 400],
    ['resume is a string', '{"data": {}, "resume": "x"}', 400],
    ['resume is an array', '{"data": {}, "resume": []}', 400],
    ['rev is zero', '{"data": {}, "rev": 0}', 400],
    ['rev is negative', '{"data": {}, "rev": -1}', 400],
    ['rev is a fraction', '{"data": {}, "rev": 1.5}', 400],
    ['rev is a string', '{"data": {}, "rev": "3"}', 400],
    ['rev is too large to be exact', '{"data": {}, "rev": 1e300}', 400],
    ['rev is an object', '{"data": {}, "rev": {}}', 400],
    ['a body over the limit', body({ data: { big: 'x'.repeat(MAX_TEXT_BYTES) } }), 413],
  ]
  for (const [name, raw, status] of refused) {
    it(`refuses ${name} with ${status} and a message`, () => {
      const r = parseSaveBody(raw)
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.status).toBe(status)
        expect(r.message.length).toBeGreaterThan(5)
      }
    })
  }

  it('accepts data alone (a client older than the sync engine)', () => {
    expect(parseSaveBody('{"data": {"a": 1}}')).toEqual({ ok: true, save: { data: { a: 1 } } })
  })

  it('accepts data, resume and rev; a null resume or rev counts as not sent', () => {
    expect(parseSaveBody(body({ data: { a: 1 }, resume: { view: 'x' }, rev: 3 })))
      .toEqual({ ok: true, save: { data: { a: 1 }, resume: { view: 'x' }, rev: 3 } })
    expect(parseSaveBody(body({ data: {}, resume: null, rev: null }))).toEqual({ ok: true, save: { data: {} } })
  })

  it('never throws, whatever the text', () => {
    fc.assert(fc.property(fc.oneof(fc.string(), fc.json(), fc.constant(undefined)), (raw) => {
      const r = parseSaveBody(raw)
      if (!r.ok) expect([400, 413]).toContain(r.status)
      else expect(typeof r.save.data).toBe('object')
    }), { numRuns: 500 })
  })

  it('never throws for any JSON body, and accepts only an object in data', () => {
    fc.assert(fc.property(fc.jsonValue(), fc.jsonValue(), fc.jsonValue(), (data, resume, rev) => {
      const r = parseSaveBody(JSON.stringify({ data, resume, rev }))
      if (r.ok) {
        expect(r.save.data !== null && typeof r.save.data === 'object' && !Array.isArray(r.save.data)).toBe(true)
        if (r.save.rev !== undefined) expect(Number.isSafeInteger(r.save.rev) && r.save.rev > 0).toBe(true)
      }
    }), { numRuns: 500 })
  })
})

describe('parseDataBody and parseJsonObject', () => {
  it('data may be absent or null (stored as {}), else must be an object', () => {
    expect(parseDataBody('{}')).toEqual({ ok: true, data: {} })
    expect(parseDataBody('{"data": null}')).toEqual({ ok: true, data: {} })
    expect(parseDataBody('{"data": {"a": 1}}')).toEqual({ ok: true, data: { a: 1 } })
    for (const raw of ['{"data": "x"}', '{"data": [1]}', '{"data": 3}', '[1]', 'nope', '', undefined]) {
      expect(parseDataBody(raw).ok, String(raw)).toBe(false)
    }
  })

  it('a key named __proto__ is data, and changes no prototype', () => {
    const r = parseJsonObject('{"data": {"__proto__": {"polluted": true}}}')
    expect(r.ok).toBe(true)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('statusFromData', () => {
  it('reads the status fields of a record', () => {
    expect(statusFromData({ consented: true, done: false, withdrawn: false, recruitmentService: 'prolific', starttime: 1700000000000, endtime: 1700000360000.7 }))
      .toEqual({ consented: true, done: false, withdrawn: false, recruitmentService: 'prolific', startedAt: 1700000000000, endedAt: 1700000360000 })
  })

  it('gives null for a missing value or one of the wrong type', () => {
    const nulls = { consented: null, done: null, withdrawn: null, recruitmentService: null, startedAt: null, endedAt: null }
    expect(statusFromData({})).toEqual(nulls)
    expect(statusFromData({ consented: 'yes', done: 1, withdrawn: null, recruitmentService: { a: 1 }, starttime: '2026', endtime: [1] })).toEqual(nulls)
    expect(statusFromData({ starttime: Infinity, endtime: 1e300 })).toEqual(nulls)
    for (const odd of [null, undefined, 5, 'x', [1, 2]]) expect(statusFromData(odd)).toEqual(nulls)
  })

  it('cuts a very long recruitment service name', () => {
    expect(statusFromData({ recruitmentService: 'x'.repeat(5000) }).recruitmentService).toHaveLength(100)
  })

  it('never throws for any JSON value', () => {
    fc.assert(fc.property(fc.jsonValue(), (v) => {
      const s = statusFromData(v)
      for (const k of ['consented', 'done', 'withdrawn'] as const) expect([true, false, null]).toContain(s[k])
    }), { numRuns: 300 })
  })
})

describe('saveParticipant', () => {
  it('a save without rev is stored as the next rev (old clients)', async () => {
    expect(await saveParticipant(t.db, 'p1', { data: { a: 1 } })).toEqual({ ok: true, rev: 1 })
    expect(await saveParticipant(t.db, 'p1', { data: { a: 2 } })).toEqual({ ok: true, rev: 2 })
    const r = await row()
    expect(r!.data).toEqual({ a: 2 })
    expect(r!.rev).toBe(2)
    expect(r!.saveCount).toBe(2)
  })

  it('a save without rev is refused once a save with a rev and a position has been stored', async () => {
    expect(await saveParticipant(t.db, 'p1', { data: { a: 1 } })).toEqual({ ok: true, rev: 1 })
    expect(await saveParticipant(t.db, 'p1', { data: { a: 2 }, resume: { view: 'stroop' }, rev: 7 })).toEqual({ ok: true, rev: 7 })
    expect(await saveParticipant(t.db, 'p1', { data: { a: 'old page' } })).toMatchObject({ ok: false, status: 409, rev: 7 })
    expect((await row())!.data).toEqual({ a: 2 })
    expect(await saveParticipant(t.db, 'nobody', { data: {} })).toMatchObject({ ok: false, status: 404 })
  })

  it('a save may carry the private data that changed; it must be an object', () => {
    expect(parseSaveBody(JSON.stringify({ data: {}, rev: 1, private: { recruitmentInfo: { id: 'a' } } })))
      .toEqual({ ok: true, save: { data: {}, rev: 1, private: { recruitmentInfo: { id: 'a' } } } })
    expect(parseSaveBody(JSON.stringify({ data: {}, rev: 1 }))).toEqual({ ok: true, save: { data: {}, rev: 1 } })
    for (const bad of ['text', 5, [1], true]) {
      expect(parseSaveBody(JSON.stringify({ data: {}, rev: 1, private: bad }))).toMatchObject({ ok: false, status: 400 })
    }
  })

  it('a save with a newer rev is stored, with resume and the status columns', async () => {
    const data = { consented: true, done: false, recruitmentService: 'prolific', starttime: 1700000000000, trials: [1, 2] }
    expect(await saveParticipant(t.db, 'p1', { data, resume: { view: 'stroop' }, rev: 5 })).toEqual({ ok: true, rev: 5 })
    const r = await row()
    expect(r!.data).toEqual(data)
    expect(r!.resume).toEqual({ view: 'stroop' })
    expect(r!.rev).toBe(5)
    expect(r!.consented).toBe(true)
    expect(r!.done).toBe(false)
    expect(r!.withdrawn).toBe(null)
    expect(r!.recruitmentService).toBe('prolific')
    expect(r!.startedAt).toBe(1700000000000)
    expect(r!.dataBytes).toBe(Buffer.byteLength(JSON.stringify(data)))
  })

  it('a save without resume leaves the stored resume alone', async () => {
    await saveParticipant(t.db, 'p1', { data: { a: 1 }, resume: { view: 'x' }, rev: 1 })
    await saveParticipant(t.db, 'p1', { data: { a: 2 }, rev: 2 })
    expect((await row())!.resume).toEqual({ view: 'x' })
  })

  it('an older rev is refused with 409 and the row is unchanged', async () => {
    await saveParticipant(t.db, 'p1', { data: { a: 'new' }, rev: 7 })
    const before = await row()
    const r = await saveParticipant(t.db, 'p1', { data: { a: 'old' }, rev: 3 })
    expect(r).toMatchObject({ ok: false, status: 409, rev: 7 })
    expect(await row()).toEqual(before)
  })

  it('an equal rev with the same content is a resend: ok, nothing written', async () => {
    const save = { data: { a: 1, list: [1, 2] }, resume: { view: 'x' }, rev: 4 }
    await saveParticipant(t.db, 'p1', save)
    const before = await row()
    expect(await saveParticipant(t.db, 'p1', structuredClone(save))).toEqual({ ok: true, rev: 4, duplicate: true })
    expect(await row()).toEqual(before)
  })

  it('an equal rev with different content is refused with 409', async () => {
    await saveParticipant(t.db, 'p1', { data: { a: 1 }, rev: 4 })
    const before = await row()
    expect(await saveParticipant(t.db, 'p1', { data: { a: 2 }, rev: 4 })).toMatchObject({ ok: false, status: 409, rev: 4 })
    expect(await saveParticipant(t.db, 'p1', { data: { a: 1 }, resume: { other: true }, rev: 4 })).toMatchObject({ ok: false, status: 409 })
    expect(await row()).toEqual(before)
  })

  it('an unknown participant is a 404, with or without rev', async () => {
    expect(await saveParticipant(t.db, 'nobody', { data: {} })).toMatchObject({ ok: false, status: 404 })
    expect(await saveParticipant(t.db, 'nobody', { data: {}, rev: 2 })).toMatchObject({ ok: false, status: 404 })
  })

  it('saves arriving together: exactly the newest wins, none is half stored', async () => {
    const other = t.open().db
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map(rev =>
      saveParticipant(rev % 2 ? t.db : other, 'p1', { data: { rev }, rev })))
    expect(results.find(r => !r.ok && r.status !== 409)).toBeUndefined()
    const r = await row()
    expect(r!.rev).toBe(6)
    expect(r!.data).toEqual({ rev: 6 })
  })

  it('odd status values are stored as null and do not fail the save', async () => {
    const data = { consented: 'maybe', done: { a: 1 }, withdrawn: [true], recruitmentService: 12, starttime: 'yesterday', endtime: null }
    expect(await saveParticipant(t.db, 'p1', { data, rev: 1 })).toEqual({ ok: true, rev: 1 })
    const r = await row()
    expect(r!.data).toEqual(data)
    expect([r!.consented, r!.done, r!.withdrawn, r!.recruitmentService, r!.startedAt, r!.endedAt]).toEqual([null, null, null, null, null, null])
  })

  describe('every cleaned corpus value is stored and read back unchanged', () => {
    // (the DOM entries need a browser; the browser tests cover them)
    for (const bad of BAD_VALUES.filter(b => !b.slow && !b.name.includes('DOM'))) {
      it(bad.name, async () => {
        const data = { value: toPlainJSON(bad.make()) ?? null, after: 'kept' }
        const parsed = parseSaveBody(JSON.stringify({ data, rev: 1 }))
        expect(parsed.ok).toBe(true)
        if (!parsed.ok) return
        expect(await saveParticipant(t.db, 'p1', parsed.save)).toEqual({ ok: true, rev: 1 })
        expect((await row())!.data).toEqual(JSON.parse(JSON.stringify(data)))
      })
    }
  })

  it('any JSON object is stored and read back unchanged', async () => {
    let rev = 0
    await fc.assert(fc.asyncProperty(fc.dictionary(fc.string(), fc.jsonValue()), async (data) => {
      const parsed = parseSaveBody(JSON.stringify({ data, rev: ++rev }))
      if (!parsed.ok) throw new Error(parsed.message)
      expect(await saveParticipant(t.db, 'p1', parsed.save)).toEqual({ ok: true, rev })
      expect((await row())!.data).toEqual(parsed.save.data)
    }), { numRuns: 100 })
  })
})

describe('private data', () => {
  const rows = () => t.db.select().from(schema.privateData).where(eq(schema.privateData.participantId, 'p1')).all()

  it('a repeated create keeps one row and returns the same id', async () => {
    const first = await savePrivateData(t.db, 'p1', { id: 'PROLIFIC1' }, 'row-a')
    const second = await savePrivateData(t.db, 'p1', { id: 'PROLIFIC1', more: true }, 'row-b')
    expect(first).toBe('row-a')
    expect(second).toBe('row-a')
    const all = await rows()
    expect(all).toHaveLength(1)
    expect(all[0]!.data).toEqual({ id: 'PROLIFIC1', more: true })
  })

  it('parts not sent are kept: a page reloaded without its local copy cannot erase them', async () => {
    await savePrivateData(t.db, 'p1', { recruitmentInfo: { prolific_id: 'abc' }, browserFingerprint: { ip: '1.2.3.4' } }, 'row-a')
    // After a reload the page knows only what happened since
    await savePrivateData(t.db, 'p1', { withdrawData: { reason: 'bored' } }, 'row-b')
    expect((await rows())[0]!.data).toEqual({
      recruitmentInfo: { prolific_id: 'abc' },
      browserFingerprint: { ip: '1.2.3.4' },
      withdrawData: { reason: 'bored' },
    })
    // A part that is sent replaces the stored one
    await savePrivateData(t.db, 'p1', { browserFingerprint: { ip: '5.6.7.8' } }, 'row-c')
    expect((await rows())[0]!.data).toMatchObject({ recruitmentInfo: { prolific_id: 'abc' }, browserFingerprint: { ip: '5.6.7.8' } })
  })

  it('an unknown participant gets no row', async () => {
    expect(await savePrivateData(t.db, 'nobody', { a: 1 }, 'row-x')).toBe(null)
    expect(await t.db.select().from(schema.privateData).all()).toHaveLength(0)
  })
})

describe('a record too large to send', () => {
  it('recognizes the client\'s report, and only that', () => {
    expect(parseOversizeReport({ oversize: true, dataBytes: 5_000_000 })).toEqual({ dataBytes: 5_000_000 })
    expect(parseOversizeReport({ oversize: true })).toEqual({ dataBytes: null })
    expect(parseOversizeReport({ oversize: true, dataBytes: 'big' })).toEqual({ dataBytes: null })
    // A save is a save, whatever else it carries
    expect(parseOversizeReport({ oversize: true, data: {} })).toBe(null)
    expect(parseOversizeReport({ oversize: 'yes' })).toBe(null)
    expect(parseOversizeReport({})).toBe(null)
  })

  it('is noted on the row without touching the record, and cleared by the next save', async () => {
    await saveParticipant(t.db, 'p1', { data: { trials: [1, 2] }, rev: 3 })
    expect(await markOversize(t.db, 'p1', 5_000_000)).toBe(true)
    let stored = await row()
    expect(stored).toMatchObject({ oversize: true, rev: 3, data: { trials: [1, 2] } })
    expect(stored!.lastError).toContain('5000000')

    await saveParticipant(t.db, 'p1', { data: { trials: [1] }, rev: 4 })
    stored = await row()
    expect(stored).toMatchObject({ oversize: false, lastError: null, rev: 4 })
  })

  it('the report that the browser reached its limit of sends is noted the same way', async () => {
    expect(parseLimitReport({ limit: true, sends: 10_000 })).toEqual({ sends: 10_000 })
    expect(parseLimitReport({ limit: true, sends: -1 })).toEqual({ sends: null })
    expect(parseLimitReport({ limit: true, data: {} })).toBe(null)
    expect(parseLimitReport({ limit: 1 })).toBe(null)

    await saveParticipant(t.db, 'p1', { data: { trials: [1, 2] }, rev: 3 })
    expect(await markSendLimit(t.db, 'p1', 10_000)).toBe(true)
    let stored = await row()
    expect(stored).toMatchObject({ rev: 3, data: { trials: [1, 2] } })
    expect(stored!.lastError).toContain('10000')
    expect(await markSendLimit(t.db, 'nobody', 1)).toBe(false)

    await saveParticipant(t.db, 'p1', { data: { trials: [1] }, rev: 4 })
    stored = await row()
    expect(stored!.lastError).toBe(null)
  })

  it('an unknown participant is not found', async () => {
    expect(await markOversize(t.db, 'nobody', 1)).toBe(false)
  })
})

describe('deleteParticipant', () => {
  it('removes the participant and every row under them, and nothing else', async () => {
    const now = new Date()
    await t.db.insert(schema.participants).values({ id: 'p2', projectId: 'proj', data: {}, createdAt: now, updatedAt: now })
    for (const id of ['p1', 'p2']) {
      await savePrivateData(t.db, id, { who: id }, `priv-${id}`)
      await t.db.insert(schema.consoleLogs).values({ projectId: 'proj', sessionId: `s-${id}`, participantId: id, seq: 0, entries: [], createdAt: now })
      await t.db.insert(schema.interactionChunks).values({ participantId: id, route: 'stroop', visit: 0, seq: 0, stream: Buffer.from([1, 2, 3]), createdAt: now })
    }
    expect(await deleteParticipant(t.db, 'p1')).toBe(true)
    for (const table of [schema.participants, schema.privateData, schema.consoleLogs, schema.interactionChunks]) {
      const left = await t.db.select().from(table).all()
      expect(left).toHaveLength(1)
    }
    expect(await row('p2')).toBeTruthy()
    expect(await deleteParticipant(t.db, 'p1')).toBe(false)
  })
})

describe('telemetry tables', () => {
  it('a console log chunk sent twice is stored once', async () => {
    const chunk = { projectId: 'proj', sessionId: 's1', participantId: null, seq: 3, entries: [{ m: 'hi' }], createdAt: new Date() }
    await t.db.insert(schema.consoleLogs).values(chunk).onConflictDoNothing()
    await t.db.insert(schema.consoleLogs).values(chunk).onConflictDoNothing()
    expect(await t.db.select().from(schema.consoleLogs).all()).toHaveLength(1)
  })

  it('an interaction chunk sent twice is stored once, and its bytes come back', async () => {
    const stream = Buffer.from([0, 255, 31, 139, 8])
    const chunk = { participantId: 'p1', route: 'stroop', visit: 1, seq: 0, stream, eventCount: 12, createdAt: new Date() }
    await t.db.insert(schema.interactionChunks).values(chunk).onConflictDoNothing()
    await t.db.insert(schema.interactionChunks).values(chunk).onConflictDoNothing()
    const all = await t.db.select().from(schema.interactionChunks).all()
    expect(all).toHaveLength(1)
    expect(Buffer.from(all[0]!.stream).equals(stream)).toBe(true)
  })
})
