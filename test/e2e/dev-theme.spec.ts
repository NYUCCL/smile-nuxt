import { test, expect } from '@playwright/test'

/**
 * The dev tools' own theme starts on the system setting, and the button at the
 * bottom of the app menu cycles system -> light -> dark -> system.
 */
test('dev tools theme: system by default, and the button cycles back to system', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/dev/welcome')
  const html = page.locator('html')
  const button = page.getByRole('button', { name: 'Dev tools theme' })
  await expect(html).toHaveClass(/\bdark\b/) // system, which is dark here
  await button.click()
  await expect(html).toHaveClass(/\blight\b/)
  await button.click()
  await expect(html).toHaveClass(/\bdark\b/)
  await button.click() // back to system
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(html).toHaveClass(/\blight\b/)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(html).toHaveClass(/\bdark\b/)
})

/**
 * The dev tools' theme must not leak into the experiment preview: dark: styles
 * inside a light experiment stay off when the dev tools are dark, and the other
 * way round. (The dark: variant follows the nearest .light/.dark container.)
 */
test('dev tools theme does not leak into the experiment preview', async ({ page }) => {
  await page.goto('/dev/consent')
  // The playground's consent placeholder: bg-amber-50 dark:bg-amber-950/40
  const box = page.locator('div.border-dashed.border-amber-500:visible').first()
  await expect(box).toBeVisible()
  const setModes = (g: string, e: string) => page.evaluate(([g, e]) => {
    type Root = Element & { __vue_app__: { config: { globalProperties: { $pinia: { _s: Map<string, { dev: Record<string, unknown> }> } } } } }
    const store = (document.querySelector('#__nuxt') as Root).__vue_app__.config.globalProperties.$pinia._s.get('smilestore')!
    store.dev.globalColorMode = g
    store.dev.experimentColorMode = e
  }, [g, e])
  // Tailwind 4 colors compute to oklch(L …) or, with an opacity, oklab(L …);
  // L is the lightness (0-1).
  const lightness = async () => {
    const bg = await box.evaluate(el => getComputedStyle(el).backgroundColor)
    return Number(bg.match(/okl(?:ch|ab)\(([\d.]+)/)?.[1] ?? Number.NaN)
  }

  await setModes('dark', 'light')
  await expect.poll(lightness).toBeGreaterThan(0.8) // amber-50
  await setModes('light', 'dark')
  await expect.poll(lightness).toBeLessThan(0.4) // amber-950
})

/** Sets store.dev fields from the page (the dev settings, saved in the dev cookie). */
const setDev = (page: import('@playwright/test').Page, fields: Record<string, unknown>) => page.evaluate((fields) => {
  type Root = Element & { __vue_app__: { config: { globalProperties: { $pinia: { _s: Map<string, { dev: Record<string, unknown> }> } } } } }
  const store = (document.querySelector('#__nuxt') as Root).__vue_app__.config.globalProperties.$pinia._s.get('smilestore')!
  Object.assign(store.dev, fields)
}, fields)

/**
 * Menus render at the end of <body>, outside the dev tools' .sd-root elements.
 * One opened from the dev tools still gets the dev tools' colors (DevScope);
 * one opened from a participant view in the preview keeps the participant theme.
 */
test('menus opened from the dev tools use the dev colors, the preview\'s do not', async ({ page }) => {
  await page.goto('/dev/demograph')
  const menu = page.locator('[data-slot="select-content"]')

  await page.locator('.device-controls [data-slot="select-trigger"]').click()
  await expect(menu).toBeVisible()
  await expect(menu).toHaveClass(/\bsd-root\b/)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)

  await page.locator('.device-container [data-slot="select-trigger"]').first().click()
  await expect(menu).toBeVisible()
  await expect(menu).not.toHaveClass(/\bsd-root\b/)
})

/**
 * The palette is saved with the dev settings (it survives a reload) and only
 * changes the dev tools: the experiment preview's colors stay the same.
 */
test('dev palette persists across reloads and leaves the preview alone', async ({ page }) => {
  await page.goto('/dev/consent')
  const html = page.locator('html')
  const toolbar = page.locator('.toolbar.sd-root').first()
  const box = page.locator('div.border-dashed.border-amber-500:visible').first()
  await expect(box).toBeVisible()
  const bg = (loc: typeof box) => loc.evaluate(el => getComputedStyle(el).backgroundColor)

  await setDev(page, { globalColorMode: 'dark', experimentColorMode: 'light', devPalette: 'default' })
  await expect(html).toHaveAttribute('data-sd-palette', 'default')
  const toolbarBefore = await bg(toolbar)
  const boxBefore = await bg(box)

  await setDev(page, { devPalette: 'london' })
  await expect(html).toHaveAttribute('data-sd-palette', 'london')
  await expect.poll(() => bg(toolbar)).not.toBe(toolbarBefore)
  expect(await bg(box)).toBe(boxBefore)

  await page.reload()
  await expect(html).toHaveAttribute('data-sd-palette', 'london')
  await expect(box).toBeVisible()
  expect(await bg(box)).toBe(boxBefore)
})
