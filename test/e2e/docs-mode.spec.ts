import { test, expect } from '@playwright/test'
import { clearState } from './helpers'

/**
 * Docs mode: the docs that ship with the module, rendered inside the dev tools
 * (components/dev/docs, server/dev/docs.ts).
 */
test.describe('Docs mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/welcome')
    await clearState(page)
    await page.goto('/dev/welcome')
    await page.getByRole('button', { name: 'Docs', exact: true }).click()
    await expect(page.getByTestId('docs-page')).toBeVisible({ timeout: 15000 })
  })

  test('opens on the introduction, with the page list', async ({ page }) => {
    // The introduction's title is the SMILE logo
    await expect(page.getByTestId('docs-page').locator('img[src="/__smile/docs/images/smile.svg"]')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Docs pages' }).getByRole('button', { name: 'Introduction' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('navigation', { name: 'Docs pages' }).getByRole('button', { name: 'Timeline and Design File' })).toBeVisible()
  })

  test('shows a page with its diagram', async ({ page }) => {
    await page.getByRole('button', { name: 'Timeline and Design File' }).click()
    const article = page.getByTestId('docs-page')
    await expect(article.locator('h1')).toHaveText('Timeline and Design File')
    const figure = article.locator('img[src="/__smile/docs/images/timeline.svg"]')
    await expect(figure).toBeVisible()
    // The image actually loaded
    expect(await figure.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  })

  test('a link to another page opens it here, at the heading', async ({ page }) => {
    await page.getByRole('button', { name: 'Overriding Builtins' }).click()
    const article = page.getByTestId('docs-page')
    await article.locator('a[data-docs-page="coding/timeline.md"][data-docs-hash="overriding-a-built-in-view"]').first().click()
    await expect(article.locator('h1')).toHaveText('Timeline and Design File')
    await expect(article.locator('#overriding-a-built-in-view')).toBeInViewport()
  })

  test('"On this page" jumps to a heading and marks it', async ({ page }) => {
    await page.getByRole('button', { name: 'Timeline and Design File' }).click()
    const toc = page.getByTestId('docs-toc')
    await toc.getByRole('link', { name: 'Randomized nodes' }).click()
    await expect(page.getByTestId('docs-page').locator('#randomized-nodes')).toBeInViewport()
    await expect(toc.locator('[aria-current="location"]')).toHaveText('Randomized nodes')
  })

  test.describe('code blocks', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

    test('are highlighted, and copy their code', async ({ page }) => {
      await page.getByRole('button', { name: 'Timeline and Design File' }).click()
      const block = page.getByTestId('docs-page').locator('.sd-docs-code-body').first()
      await expect(block.locator('pre.shiki')).toBeVisible()
      await block.hover()
      await block.getByRole('button', { name: 'Copy code' }).click()
      await expect(block.getByRole('button', { name: 'Copy code' })).toHaveClass(/copied/)
      const copied = await page.evaluate(() => navigator.clipboard.readText())
      expect(copied).toBe(await block.locator('pre code').textContent())
    })
  })

  test('the pager goes to the next and previous pages', async ({ page }) => {
    await page.getByRole('button', { name: 'Timeline and Design File' }).click()
    const pager = page.getByTestId('docs-pager')
    await pager.getByRole('button', { name: /Next page/ }).click()
    await expect(page.getByTestId('docs-page').locator('h1')).toHaveText('Stepping Through Trials')
    await pager.getByRole('button', { name: /Previous page/ }).click()
    await expect(page.getByTestId('docs-page').locator('h1')).toHaveText('Timeline and Design File')
  })

  test('search finds a section and jumps to it', async ({ page }) => {
    await page.getByTestId('docs-search').fill('randomized node')
    const first = page.getByTestId('docs-results').getByRole('button').first()
    await expect(first).toContainText('Randomized nodes')
    await first.click()
    await expect(page.getByTestId('docs-page').locator('#randomized-nodes')).toBeInViewport()
  })

  test('reopens the page you were on', async ({ page }) => {
    await page.getByRole('button', { name: 'Data Storage' }).click()
    await expect(page.getByTestId('docs-page').locator('h1')).toHaveText('Data Storage')
    await page.reload()
    await expect(page.getByTestId('docs-page').locator('h1')).toHaveText('Data Storage', { timeout: 15000 })
  })

  test('the docs route answers only for docs pages', async ({ request }) => {
    expect((await request.get('/__smile/docs/page?path=coding/steps.md')).ok()).toBe(true)
    expect((await request.get('/__smile/docs/page?path=../../package.json')).status()).toBe(404)
  })
})
