import { test, expect } from '@playwright/test'

/**
 * The dev tools' step panel follows the current view. Its state comes from the
 * shared ViewAPI instance; that instance used to be created in the first
 * view's component scope, so its watchers stopped when that view unmounted
 * and the panel kept showing the old view's steps.
 */
test('step panel clears when leaving a view with steps', async ({ page }) => {
  await page.goto('/dev/stroop')
  const pinia = () => page.evaluate(() => {
    type Root = Element & { __vue_app__: { config: { globalProperties: { $pinia: { _s: Map<string, { dev: Record<string, unknown> }> } } } } }
    const store = (document.querySelector('#__nuxt') as Root).__vue_app__.config.globalProperties.$pinia._s.get('smilestore')!
    store.dev.showSideBar = true
    store.dev.sideBarTab = 'steps'
  })
  await expect(page.locator('nav')).toBeVisible({ timeout: 10000 })
  await pinia()
  const panel = page.locator('.sidebar')
  await expect(panel).toContainText('stroop/')

  // Client-side navigation to a view without steps
  await page.evaluate(() => {
    type Root = Element & { __vue_app__: { config: { globalProperties: { $router: { push: (_path: string) => void } } } } }
    ;(document.querySelector('#__nuxt') as Root).__vue_app__.config.globalProperties.$router.push('/dev/')
  })
  await expect(page).toHaveURL(/\/dev\/?$/)
  await expect(panel).not.toContainText('stroop/')
})
