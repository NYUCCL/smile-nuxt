import { test, expect } from '@playwright/test'
import { createClient } from '@libsql/client'
import { clearState } from './helpers'

function getDB() {
  return createClient({ url: 'file:.data/experiment.db' })
}

async function getLatestParticipant(db: ReturnType<typeof createClient>) {
  const result = await db.execute('SELECT * FROM participants ORDER BY created_at DESC LIMIT 1')
  if (result.rows.length === 0) return null
  return {
    id: result.rows[0].id as string,
    data: JSON.parse(result.rows[0].data as string),
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

  test.beforeAll(() => {
    db = getDB()
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
    const authedContext = await playwright.request.newContext({ baseURL: 'http://localhost:3000' })
    const createRes = await authedContext.post('/api/participants', {
      data: { data: { test: true } },
    })
    const { id } = await createRes.json()
    createdIds.push(id)

    // Try to GET with a fresh context (no cookies)
    const anonContext = await playwright.request.newContext({ baseURL: 'http://localhost:3000' })
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
    const authedContext = await playwright.request.newContext({ baseURL: 'http://localhost:3000' })
    const createRes = await authedContext.post('/api/participants', {
      data: { data: { test: true } },
    })
    const { id } = await createRes.json()
    createdIds.push(id)

    const anonContext = await playwright.request.newContext({ baseURL: 'http://localhost:3000' })
    const res = await anonContext.patch(`/api/participants/${id}`, {
      data: { data: { modified: true } },
    })
    expect(res.status()).toBe(403)
    await authedContext.dispose()
    await anonContext.dispose()
  })

  test('POST /api/participants/:id/private returns 403 without cookie', async ({ playwright }) => {
    const authedContext = await playwright.request.newContext({ baseURL: 'http://localhost:3000' })
    const createRes = await authedContext.post('/api/participants', {
      data: { data: { test: true } },
    })
    const { id } = await createRes.json()
    createdIds.push(id)

    const anonContext = await playwright.request.newContext({ baseURL: 'http://localhost:3000' })
    const res = await anonContext.post(`/api/participants/${id}/private`, {
      data: { data: { secret: 'value' } },
    })
    expect(res.status()).toBe(403)
    await authedContext.dispose()
    await anonContext.dispose()
  })

  test('PATCH /api/participants/:id/private returns 403 without cookie', async ({ playwright }) => {
    // Create participant and private data with valid cookie
    const authedContext = await playwright.request.newContext({ baseURL: 'http://localhost:3000' })
    const createRes = await authedContext.post('/api/participants', {
      data: { data: { test: true } },
    })
    const { id } = await createRes.json()
    createdIds.push(id)
    await authedContext.post(`/api/participants/${id}/private`, {
      data: { data: { secret: 'value' } },
    })

    // Try to PATCH without cookie
    const anonContext = await playwright.request.newContext({ baseURL: 'http://localhost:3000' })
    const res = await anonContext.patch(`/api/participants/${id}/private`, {
      data: { data: { secret: 'hacked' } },
    })
    expect(res.status()).toBe(403)
    await authedContext.dispose()
    await anonContext.dispose()
  })

  test('cannot access another participant with wrong cookie', async ({ playwright }) => {
    // Create participant A
    const contextA = await playwright.request.newContext({ baseURL: 'http://localhost:3000' })
    const resA = await contextA.post('/api/participants', {
      data: { data: { user: 'A' } },
    })
    const { id: idA } = await resA.json()
    createdIds.push(idA)

    // Create participant B in a new context
    const contextB = await playwright.request.newContext({ baseURL: 'http://localhost:3000' })
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
    const authedContext = await playwright.request.newContext({ baseURL: 'http://localhost:3000' })
    const createRes = await authedContext.post('/api/participants', {
      data: { data: { test: true } },
    })
    const { id } = await createRes.json()
    createdIds.push(id)

    // Try with a forged cookie (just the UUID, no HMAC signature)
    const forgedContext = await playwright.request.newContext({
      baseURL: 'http://localhost:3000',
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
  const readyButton = page => page.getByRole('button', { name: /I'm ready/i })
  let db: ReturnType<typeof createClient>
  const createdIds: string[] = []

  test.beforeAll(() => {
    db = getDB()
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

  test('invalid participant cookie resets user to welcome', async ({ page }) => {
    // Consent to create a participant
    await readyButton(page).click()
    await page.getByRole('switch').click()
    await page.getByRole('button', { name: /Let's start/i }).click()
    await expect(page).toHaveURL(/\/demograph/)
    await page.waitForTimeout(1000)

    const participant = await getLatestParticipant(db)
    expect(participant).not.toBeNull()
    createdIds.push(participant!.id)

    // Tamper with the participant cookie (keep participantId cookie so store thinks user is known)
    await page.context().addCookies([{
      name: 'smile_participant',
      value: 'fake-uuid.fake-signature',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
    }])

    // Reload — the store will try to loadData() which should get 403 and reset
    await page.reload()
    await page.waitForTimeout(2000)

    // Should be redirected to welcome (resetOrphanedUser)
    await expect(page).toHaveURL(/\/welcome/)
  })

  test('cleared participant cookie resets user to welcome', async ({ page }) => {
    // Consent to create a participant
    await readyButton(page).click()
    await page.getByRole('switch').click()
    await page.getByRole('button', { name: /Let's start/i }).click()
    await expect(page).toHaveURL(/\/demograph/)
    await page.waitForTimeout(1000)

    const participant = await getLatestParticipant(db)
    expect(participant).not.toBeNull()
    createdIds.push(participant!.id)

    // Delete only the participant auth cookie (keep participantId so store tries to load)
    const cookies = await page.context().cookies()
    const nonParticipantCookies = cookies.filter(c => c.name !== 'smile_participant')
    await page.context().clearCookies()
    for (const cookie of nonParticipantCookies) {
      await page.context().addCookies([cookie])
    }

    // Reload — loadData should 403 and reset
    await page.reload()
    await page.waitForTimeout(2000)

    await expect(page).toHaveURL(/\/welcome/)
  })
})
