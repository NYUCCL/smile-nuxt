import { test, expect, type Page } from '@playwright/test'
import type { createClient } from '@libsql/client'
import { openTestDB, TEST_DB_IS_LOCAL } from './db-client'
import { clearState } from './helpers'

function getDB() {
  return openTestDB()
}

async function getLatestParticipant(db: ReturnType<typeof createClient>) {
  const result = await db.execute('SELECT * FROM participants ORDER BY created_at DESC LIMIT 1')
  if (result.rows.length === 0) return null
  return {
    id: result.rows[0]!.id as string,
    data: JSON.parse(result.rows[0]!.data as string),
  }
}

async function cleanupParticipants(db: ReturnType<typeof createClient>, ids: string[]) {
  for (const id of ids) {
    await db.execute({ sql: 'DELETE FROM private_data WHERE participant_id = ?', args: [id] })
    await db.execute({ sql: 'DELETE FROM participants WHERE id = ?', args: [id] })
  }
}

// ---------------------------------------------------------------------------
// Server-side API auth tests (direct fetch, no browser UI)
// ---------------------------------------------------------------------------

test.describe('Participant API auth', () => {
  let db: ReturnType<typeof createClient>
  const createdIds: string[] = []

  test.beforeAll(async () => {
    db = getDB()
    if (TEST_DB_IS_LOCAL) await db.execute('PRAGMA busy_timeout = 5000')
  })

  test.afterAll(async () => {
    await cleanupParticipants(db, createdIds)
    db.close()
  })

  test('POST /api/participants sets smile_participant cookie', async ({ request }) => {
    const res = await request.post('/api/participants', {
      data: { data: { test: true } },
    })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    createdIds.push(body.id)

    // The response should set the httpOnly cookie
    const setCookieHeader = res.headers()['set-cookie']
    expect(setCookieHeader).toBeDefined()
    expect(setCookieHeader).toContain('smile_participant=')
    expect(setCookieHeader!.toLowerCase()).toContain('httponly')
  })

  test('GET /api/participants/:id returns 403 without cookie', async ({ playwright }) => {
    // Create a participant first
    const authedContext = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL })
    const createRes = await authedContext.post('/api/participants', {
      data: { data: { test: true } },
    })
    const { id } = await createRes.json()
    createdIds.push(id)

    // Try to GET with a fresh context (no cookies)
    const anonContext = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL })
    const res = await anonContext.get(`/api/participants/${id}`)
    expect(res.status()).toBe(403)
    await authedContext.dispose()
    await anonContext.dispose()
  })

  test('GET /api/participants/:id succeeds with valid cookie', async ({ request }) => {
    // Create a participant (this sets the cookie on the request context)
    const createRes = await request.post('/api/participants', {
      data: { data: { test: true } },
    })
    const { id } = await createRes.json()
    createdIds.push(id)

    // Same context has the cookie — should succeed
    const res = await request.get(`/api/participants/${id}`)
    expect(res.ok()).toBe(true)
  })

  test('PATCH /api/participants/:id returns 403 without cookie', async ({ playwright }) => {
    const authedContext = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL })
    const createRes = await authedContext.post('/api/participants', {
      data: { data: { test: true } },
    })
    const { id } = await createRes.json()
    createdIds.push(id)

    const anonContext = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL })
    const res = await anonContext.patch(`/api/participants/${id}`, {
      data: { data: { modified: true } },
    })
    expect(res.status()).toBe(403)
    await authedContext.dispose()
    await anonContext.dispose()
  })

  test('POST /api/participants/:id/private returns 403 without cookie', async ({ playwright }) => {
    const authedContext = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL })
    const createRes = await authedContext.post('/api/participants', {
      data: { data: { test: true } },
    })
    const { id } = await createRes.json()
    createdIds.push(id)

    const anonContext = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL })
    const res = await anonContext.post(`/api/participants/${id}/private`, {
      data: { data: { secret: 'value' } },
    })
    expect(res.status()).toBe(403)
    await authedContext.dispose()
    await anonContext.dispose()
  })

  test('PATCH /api/participants/:id/private returns 403 without cookie', async ({ playwright }) => {
    // Create participant and private data with valid cookie
    const authedContext = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL })
    const createRes = await authedContext.post('/api/participants', {
      data: { data: { test: true } },
    })
    const { id } = await createRes.json()
    createdIds.push(id)
    await authedContext.post(`/api/participants/${id}/private`, {
      data: { data: { secret: 'value' } },
    })

    // Try to PATCH without cookie
    const anonContext = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL })
    const res = await anonContext.patch(`/api/participants/${id}/private`, {
      data: { data: { secret: 'hacked' } },
    })
    expect(res.status()).toBe(403)
    await authedContext.dispose()
    await anonContext.dispose()
  })

  test('cannot access another participant with wrong cookie', async ({ playwright }) => {
    // Create participant A
    const contextA = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL })
    const resA = await contextA.post('/api/participants', {
      data: { data: { user: 'A' } },
    })
    const { id: idA } = await resA.json()
    createdIds.push(idA)

    // Create participant B in a new context
    const contextB = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL })
    const resB = await contextB.post('/api/participants', {
      data: { data: { user: 'B' } },
    })
    const { id: idB } = await resB.json()
    createdIds.push(idB)

    // Context B tries to access participant A's data — should be 403
    const crossRes = await contextB.get(`/api/participants/${idA}`)
    expect(crossRes.status()).toBe(403)

    await contextA.dispose()
    await contextB.dispose()
  })

  test('forged cookie with raw UUID is rejected', async ({ playwright }) => {
    const authedContext = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL })
    const createRes = await authedContext.post('/api/participants', {
      data: { data: { test: true } },
    })
    const { id } = await createRes.json()
    createdIds.push(id)

    // Try with a forged cookie (just the UUID, no HMAC signature)
    const forgedContext = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
      extraHTTPHeaders: {
        Cookie: `smile_participant=${id}`,
      },
    })
    const res = await forgedContext.get(`/api/participants/${id}`)
    expect(res.status()).toBe(403)
    await authedContext.dispose()
    await forgedContext.dispose()
  })
})

// ---------------------------------------------------------------------------
// Browser-level auth tests (UI flow)
// ---------------------------------------------------------------------------

test.describe('Participant auth in experiment flow', () => {
  const readyButton = (page: Page) => page.getByRole('button', { name: /I'm ready/i })
  let db: ReturnType<typeof createClient>
  const createdIds: string[] = []

  test.beforeAll(async () => {
    db = getDB()
    if (TEST_DB_IS_LOCAL) await db.execute('PRAGMA busy_timeout = 5000')
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/welcome')
    await clearState(page)
    await page.goto('/welcome')
    await expect(readyButton(page)).toBeVisible({ timeout: 10_000 })
  })

  test.afterAll(async () => {
    await cleanupParticipants(db, createdIds)
    db.close()
  })

  test('consent sets httpOnly participant cookie', async ({ page }) => {
    await readyButton(page).click()
    await page.getByRole('switch').click()
    await page.getByRole('button', { name: /Let's start/i }).click()
    await expect(page).toHaveURL(/\/demograph/)
    await page.waitForTimeout(1000)

    const participant = await getLatestParticipant(db)
    expect(participant).not.toBeNull()
    createdIds.push(participant!.id)

    // Check the httpOnly cookie exists
    const cookies = await page.context().cookies()
    const authCookie = cookies.find(c => c.name === 'smile_participant')
    expect(authCookie).toBeTruthy()
    expect(authCookie!.httpOnly).toBe(true)
    // Cookie value should be uuid.timestamp.signature format
    const parts = authCookie!.value.split('.')
    expect(parts.length).toBe(3)
    expect(parts[0]).toBe(participant!.id)
  })

  /** Rows whose record names `previous` as the row it went on from. */
  async function rowsContinuing(previous: string) {
    const result = await db.execute('SELECT id, data FROM participants ORDER BY created_at DESC, rowid DESC LIMIT 10')
    return result.rows
      .map(r => ({ id: r.id as string, data: JSON.parse(r.data as string) }))
      .filter(r => Array.isArray(r.data.previousParticipantIds) && r.data.previousParticipantIds.includes(previous))
  }

  /**
   * The server refuses the browser's token for its row (here: tampered with,
   * or gone). The browser still has the participant's record, so nothing is
   * thrown away: the participant stays where they were and the record is
   * saved as a new row that names the old one.
   */
  for (const [name, breakToken] of [
    ['an invalid participant cookie', async (page: Page) => {
      await page.context().addCookies([{ name: 'smile_participant', value: 'fake-uuid.fake-signature', domain: 'localhost', path: '/', httpOnly: true }])
    }],
    ['a cleared participant cookie', async (page: Page) => {
      const cookies = await page.context().cookies()
      await page.context().clearCookies()
      await page.context().addCookies(cookies.filter(c => c.name !== 'smile_participant'))
    }],
  ] as const) {
    test(`${name}: the participant goes on, saved as a new row`, async ({ page }) => {
      await readyButton(page).click()
      await page.getByRole('switch').click()
      await page.getByRole('button', { name: /Let's start/i }).click()
      await expect(page).toHaveURL(/\/demograph/)
      await page.waitForTimeout(1500)

      const participant = await getLatestParticipant(db)
      expect(participant).not.toBeNull()
      createdIds.push(participant!.id)

      await breakToken(page)
      await page.reload()

      // Still on the same page, not sent back to the start
      await expect(page).toHaveURL(/\/demograph/)
      await expect.poll(async () => (await rowsContinuing(participant!.id)).length, { timeout: 10_000 }).toBe(1)
      const [next] = await rowsContinuing(participant!.id)
      createdIds.push(next!.id)
      expect(next!.id).not.toBe(participant!.id)
      expect(next!.data.consented).toBe(true)
      // The browser has a working token again, for the new row
      const token = (await page.context().cookies()).find(c => c.name === 'smile_participant')
      expect(token!.value.split('.')[0]).toBe(next!.id)
    })
  }
})
