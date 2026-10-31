import { chromium, type FullConfig } from '@playwright/test'

/**
 * Warm up the dev server before any test runs (#54).
 *
 * A fresh `nuxt dev` process compiles routes and modules on first request, and
 * the first page load can trigger a full reload while that finishes. A test
 * that happens to run first then sees its navigation aborted
 * (net::ERR_ABORTED) or an element detached mid-click. CI always starts cold.
 *
 * Playwright starts the webServer before globalSetup, so here we load the main
 * pages once and wait for each to stop navigating on its own before the suite
 * begins.
 */

// Pages that pull in most of the app: the participant flow and the dev tools.
const WARM_ROUTES = ['/welcome', '/consent', '/demograph', '/instructions', '/dev/', '/dev/welcome']

const QUIET_MS = 1_500 // no self-navigation for this long = settled
const ROUTE_TIMEOUT_MS = 60_000

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL
  if (!baseURL) return

  const started = Date.now()
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ baseURL })
    const page = await context.newPage()

    for (const route of WARM_ROUTES) {
      await settle(page, route)
    }
    console.log(`[e2e warm-up] dev server warm (${((Date.now() - started) / 1000).toFixed(1)}s)`)
  }
  finally {
    await browser.close()
  }
}

/** Load `route`, retrying aborted loads, until the page stays put for QUIET_MS. */
async function settle(page: import('@playwright/test').Page, route: string) {
  const deadline = Date.now() + ROUTE_TIMEOUT_MS
  let lastNav: number // set after each load and by onNav
  const onNav = (frame: import('@playwright/test').Frame) => {
    if (frame === page.mainFrame()) lastNav = Date.now()
  }
  page.on('framenavigated', onNav)
  try {
    while (Date.now() < deadline) {
      try {
        await page.goto(route, { waitUntil: 'load', timeout: ROUTE_TIMEOUT_MS })
      }
      catch {
        // Aborted by a reload in progress; try again.
        await page.waitForTimeout(500)
        continue
      }
      lastNav = Date.now()
      while (Date.now() - lastNav < QUIET_MS && Date.now() < deadline) {
        await page.waitForTimeout(250)
      }
      if (Date.now() - lastNav >= QUIET_MS) return
    }
    console.warn(`[e2e warm-up] ${route} did not settle within ${ROUTE_TIMEOUT_MS / 1000}s`)
  }
  finally {
    page.off('framenavigated', onNav)
  }
}
