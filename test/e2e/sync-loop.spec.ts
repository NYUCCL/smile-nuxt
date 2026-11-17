/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, type Page, type Route } from '@playwright/test'
import {
  N_TRIALS, answerTrials, cleanupParticipant, consent, getDB, getParticipant, openStroop, readSnapshot, savedStroopTrials, stroopTrials, type DB,
} from './db-helpers'

/**
 * Step 4 of plans/sync_engine.md: the sync loop, in the real app. Data is
 * sent by itself about a second after it changes, a failed send is tried
 * again, and `api.sync()` waits for the server's answer.
 */

function inStore<T>(page: Page, body: string): Promise<T> {
  return page.evaluate((src) => {
    const app = (document.querySelector('#__nuxt') as any).__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('smilestore')

    return new Function('store', src)(store)
  }, body)
}

async function privateRow(db: DB, id: string): Promise<any> {
  const result = await db.execute({ sql: 'SELECT data FROM private_data WHERE participant_id = ?', args: [id] })
  return result.rows[0] ? JSON.parse(result.rows[0].data as string) : null
}

async function latestId(db: DB): Promise<string | null> {
  const result = await db.execute('SELECT id FROM participants ORDER BY created_at DESC, rowid DESC LIMIT 1')
  return (result.rows[0]?.id as string) ?? null
}

const syncStatus = (page: Page) => inStore<any>(page, 'return JSON.parse(JSON.stringify(store.browserEphemeral.sync))')

test.describe('The sync loop (plans/sync_engine.md, step 4)', () => {
  let db: DB
  let participantId: string | null = null

  test.beforeAll(async () => {
    db = await getDB()
  })

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await page.context().setOffline(false)
    if (participantId) await cleanupParticipant(db, participantId)
    participantId = null
  })

  test.afterAll(() => {
    db.close()
  })

  test('a recorded trial is in the database about a second later, with nothing asked for', async ({ page }) => {
    participantId = await consent(page, db)
    await openStroop(page)
    await answerTrials(page, 1)
    const started = Date.now()
    await expect.poll(async () => stroopTrials(await getParticipant(db, participantId!)).length, { timeout: 5_000, intervals: [100] }).toBe(1)
    expect(Date.now() - started).toBeLessThan(3_000)
    await expect.poll(async () => (await syncStatus(page)).status).toBe('saved')
  })

  test('api.sync() resolves once the server has the record', async ({ page }) => {
    participantId = await consent(page, db)
    await openStroop(page)
    await answerTrials(page, 2)
    const result = await inStore<any>(page, 'return store.sync()')
    expect(result).toMatchObject({ ok: true, error: null })
    // No waiting: it is there already
    const row = await db.execute({ sql: 'SELECT rev FROM participants WHERE id = ?', args: [participantId] })
    expect(Number(row.rows[0]!.rev)).toBe(result.rev)
    expect(stroopTrials(await getParticipant(db, participantId))).toHaveLength(2)
  })

  test('api.sync() says so when the server cannot be reached, and the loop saves when it can', async ({ page }) => {
    participantId = await consent(page, db)
    await openStroop(page)
    await page.route(url => url.pathname.includes('/api/participants/'), (route: Route) => route.abort('connectionreset'))
    await answerTrials(page, 2)
    const result = await inStore<any>(page, 'return store.sync()')
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect((await syncStatus(page)).error.kind).toBe('retrying')

    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await expect.poll(async () => stroopTrials(await getParticipant(db, participantId!)).length, { timeout: 15_000 }).toBe(2)
    await expect.poll(async () => (await syncStatus(page)).status).toBe('saved')
  })

  test('saves answered 4 seconds late: every trial arrives once', async ({ page }) => {
    test.setTimeout(90_000)
    participantId = await consent(page, db)
    await openStroop(page)
    await page.route(url => url.pathname.endsWith(`/api/participants/${participantId}`), async (route: Route) => {
      if (route.request().method() !== 'PATCH') return route.continue()
      await new Promise(resolve => setTimeout(resolve, 4_000))
      await route.continue()
    })
    await answerTrials(page, N_TRIALS)
    const trials = await savedStroopTrials(db, participantId, 30_000)
    expect(new Set(trials.map(t => t.id)).size).toBe(N_TRIALS)
    expect(trials).toHaveLength(N_TRIALS)
  })

  test('the status says offline, then saved', async ({ page }) => {
    participantId = await consent(page, db)
    await openStroop(page)
    await expect.poll(async () => (await syncStatus(page)).status).toBe('saved')
    await page.context().setOffline(true)
    await answerTrials(page, 2)
    await expect.poll(async () => (await syncStatus(page)).status, { timeout: 10_000 }).toBe('offline')
    await page.context().setOffline(false)
    await expect.poll(async () => (await syncStatus(page)).status, { timeout: 10_000 }).toBe('saved')
    expect(stroopTrials(await getParticipant(db, participantId))).toHaveLength(2)
  })

  test('the participant\'s row is created later when the request at consent fails', async ({ page }) => {
    const before = await latestId(db)
    await page.goto('/welcome')
    await page.evaluate(() => {
      localStorage.clear()
    })
    await page.context().clearCookies()
    await page.goto('/welcome')
    await page.route(url => url.pathname.endsWith('/api/participants'), (route: Route) =>
      route.request().method() === 'POST' ? route.abort('connectionreset') : route.continue())
    await page.getByRole('button', { name: /I'm ready/i }).click()
    await page.getByRole('switch').click()
    await page.getByRole('button', { name: /Let's start/i }).click()

    // The participant goes on, with their record kept in the browser
    await expect(page).toHaveURL(/\/demograph/)
    await expect.poll(async () => (await readSnapshot(page))?.data?.consented).toBe(true)
    expect((await readSnapshot(page)).participantId).toBeNull()
    expect(await latestId(db)).toBe(before)

    // A reload in that state keeps them where they are
    await page.reload()
    await expect(page).toHaveURL(/\/demograph/)
    expect(await latestId(db)).toBe(before)

    // The server answers again: the row is made, with the record so far
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await expect.poll(() => latestId(db), { timeout: 20_000 }).not.toBe(before)
    participantId = await latestId(db)
    await expect.poll(async () => (await getParticipant(db, participantId!))?.consented, { timeout: 10_000 }).toBe(true)
    await expect.poll(async () => (await readSnapshot(page)).participantId).toBe(participantId)
  })

  test.describe('private data', () => {
    test('a reload does not erase what the server has', async ({ page }) => {
      participantId = await consent(page, db)
      await openStroop(page)
      await inStore(page, 'store.private.recruitmentInfo = { prolific_id: "E2E-PID" }; return store.sync()')
      await expect.poll(async () => (await privateRow(db, participantId!))?.recruitmentInfo?.prolific_id).toBe('E2E-PID')

      await page.reload()
      await expect(page.locator('#prompt')).toBeVisible({ timeout: 15_000 })
      // The page has it again (the Thanks page builds the return link from it)
      expect(await inStore<string>(page, 'return store.private.recruitmentInfo.prolific_id')).toBe('E2E-PID')
      await answerTrials(page, 1)
      await inStore(page, 'return store.sync()')
      expect((await privateRow(db, participantId)).recruitmentInfo.prolific_id).toBe('E2E-PID')
    })

    test('nor does a reload in a browser that lost its local copy', async ({ page }) => {
      participantId = await consent(page, db)
      await openStroop(page)
      await inStore(page, 'store.private.recruitmentInfo = { prolific_id: "E2E-PID" }; return store.sync()')
      await expect.poll(async () => (await privateRow(db, participantId!))?.recruitmentInfo?.prolific_id).toBe('E2E-PID')

      // The local copy is gone; the cookies are not
      await page.addInitScript(() => {
        if (!sessionStorage.getItem('cleared')) {
          localStorage.clear()
          sessionStorage.setItem('cleared', '1')
        }
      })
      await inStore(page, 'store.stopSnapshots()')
      await page.reload()
      await expect(page.locator('#prompt')).toBeVisible({ timeout: 15_000 })
      expect(await inStore<any>(page, 'return store.private.recruitmentInfo')).toEqual({})

      // They withdraw: the form is added to the private data, and the id stays
      await inStore(page, 'store.private.withdrawData = { reason: "e2e" }; return store.sync()')
      const stored = await privateRow(db, participantId)
      expect(stored.withdrawData).toEqual({ reason: 'e2e' })
      expect(stored.recruitmentInfo.prolific_id).toBe('E2E-PID')
    })
  })
})
