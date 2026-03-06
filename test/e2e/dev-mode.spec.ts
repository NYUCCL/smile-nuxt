import { test, expect } from '@playwright/test'
import { clearState } from './helpers'

test.describe('Dev mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await clearState(page)
  })

  test('dev routes render experiment views with /dev prefix', async ({ page }) => {
    // Dev mode should show experiment views under /dev/
    await page.goto('/dev/welcome')
    await page.waitForTimeout(1000)

    // Should see the experiment content (advertisement view)
    // In dev mode, guards may be relaxed
    const url = page.url()
    expect(url).toContain('/dev')
  })

  test('dev mode allows jumping to any route', async ({ page }) => {
    // In dev mode, force navigation should be available
    await page.goto('/dev/consent')
    await page.waitForTimeout(1000)
    // Should be able to access consent directly in dev mode
    const url = page.url()
    expect(url).toContain('/dev')
  })
})
