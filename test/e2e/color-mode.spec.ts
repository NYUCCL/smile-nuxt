import { test, expect, type Page } from '@playwright/test'

/**
 * Participant pages follow the experiment's color mode setting (#32):
 * 'light' and 'dark' lock the page whatever the system prefers; 'system'
 * follows prefers-color-scheme, live. The playground sets VITE_COLOR_MODE=light.
 */

const html = (page: Page) => page.locator('html')

/** Change config.colorMode the way api.setRuntimeConfig('colorMode', …) would. */
async function setColorMode(page: Page, mode: string) {
  await expect(page.getByRole('button', { name: /I'm ready/i })).toBeVisible()
  await page.evaluate((m) => {
    type NuxtRoot = Element & { __vue_app__: { config: { globalProperties: { $pinia: { _s: Map<string, { config: Record<string, unknown> }> } } } } }
    const app = (document.querySelector('#__nuxt') as NuxtRoot).__vue_app__
    app.config.globalProperties.$pinia._s.get('smilestore')!.config.colorMode = m
  }, mode)
}

test.describe('Participant color mode (#32)', () => {
  test('light is kept when the system prefers dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/welcome')
    await expect(page.getByRole('button', { name: /I'm ready/i })).toBeVisible()
    await expect(html(page)).toHaveClass(/\blight\b/)
    await expect(html(page)).not.toHaveClass(/\bdark\b/)
  })

  test('dark is kept when the system prefers light', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/welcome')
    await setColorMode(page, 'dark')
    await expect(html(page)).toHaveClass(/\bdark\b/)
    // The theme tokens switch with it.
    const bg = await page.locator('.experiment-container').evaluate(el => getComputedStyle(el).backgroundColor)
    expect(bg).not.toBe('rgb(255, 255, 255)')
  })

  test('system follows the browser preference, including changes', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/welcome')
    await setColorMode(page, 'system')
    await expect(html(page)).toHaveClass(/\bdark\b/)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(html(page)).toHaveClass(/\blight\b/)
    await expect(html(page)).not.toHaveClass(/\bdark\b/)
  })
})
