/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@libsql/client'
import { clearState } from './helpers'

/**
 * Regression tests for #42: stepper trial data recorded before a page reload
 * must still be in the participant's *database* record after the view finishes.
 *
 * stepper-persistence.spec.ts covers the localStorage side (position and step
 * data survive a reload). These tests check what actually reaches the
 * participants table, which is what researchers analyze.
 *
 * Flow: consent through the real experiment flow (so a participant row exists),
 * then open /stroop as a returning participant whose last route is the Stroop
 * view, and run its 9 trials (playground/components/StroopExpView.vue).
 *
 * Setting the lastRoute cookie stands in for "has progressed to Stroop"; the
 * guards allow a participant onto their own last route, which is exactly the
 * path a real participant's reload takes. The dev-mode block below covers the
 * same flow under /dev/ (#58).
 */

const N_TRIALS = 9

function getDB() {
  return createClient({ url: 'file:.data/experiment.db' })
}

async function getParticipant(db: ReturnType<typeof createClient>, id: string) {
  const result = await db.execute({ sql: 'SELECT data FROM participants WHERE id = ?', args: [id] })
  if (result.rows.length === 0) return null
  return JSON.parse(result.rows[0]!.data as string)
}

async function cleanupParticipant(db: ReturnType<typeof createClient>, id: string) {
  await db.execute({ sql: 'DELETE FROM private_data WHERE participant_id = ?', args: [id] })
  await db.execute({ sql: 'DELETE FROM participants WHERE id = ?', args: [id] })
}

/** All Stroop trial records in the DB row, across every visit to the view. */
function stroopTrials(data: any): any[] {
  const pageData = data?.pageData_stroop ?? {}
  return Object.values(pageData).flatMap((visit: any) => visit.data ?? [])
    .filter((d: any) => d.word && d.color)
}

async function latestParticipantId(db: ReturnType<typeof createClient>): Promise<string | null> {
  const result = await db.execute('SELECT id FROM participants ORDER BY created_at DESC LIMIT 1')
  return (result.rows[0]?.id as string) ?? null
}

/**
 * Consent via the real flow and return the new participant's id.
 * Tests run on a single worker, so the newest row after consent is ours.
 */
async function consent(page: Page, db: ReturnType<typeof createClient>): Promise<string> {
  const before = await latestParticipantId(db)
  await page.goto('/welcome')
  await clearState(page)
  await page.goto('/welcome')
  await page.getByRole('button', { name: /I'm ready/i }).click()
  await page.getByRole('switch').click()
  await page.getByRole('button', { name: /Let's start/i }).click()
  await expect(page).toHaveURL(/\/demograph/)

  // setKnown() creates the row asynchronously; wait for a new one to appear.
  await expect.poll(() => latestParticipantId(db), { timeout: 10_000 }).not.toBe(before)
  return (await latestParticipantId(db))!
}

/** Mark the participant as having reached Stroop, then load it (non-dev route). */
async function openStroop(page: Page) {
  const cookies = await page.context().cookies()
  const lastRoute = cookies.find(c => /^smile_.*_lastRoute$/.test(c.name))
  expect(lastRoute, 'lastRoute cookie should exist after consent').toBeTruthy()
  // Keep the cookie's existing encoding (useCookie may JSON-quote string values).
  const value = lastRoute!.value.replace(/demograph|consent|welcome\w*/, 'stroop')
  await page.context().addCookies([{ ...lastRoute!, value }])

  await page.goto('/stroop')
  await expect(page).toHaveURL(/\/stroop$/)
  await expect(page.locator('#prompt')).toBeVisible({ timeout: 15_000 })
}

/** Answer `n` trials, pausing so each keypress lands on its own trial. */
async function answerTrials(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('r')
    await page.waitForTimeout(250)
  }
}

/** Click Continue on the summary screen (goNextView triggers the auto-save). */
async function finishView(page: Page) {
  await expect(page.locator('#finish')).toBeVisible({ timeout: 5_000 })
  await page.locator('#finish').click()
}

/**
 * Wait until all N_TRIALS trials are in the participant's DB row (across all
 * visits to the view), then return them. Waits on the count itself because
 * earlier saves (e.g. the one after a reload) can write a partial set first.
 */
async function savedStroopTrials(db: ReturnType<typeof createClient>, id: string): Promise<any[]> {
  await expect.poll(async () => stroopTrials(await getParticipant(db, id)).length, {
    message: `all ${N_TRIALS} Stroop trials should be saved to the participant row after Continue`,
    timeout: 10_000,
  }).toBe(N_TRIALS)
  return stroopTrials(await getParticipant(db, id))
}

test.describe('Stepper data reaches the database (#42)', () => {
  let db: ReturnType<typeof createClient>
  let participantId: string | null = null

  test.beforeAll(async () => {
    db = getDB()
    // The dev server writes to the same SQLite file; wait for its lock
    // instead of failing reads with "database is locked".
    await db.execute('PRAGMA busy_timeout = 5000')
  })

  test.afterEach(async () => {
    if (participantId) await cleanupParticipant(db, participantId)
    participantId = null
  })

  test.afterAll(() => {
    db.close()
  })

  test('control: all trials are saved when the view is completed without a reload', async ({ page }) => {
    test.setTimeout(90_000)
    participantId = await consent(page, db)
    await openStroop(page)

    await answerTrials(page, N_TRIALS)
    await finishView(page)

    const trials = await savedStroopTrials(db, participantId)
    expect(trials).toHaveLength(N_TRIALS)
    expect(new Set(trials.map(t => t.id)).size).toBe(N_TRIALS)
  })

  test('trials completed before a reload are still saved after the view finishes', async ({ page }) => {
    // Regression test for #42: reloading mid-view used to replace store.data
    // with the DB copy saved when the view was entered, dropping the trials
    // recorded before the reload (only 5 of 9 were saved). The local data
    // backup now restores them, and loadData() saves them right away.
    test.setTimeout(90_000)
    participantId = await consent(page, db)
    await openStroop(page)

    await answerTrials(page, 4)
    await page.reload()
    await expect(page.locator('#prompt')).toBeVisible({ timeout: 15_000 })
    await answerTrials(page, N_TRIALS - 4)
    await finishView(page)

    const trials = await savedStroopTrials(db, participantId)
    // Each of the 9 trials (distinct ids a–i) should be present exactly once.
    expect(trials).toHaveLength(N_TRIALS)
    expect(new Set(trials.map(t => t.id)).size).toBe(N_TRIALS)
  })
})

test.describe('Dev mode saves reach the database after a page load (#58)', () => {
  // Dev mode used to skip the guard that reconnects a returning participant to
  // their DB row, so after any full page load under /dev/ every save failed
  // with "can't save data, not connected to server".
  let db: ReturnType<typeof createClient>
  let participantId: string | null = null

  test.beforeAll(async () => {
    db = getDB()
    await db.execute('PRAGMA busy_timeout = 5000')
  })

  test.afterEach(async () => {
    if (participantId) await cleanupParticipant(db, participantId)
    participantId = null
  })

  test.afterAll(() => {
    db.close()
  })

  async function openDevStroop(page: Page) {
    await page.goto('/dev/stroop')
    await expect(page.locator('#prompt')).toBeVisible({ timeout: 15_000 })
  }

  test('opening /dev/stroop directly after consent saves its trials', async ({ page }) => {
    test.setTimeout(90_000)
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.text().includes('not connected to server')) errors.push(m.text())
    })
    participantId = await consent(page, db)
    await openDevStroop(page)

    await answerTrials(page, N_TRIALS)
    await finishView(page)

    const trials = await savedStroopTrials(db, participantId)
    expect(new Set(trials.map(t => t.id)).size).toBe(N_TRIALS)
    expect(errors).toEqual([])
  })

  test('reloading on a /dev/ route keeps saving', async ({ page }) => {
    test.setTimeout(90_000)
    participantId = await consent(page, db)
    await openDevStroop(page)

    await answerTrials(page, 4)
    await page.reload()
    await expect(page.locator('#prompt')).toBeVisible({ timeout: 15_000 })
    await answerTrials(page, N_TRIALS - 4)
    await finishView(page)

    const trials = await savedStroopTrials(db, participantId)
    expect(new Set(trials.map(t => t.id)).size).toBe(N_TRIALS)
  })
})
