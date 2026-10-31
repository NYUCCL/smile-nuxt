import { defineConfig, devices } from '@playwright/test'

// No webServer here — scripts/test-overrides.mjs starts `nuxt dev` and waits for
// it to be ready before invoking playwright.
export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  // The dev server compiles routes on first request, so the very first
  // navigation can take well over the default 5s assertion timeout on a cold
  // CI runner. Give assertions room for that first on-demand compile.
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // scripts/test-overrides.mjs starts the server on this port and passes it in.
    baseURL: `http://localhost:${process.env.SMILE_E2E_PORT ?? 3100}`,
    screenshot: 'only-on-failure',
    viewport: { width: 1200, height: 900 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
