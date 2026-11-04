import { test, expect } from '@playwright/test'
import { clearState } from './helpers'

// The dev tools' read-only build & deploy settings page (rail mode 'config').
// The playground reads the repo root's env files (vite.envDir '..'), so these
// assert on structure and on what that tracked .env sets, not on exact copy.
test.describe('Build & deploy settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/welcome')
    await clearState(page)
    await page.goto('/dev/welcome')
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 })
  })

  test('the rail opens the page, and clicking again goes back to developer mode', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Build & deploy settings' })
    await button.click()
    const view = page.getByTestId('build-config')
    await expect(view.getByRole('navigation')).toContainText('Build & deploy settings')
    await button.click()
    await expect(view).not.toBeVisible()
    await expect(page.locator('nav')).toBeVisible()
  })

  test('shows what a deploy will do, the findings, and every setting with its source', async ({ page }) => {
    const responses: string[] = []
    page.on('response', async (r) => {
      if (r.url().includes('/_smile/dev-config')) responses.push(await r.text())
    })
    await page.getByRole('button', { name: 'Build & deploy settings' }).click()
    const view = page.getByTestId('build-config')

    // The deploy summary: one line per question
    for (const id of ['devtools', 'dev', 'presentation', 'database', 'authsecret', 'saving']) {
      await expect(view.getByTestId(`deploy-${id}`)).toBeVisible()
    }
    await expect(view.getByTestId('deploy-devtools')).toContainText('Are the dev tools in the build?')

    // A setting from the tracked .env, with where it comes from and how to change it
    const row = view.getByTestId('setting-VITE_MAX_WRITES')
    await expect(row.getByTestId('value')).toContainText('.env')
    await expect(row).toContainText('Change it')

    // A secret shows only whether it's set
    await expect(view.getByTestId('setting-SMILE_DEV_PASSWORD').getByTestId('value')).toContainText(/set \(|not set/)
    expect(responses.length).toBeGreaterThan(0)
    expect(responses.join('')).not.toMatch(/"SMILE_DEV_PASSWORD"[^}]*"value":"/)

    // A line opens to say why; its keys jump to their rows
    await view.getByTestId('deploy-saving').locator('summary').click()
    await view.getByTestId('deploy-saving').getByRole('button', { name: 'VITE_AUTO_SAVE_DATA' }).click()
    await expect(view.getByTestId('setting-VITE_AUTO_SAVE_DATA')).toBeInViewport()
    await expect(view.getByTestId('setting-VITE_AUTO_SAVE_DATA')).toHaveAttribute('open', '')
  })

  test('the filter narrows the settings', async ({ page }) => {
    await page.getByRole('button', { name: 'Build & deploy settings' }).click()
    const view = page.getByTestId('build-config')
    await view.getByLabel('Filter settings').fill('TURSO')
    await expect(view.getByTestId('setting-TURSO_DATABASE_URL')).toBeVisible()
    await expect(view.getByTestId('setting-VITE_MAX_WRITES')).toHaveCount(0)
  })

  test('the route answers only at localhost and only to GET', async ({ request }) => {
    expect((await request.get('/_smile/dev-config')).status()).toBe(200)
    expect((await request.get('/_smile/dev-config', { headers: { host: 'evil.example' } })).status()).toBe(403)
    expect((await request.post('/_smile/dev-config')).status()).toBe(405)
  })
})
