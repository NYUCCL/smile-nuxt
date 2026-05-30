import { test, expect, type Page } from '@playwright/test'
import { clearState } from './helpers'

test.describe('Navigation guards', () => {
  const readyButton = (page: Page) => page.getByRole('button', { name: /I'm ready/i })

  test.beforeEach(async ({ page }) => {
    await page.goto('/welcome')
    await clearState(page)
    await page.goto('/welcome')
    await expect(readyButton(page)).toBeVisible({ timeout: 10_000 })
  })

  test('redirects unknown users from consent-required routes to welcome', async ({ page }) => {
    await page.goto('/demograph')
    await page.waitForTimeout(1000)
    // Should NOT be on /demograph — should redirect to welcome or consent
    expect(page.url()).not.toContain('/demograph')
  })

  test('redirects unknown users from thanks page', async ({ page }) => {
    await page.goto('/thanks')
    await page.waitForTimeout(1000)
    expect(page.url()).not.toContain('/thanks')
  })

  test('blocks navigation to done-required routes when not done', async ({ page }) => {
    await page.goto('/thanks')
    await page.waitForTimeout(1000)
    expect(page.url()).not.toContain('/thanks')
  })

  test('prevents skipping ahead in the sequence', async ({ page }) => {
    // Complete welcome
    await readyButton(page).click()
    await expect(page).toHaveURL(/\/consent/)

    // Try to skip to instructions (past consent and demographics)
    await page.goto('/instructions')
    await page.waitForTimeout(1000)
    expect(page.url()).not.toContain('/instructions')
  })

  test('allows the welcome page for unknown users', async ({ page }) => {
    await page.goto('/welcome')
    await page.waitForTimeout(500)
    await expect(readyButton(page)).toBeVisible()
  })
})
