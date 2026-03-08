/**
 * Example E2E tests for your SMILE experiment.
 *
 * These tests walk through the experiment flow as a participant would,
 * verifying that pages render, navigation works, and data is saved.
 *
 * Customize these tests as you build your experiment:
 * - Add assertions for your custom task (MyTaskView)
 * - Test different paths through your experiment
 * - Verify data is recorded correctly in the database
 *
 * Run with: pnpm test:e2e
 * See: https://playwright.dev/docs/writing-tests
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@libsql/client'
import { clearState, fillDemographicsPage1, fillDemographicsPage2, fillDemographicsPage3 } from './helpers'

// ---------------------------------------------------------------------------
// Database helpers — query the local SQLite database directly
// ---------------------------------------------------------------------------

function getDB() {
  return createClient({ url: 'file:.data/experiment.db' })
}

async function getLatestParticipant(db: ReturnType<typeof createClient>) {
  const result = await db.execute('SELECT * FROM participants ORDER BY created_at DESC LIMIT 1')
  if (result.rows.length === 0) return null
  return {
    id: result.rows[0].id as string,
    projectRef: result.rows[0].project_ref as string,
    data: JSON.parse(result.rows[0].data as string),
  }
}

async function cleanupParticipant(db: ReturnType<typeof createClient>, id: string) {
  await db.execute({ sql: 'DELETE FROM private_data WHERE participant_id = ?', args: [id] })
  await db.execute({ sql: 'DELETE FROM participants WHERE id = ?', args: [id] })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Experiment flow', () => {
  const readyButton = (page) => page.getByRole('button', { name: /I'm ready/i })
  let db: ReturnType<typeof createClient>
  let createdIds: string[] = []

  test.beforeAll(() => {
    db = getDB()
  })

  test.beforeEach(async ({ page }) => {
    createdIds = []
    await page.goto('/welcome')
    await clearState(page)
    await page.goto('/welcome')
    await expect(readyButton(page)).toBeVisible({ timeout: 10_000 })
  })

  test.afterEach(async () => {
    for (const id of createdIds) {
      await cleanupParticipant(db, id)
    }
  })

  test.afterAll(() => {
    db.close()
  })

  // -------------------------------------------------------------------------
  // Basic navigation
  // -------------------------------------------------------------------------

  test('shows the welcome page', async ({ page }) => {
    await expect(readyButton(page)).toBeVisible()
    await expect(page.getByText(/Please help us/i)).toBeVisible()
  })

  test('navigates welcome -> consent -> demographics', async ({ page }) => {
    await readyButton(page).click()
    await expect(page).toHaveURL(/\/consent/)

    await page.getByRole('switch').click()
    await page.getByRole('button', { name: /Let's start/i }).click()
    await expect(page).toHaveURL(/\/demograph/)
  })

  test('blocks skipping ahead without consent', async ({ page }) => {
    await page.goto('/demograph')
    await page.waitForTimeout(1000)
    // Should be redirected back (not on demographics)
    expect(page.url()).not.toContain('/demograph')
  })

  // -------------------------------------------------------------------------
  // Demographics through window sizer
  // -------------------------------------------------------------------------

  test('completes demographics and reaches task', async ({ page }) => {
    test.setTimeout(90_000)

    // Welcome -> Consent
    await readyButton(page).click()
    await page.getByRole('switch').click()
    await page.getByRole('button', { name: /Let's start/i }).click()

    // Demographics (3 pages)
    await fillDemographicsPage1(page)
    await fillDemographicsPage2(page)
    await fillDemographicsPage3(page)

    // Window sizer
    await expect(page).toHaveURL(/\/windowsizer/)
    await page.getByRole('button', { name: /visible now.*ready/i }).click()

    // Should reach your custom task
    await expect(page).toHaveURL(/\/task/)
  })

  // -------------------------------------------------------------------------
  // Database verification
  // -------------------------------------------------------------------------

  test('creates a participant record on consent', async ({ page }) => {
    // Welcome -> Consent
    await readyButton(page).click()
    await page.getByRole('switch').click()
    await page.getByRole('button', { name: /Let's start/i }).click()
    await expect(page).toHaveURL(/\/demograph/)
    await page.waitForTimeout(1000)

    const participant = await getLatestParticipant(db)
    expect(participant).not.toBeNull()
    createdIds.push(participant!.id)

    // Verify key fields
    expect(participant!.data.consented).toBe(true)
    expect(participant!.data.recruitmentService).toBe('web')
    expect(participant!.data.seedID).toBeTruthy()
  })

  test('records route history in the database', async ({ page }) => {
    test.setTimeout(90_000)

    // Walk through several pages
    await readyButton(page).click()
    await page.getByRole('switch').click()
    await page.getByRole('button', { name: /Let's start/i }).click()
    await fillDemographicsPage1(page)
    await fillDemographicsPage2(page)
    await fillDemographicsPage3(page)
    await expect(page).toHaveURL(/\/windowsizer/)

    // Wait for a save to fire
    await page.waitForTimeout(3000)

    const participant = await getLatestParticipant(db)
    expect(participant).not.toBeNull()
    createdIds.push(participant!.id)

    const routeNames = participant!.data.routeOrder.map((r: any) => r.route)
    expect(routeNames).toContain('welcome_anonymous')
    expect(routeNames).toContain('consent')
    expect(routeNames).toContain('demograph')
  })

  // -------------------------------------------------------------------------
  // State persistence
  // -------------------------------------------------------------------------

  test('resumes at correct page after refresh', async ({ page }) => {
    await readyButton(page).click()
    await page.getByRole('switch').click()
    await page.getByRole('button', { name: /Let's start/i }).click()
    await expect(page).toHaveURL(/\/demograph/)

    await page.reload()
    await page.waitForTimeout(1000)

    // Should still be on demographics, not reset to welcome
    await expect(page).toHaveURL(/\/demograph/)
  })
})

// ---------------------------------------------------------------------------
// Add your own tests below!
// ---------------------------------------------------------------------------
//
// Example: testing your custom task view
//
// test('my task records data correctly', async ({ page }) => {
//   // ... navigate to /task ...
//   // ... interact with your task UI ...
//   // ... check that data was recorded ...
// })
