import { test, expect, type Page } from '@playwright/test'
import {
  answerTrials, cleanupParticipant, consent, getDB, getParticipant, openStroop, stroopTrials, type DB,
} from './db-helpers'

/**
 * Step 5 of plans/sync_engine.md: the study open in two tabs of one browser.
 * The tab opened last is the participant's; the other stops saving and shows
 * a notice. Nothing one tab saved is overwritten by the other.
 */

const notice = (page: Page) => page.getByTestId('other-tab-notice')

const savedTrials = async (db: DB, id: string) => stroopTrials(await getParticipant(db, id)).length

test.describe('Two tabs (plans/sync_engine.md, step 5)', () => {
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

  test('the second tab takes over where the first was; the first shows the notice and can take over again', async ({ page, context }) => {
    participantId = await consent(page, db)
    await openStroop(page)
    await answerTrials(page, 2)
    await expect.poll(() => savedTrials(db, participantId!)).toBe(2)

    // The same address in a second tab
    const second = await context.newPage()
    await second.goto('/stroop')
    await expect(second.locator('#prompt')).toBeVisible({ timeout: 15_000 })
    await expect(notice(page)).toBeVisible()
    await expect(notice(second)).toHaveCount(0)

    // The second tab has the record so far, and saves
    await answerTrials(second, 1)
    await expect.poll(() => savedTrials(db, participantId!)).toBe(3)

    // Keys pressed in the first tab change nothing on the server
    await page.bringToFront()
    await answerTrials(page, 2)
    await page.waitForTimeout(2_500)
    expect(await savedTrials(db, participantId!)).toBe(3)

    // "Continue here": the first tab starts again from the newest copy, and
    // the second gets the notice
    await page.getByTestId('other-tab-continue').click()
    await expect(page.locator('#prompt')).toBeVisible({ timeout: 15_000 })
    await expect(notice(page)).toHaveCount(0)
    await expect(notice(second)).toBeVisible()
    await answerTrials(page, 1)
    await expect.poll(() => savedTrials(db, participantId!)).toBe(4)
    const trials = stroopTrials(await getParticipant(db, participantId!))
    expect(new Set(trials.map(t => JSON.stringify(t))).size).toBe(4)
  })

  test('without BroadcastChannel, the server\'s 409 stops the tab that is behind', async ({ page, context }) => {
    await context.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).BroadcastChannel
    })
    participantId = await consent(page, db)
    await openStroop(page)
    await answerTrials(page, 1)
    await expect.poll(() => savedTrials(db, participantId!)).toBe(1)

    const second = await context.newPage()
    await second.goto('/stroop')
    await expect(second.locator('#prompt')).toBeVisible({ timeout: 15_000 })
    await expect(notice(page)).toHaveCount(0) // nothing told it

    await answerTrials(second, 2)
    await expect.poll(() => savedTrials(db, participantId!)).toBe(3)
    const saved = JSON.stringify(stroopTrials(await getParticipant(db, participantId!)))

    // The first tab, now behind, tries to save: refused, and it stops
    await page.bringToFront()
    await answerTrials(page, 1)
    await expect(notice(page)).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(1_500)
    expect(JSON.stringify(stroopTrials(await getParticipant(db, participantId!)))).toBe(saved)

    // Continuing there starts from what the second tab saved
    await page.getByTestId('other-tab-continue').click()
    await expect(page.locator('#prompt')).toBeVisible({ timeout: 15_000 })
    await expect(notice(page)).toHaveCount(0)
    await answerTrials(page, 1)
    await expect.poll(() => savedTrials(db, participantId!)).toBe(4)
    expect(JSON.stringify(stroopTrials(await getParticipant(db, participantId!)).slice(0, 3))).toBe(saved)
  })
})
