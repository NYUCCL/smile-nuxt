import { test, expect } from '@playwright/test'

// Verifies the override/resolution claims from docs/coding/organization.md against
// a REAL non-workspace consumer install (packed tarball). The dev server is started
// by scripts/test-overrides.mjs; this spec only drives the browser.

test('built-in view override (string-referenced) wins everywhere', async ({ page }) => {
  await page.goto('/welcome')
  await expect(page.getByTestId('ad-marker')).toHaveText('OVERRIDE_AD_MARKER')
})

test('project composable is auto-imported (no collision)', async ({ page }) => {
  await page.goto('/welcome')
  await expect(page.getByTestId('probe-value')).toHaveText('probe:PROBE_OK_42')
})

test('local Button override applies in the project\'s own template', async ({ page }) => {
  await page.goto('/welcome')
  const btn = page.getByTestId('ad-button')
  await expect(btn).toBeVisible()
  await expect(btn).toHaveAttribute('data-override-button', 'yes')
})

test('public project asset is reachable at URL root', async ({ page }) => {
  const resp = await page.request.get('/test-override.png')
  expect(resp.status()).toBe(200)
  expect(resp.headers()['content-type']).toContain('image/png')
})

test('module asset coexists at /_smile/images/ (separate namespace)', async ({ page }) => {
  // Correct path per the docs fix.
  const ok = await page.request.get('/_smile/images/smile.svg')
  expect(ok.status()).toBe(200)
  // The doc previously claimed this (wrong) path — it must 404.
  const bad = await page.request.get('/_smile/smile.svg')
  expect(bad.status()).toBe(404)
})

test('CSS theme token override wins (app.css loads after main.css)', async ({ page }) => {
  await page.goto('/welcome')
  await expect(page.getByTestId('ad-marker')).toBeVisible()
  const primary = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
  )
  expect(primary).toContain('0.55 0.2 250')
})

test('CSS rule override wins at equal specificity', async ({ page }) => {
  await page.goto('/welcome')
  await expect(page.getByTestId('ad-marker')).toBeVisible()
  const outline = await page.evaluate(() => {
    const el = document.querySelector('.ad-override')
    return el ? getComputedStyle(el).outlineColor : null
  })
  expect(outline).toBe('rgb(7, 113, 200)')
})

// Documents the actual (warn-not-block) behavior: a local primitive override DOES
// propagate into the module's built-in views. The build warning (checked by the
// runner) is what protects users from doing this by accident.
test('local Button override propagates into module built-in views (warned, not blocked)', async ({ page }) => {
  await page.goto('/consent')
  await page.waitForLoadState('networkidle')
  await page.locator('button').first().waitFor()
  const overridden = await page.locator('button[data-override-button="yes"]').count()
  expect(overridden).toBeGreaterThan(0)
})
