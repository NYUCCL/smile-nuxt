/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, type Page } from '@playwright/test'
import { createClient } from '@libsql/client'
import { clearState } from './helpers'

/**
 * Helpers for tests that check what reaches the participants table: consent
 * through the real flow, open the Stroop view (playground/components/
 * StroopExpView.vue, 9 trials), answer trials, and read the row back.
 */

export const N_TRIALS = 9

export type DB = ReturnType<typeof createClient>

/** The dev server's local database. Waits for its lock instead of failing. */
export async function getDB(): Promise<DB> {
  const db = createClient({ url: 'file:.data/experiment.db' })
  await db.execute('PRAGMA busy_timeout = 5000')
  return db
}

export async function getParticipant(db: DB, id: string) {
  const result = await db.execute({ sql: 'SELECT data FROM participants WHERE id = ?', args: [id] })
  if (result.rows.length === 0) return null
  return JSON.parse(result.rows[0]!.data as string)
}

export async function cleanupParticipant(db: DB, id: string) {
  // A save still on its way from the page can add the private row between
  // the two deletes; the foreign key then refuses the second. Try again.
  for (let attempt = 0; ; attempt++) {
    try {
      await db.execute({ sql: 'DELETE FROM private_data WHERE participant_id = ?', args: [id] })
      await db.execute({ sql: 'DELETE FROM participants WHERE id = ?', args: [id] })
      return
    }
    catch (err) {
      if (attempt >= 4) throw err
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
}

/** All Stroop trial records in the DB row, across every visit to the view. */
export function stroopTrials(data: any): any[] {
  const pageData = data?.pageData_stroop ?? {}
  return Object.values(pageData).flatMap((visit: any) => visit.data ?? [])
    .filter((d: any) => d.word && d.color)
}

async function latestParticipantId(db: DB): Promise<string | null> {
  const result = await db.execute('SELECT id FROM participants ORDER BY created_at DESC LIMIT 1')
  return (result.rows[0]?.id as string) ?? null
}

/**
 * Consent via the real flow and return the new participant's id.
 * Tests run on a single worker, so the newest row after consent is ours.
 */
export async function consent(page: Page, db: DB): Promise<string> {
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

/** The local snapshot (the one `smilestore-*` value), or null */
export function readSnapshot(page: Page): Promise<any> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('smilestore-'))
    if (!key) return null
    try {
      return JSON.parse(localStorage.getItem(key)!)
    }
    catch {
      return null
    }
  })
}

/**
 * Mark the participant as having reached Stroop, then load it (non-dev route).
 * Setting the store's last route stands in for "has progressed to Stroop" (the
 * store writes it to the cookie and to the local snapshot); the guards allow a
 * participant onto their own last route, which is the path a real
 * participant's reload takes.
 */
export async function openStroop(page: Page) {
  await page.evaluate(() => {
    const app = (document.querySelector('#__nuxt') as any).__vue_app__
    app.config.globalProperties.$pinia._s.get('smilestore').setLastRoute('stroop')
  })
  await expect.poll(async () => (await readSnapshot(page))?.resume?.view, {
    message: 'the local snapshot should record the new last route',
  }).toBe('stroop')

  await page.goto('/stroop')
  await expect(page).toHaveURL(/\/stroop$/)
  await expect(page.locator('#prompt')).toBeVisible({ timeout: 15_000 })
}

/** Answer `n` trials, pausing so each keypress lands on its own trial. */
export async function answerTrials(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('r')
    await page.waitForTimeout(250)
  }
}

/** Click Continue on the summary screen (goNextView triggers the auto-save). */
export async function finishView(page: Page) {
  await expect(page.locator('#finish')).toBeVisible({ timeout: 5_000 })
  await page.locator('#finish').click()
}

/**
 * Wait until all N_TRIALS trials are in the participant's DB row (across all
 * visits to the view), then return them. Waits on the count itself because
 * earlier saves (e.g. the one after a reload) can write a partial set first.
 */
export async function savedStroopTrials(db: DB, id: string, timeout = 10_000): Promise<any[]> {
  await expect.poll(async () => stroopTrials(await getParticipant(db, id)).length, {
    message: `all ${N_TRIALS} Stroop trials should be saved to the participant row`,
    timeout,
  }).toBeGreaterThanOrEqual(N_TRIALS)
  return stroopTrials(await getParticipant(db, id))
}
