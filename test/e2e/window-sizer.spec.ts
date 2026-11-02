import { test, expect, type Page } from '@playwright/test'
import { clearState, fillDemographicsPage1, fillDemographicsPage2, fillDemographicsPage3 } from './helpers'

/**
 * The aggressive window sizer must leave room for the status bar (#33).
 *
 * The playground requests 800x600 (VITE_WINDOWSIZER_REQUEST) with
 * VITE_WINDOWSIZER_AGGRESSIVE=true. WindowSizerView puts 28px of margin above
 * and below its box (mt-5 + m-2), and the box sits under the status bar, so
 * the window must be at least 600 + 28 + the bar's height tall.
 */

const REQUEST = { width: 800, height: 600 }
const MARGIN_X = 16
const MARGIN_Y = 28

const overlayText = (page: Page) => page.getByText(/We don't want you to miss anything/i)
const statusBar = (page: Page) => page.getByRole('navigation', { name: 'main navigation' })

/** Go through the flow until visibility is verified (the sizer is armed after that). */
async function passWindowSizer(page: Page) {
  await page.goto('/welcome')
  await clearState(page)
  await page.goto('/welcome')
  await page.getByRole('button', { name: /I'm ready/i }).click()
  await page.getByRole('switch').click()
  await page.getByRole('button', { name: /Let's start/i }).click()
  await fillDemographicsPage1(page)
  await fillDemographicsPage2(page)
  await fillDemographicsPage3(page)
  await expect(page).toHaveURL(/\/windowsizer/)
  await page.getByRole('button', { name: /visible now.*ready/i }).click()
  await expect(page).toHaveURL(/\/instructions/)
}

test.describe('Window sizer and the status bar (#33)', () => {
  test('requires room for the status bar, and the overlay leaves the bar usable', async ({ page }) => {
    test.setTimeout(90_000)
    await passWindowSizer(page)

    const barHeight = Math.ceil((await statusBar(page).boundingBox())!.height)
    expect(barHeight).toBeGreaterThan(0)
    const minHeight = REQUEST.height + MARGIN_Y + barHeight
    const width = REQUEST.width + MARGIN_X + 100

    // Tall enough for the box alone, but not once the bar takes its share.
    await page.setViewportSize({ width, height: minHeight - 1 })
    await expect(overlayText(page)).toBeVisible()
    // The re-adjust version, not the first-visit one with its "I'm ready" button
    await expect(page.getByRole('button', { name: /visible now.*ready/i })).toHaveCount(0)

    // The overlay covers the content, not the bar: the withdraw button (which
    // the overlay's text tells participants to use) is still on top.
    const withdraw = statusBar(page).getByRole('button', { name: /withdraw/i })
    await expect(withdraw).toBeVisible()
    const box = (await withdraw.boundingBox())!
    const onTop = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      return !!el?.closest('[aria-label="main navigation"]')
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
    expect(onTop).toBe(true)

    // Exactly enough room: the overlay goes away.
    await page.setViewportSize({ width, height: minHeight })
    await expect(overlayText(page)).toBeHidden()
  })
})
