import { test, expect, type Page } from '@playwright/test'
import { cleanupParticipant, consent, getDB, getParticipant, type DB } from './db-helpers'

/**
 * The save endpoints over HTTP (plans/sync_engine.md, step 2): the order of
 * saves by `rev`, what a refused save answers, and private data kept to one
 * row. test/server/participant-save.test.ts covers the same rules in detail
 * without a server.
 */

test.describe('Save endpoints', () => {
  let db: DB
  let id: string | null = null

  test.beforeAll(async () => {
    db = await getDB()
  })
  test.afterEach(async () => {
    if (id) await cleanupParticipant(db, id)
    id = null
  })
  test.afterAll(() => db.close())

  const patch = (page: Page, path: string, body: unknown) => page.request.patch(path, {
    data: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    failOnStatusCode: false,
  })
  const post = (page: Page, path: string, body: unknown) => page.request.post(path, {
    data: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    failOnStatusCode: false,
  })
  const column = async (sql: string) => (await db.execute({ sql, args: [id!] })).rows

  test('saves are ordered by rev: newer stored, older and conflicting refused with 409', async ({ page }) => {
    id = await consent(page, db)
    const url = `/api/participants/${id}`
    const start = (await (await page.request.get(url)).json()).rev as number

    const newer = await patch(page, url, { data: { step: 'a' }, resume: { view: 'stroop' }, rev: start + 10 })
    expect(newer.status()).toBe(200)
    expect(await newer.json()).toEqual({ success: true, rev: start + 10 })
    expect(await (await page.request.get(url)).json()).toEqual({ data: { step: 'a' }, rev: start + 10, resume: { view: 'stroop' } })

    // The same save again (its response was lost): accepted
    const resend = await patch(page, url, { data: { step: 'a' }, resume: { view: 'stroop' }, rev: start + 10 })
    expect(resend.status()).toBe(200)

    // An older save, and a different save with the same rev: refused, row unchanged
    for (const body of [{ data: { step: 'old' }, rev: start + 3 }, { data: { step: 'other tab' }, rev: start + 10 }]) {
      const res = await patch(page, url, body)
      expect(res.status()).toBe(409)
      expect((await res.json()).data).toEqual({ rev: start + 10 })
    }
    expect(await getParticipant(db, id)).toEqual({ step: 'a' })

    // A save with no rev (a page still running older code) can't be compared
    // with what this page has saved: refused, row unchanged
    const old = await patch(page, url, { data: { step: 'b' } })
    expect(old.status()).toBe(409)
    expect((await old.json()).data).toEqual({ rev: start + 10 })
    expect(await getParticipant(db, id)).toEqual({ step: 'a' })
  })

  test('a save with no rev is stored as the next rev while only older code has saved the row', async ({ page }) => {
    // A row made by the create request alone, as the older code left it: no position saved
    const created = await (await post(page, '/api/participants', { data: { step: 'created' } })).json()
    id = created.id
    const url = `/api/participants/${id}`
    expect(await (await patch(page, url, { data: { step: 'b' } })).json()).toEqual({ success: true, rev: 1 })
    expect(await (await patch(page, url, { data: { step: 'c' } })).json()).toEqual({ success: true, rev: 2 })
    expect(await getParticipant(db, id!)).toEqual({ step: 'c' })
  })

  test('each save updates the status columns', async ({ page }) => {
    id = await consent(page, db)
    const data = { consented: true, done: true, withdrawn: false, recruitmentService: 'prolific', starttime: 1700000000000, endtime: 1700000360000 }
    const start = (await (await page.request.get(`/api/participants/${id}`)).json()).rev as number
    expect((await patch(page, `/api/participants/${id}`, { data, rev: start + 10 })).status()).toBe(200)
    const row = (await column('SELECT consented, done, withdrawn, recruitment_service, started_at, ended_at, data_bytes FROM participants WHERE id = ?'))[0]!
    expect({ ...row }).toEqual({
      consented: 1, done: 1, withdrawn: 0, recruitment_service: 'prolific',
      started_at: 1700000000000, ended_at: 1700000360000, data_bytes: JSON.stringify(data).length,
    })
  })

  test('bad rev and resume values are refused with 400', async ({ page }) => {
    id = await consent(page, db)
    const before = await getParticipant(db, id)
    for (const body of [
      { data: {}, rev: 0 }, { data: {}, rev: -2 }, { data: {}, rev: 1.5 }, { data: {}, rev: '4' },
      { data: {}, resume: 'x' }, { data: {}, resume: [1] },
    ]) {
      const res = await patch(page, `/api/participants/${id}`, body)
      expect(res.status(), JSON.stringify(body)).toBe(400)
    }
    expect(await getParticipant(db, id)).toEqual(before)
  })

  test('private data: one row per participant, bad bodies refused', async ({ page }) => {
    id = await consent(page, db)
    const url = `/api/participants/${id}/private`
    const first = await (await post(page, url, { data: { workerId: 'W1' } })).json()
    const second = await (await post(page, url, { data: { workerId: 'W1' } })).json()
    expect(second.id).toBe(first.id)
    expect(await column('SELECT id FROM private_data WHERE participant_id = ?')).toHaveLength(1)

    for (const body of ['{"data": {"a": 1', '{}', '{"data": null}', '{"data": "text"}', '{"data": [1]}', '[1]']) {
      const res = await patch(page, url, body)
      expect(res.status(), body).toBe(400)
    }
    for (const body of ['{"data": {"a": 1', '{"data": "text"}', '{"data": [1]}', '[1]']) {
      const res = await post(page, url, body)
      expect(res.status(), body).toBe(400)
    }
    const rows = await column('SELECT data FROM private_data WHERE participant_id = ?')
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0]!.data as string)).toEqual({ workerId: 'W1' })

    expect((await patch(page, url, { data: { workerId: 'W2' } })).status()).toBe(200)
    expect(JSON.parse((await column('SELECT data FROM private_data WHERE participant_id = ?'))[0]!.data as string)).toEqual({ workerId: 'W2' })
  })

  test('a save can carry the private data that changed; it is merged into the participant\'s one row', async ({ page }) => {
    id = await consent(page, db)
    const url = `/api/participants/${id}`
    const start = (await (await page.request.get(url)).json()).rev as number
    const priv = async () => JSON.parse((await column('SELECT data FROM private_data WHERE participant_id = ?'))[0]!.data as string)

    expect((await patch(page, url, { data: { step: 'a' }, resume: { view: 'x' }, rev: start + 10, private: { recruitmentInfo: { id: 'P1' } } })).status()).toBe(200)
    expect(await priv()).toMatchObject({ recruitmentInfo: { id: 'P1' } })
    expect((await patch(page, url, { data: { step: 'b' }, resume: { view: 'x' }, rev: start + 11, private: { withdrawData: { reason: 'r' } } })).status()).toBe(200)
    expect(await priv()).toMatchObject({ recruitmentInfo: { id: 'P1' }, withdrawData: { reason: 'r' } })
    expect(await column('SELECT id FROM private_data WHERE participant_id = ?')).toHaveLength(1)

    // Not an object: the whole save is refused and nothing is stored
    const bad = await patch(page, url, { data: { step: 'c' }, resume: { view: 'x' }, rev: start + 12, private: 'text' })
    expect(bad.status()).toBe(400)
    expect(await getParticipant(db, id)).toEqual({ step: 'b' })
  })

  test('creating a participant with a bad body is refused and makes no row', async ({ page }) => {
    await page.goto('/welcome')
    const count = async () => Number((await db.execute('SELECT count(*) AS n FROM participants')).rows[0]!.n)
    const before = await count()
    for (const body of ['{"data": {"a": 1', '{"data": "text"}', '{"data": [1, 2]}', '[1]', '"x"']) {
      const res = await post(page, '/api/participants', body)
      expect(res.status(), body).toBe(400)
    }
    expect(await count()).toBe(before)
  })
})
