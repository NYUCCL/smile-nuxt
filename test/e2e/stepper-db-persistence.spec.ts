import { test, expect, type Page } from '@playwright/test'
import {
  N_TRIALS, answerTrials, cleanupParticipant, consent, finishView, getDB, openStroop, savedStroopTrials, type DB,
} from './db-helpers'

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

test.describe('Stepper data reaches the database (#42)', () => {
  let db: DB
  let participantId: string | null = null

  test.beforeAll(async () => {
    db = await getDB()
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
  let db: DB
  let participantId: string | null = null

  test.beforeAll(async () => {
    db = await getDB()
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
