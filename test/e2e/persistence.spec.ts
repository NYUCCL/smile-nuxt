import { test, expect } from '@playwright/test'
import { clearState } from './helpers'

test.describe('State persistence', () => {
  const readyButton = (page) => page.getByRole('button', { name: /I'm ready/i })

  test.beforeEach(async ({ page }) => {
    await page.goto('/welcome')
    await clearState(page)
    await page.goto('/welcome')
    await expect(readyButton(page)).toBeVisible({ timeout: 10_000 })
  })

  test('resumes at correct page after refresh', async ({ page }) => {
    // Navigate to consent
    await readyButton(page).click()
    await expect(page).toHaveURL(/\/consent/)

    // Complete consent
    await page.getByRole('switch').click()
    await page.getByRole('button', { name: /Let's start/i }).click()
    await expect(page).toHaveURL(/\/demograph/)

    // Refresh the page
    await page.reload()
    await page.waitForTimeout(1000)

    // Should still be on demograph (not reset to welcome)
    await expect(page).toHaveURL(/\/demograph/)
  })

  test('remembers consent across page refresh', async ({ page }) => {
    // Navigate to consent and accept
    await readyButton(page).click()
    await expect(page).toHaveURL(/\/consent/)
    await page.getByRole('switch').click()
    await page.getByRole('button', { name: /Let's start/i }).click()
    await expect(page).toHaveURL(/\/demograph/)

    // Reload and verify we're not sent back to consent
    await page.reload()
    await page.waitForTimeout(1000)
    expect(page.url()).not.toContain('/consent')
    expect(page.url()).not.toContain('/welcome')
  })

  test('known user visiting root is redirected to last route', async ({ page }) => {
    // Complete through consent to demographics
    await readyButton(page).click()
    await page.getByRole('switch').click()
    await page.getByRole('button', { name: /Let's start/i }).click()
    await expect(page).toHaveURL(/\/demograph/)

    // Visit root — should redirect to where we left off, not restart
    await page.goto('/')
    await page.waitForTimeout(1000)
    // Should not be on the welcome page
    expect(page.url()).not.toContain('/welcome')
  })
})
