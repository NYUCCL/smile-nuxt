import { defineConfig, devices } from '@playwright/test'

// A dedicated port so a dev server already running on 3000 (another project)
// is never mistaken for this one by reuseExistingServer. Override with SMILE_E2E_PORT.
const PORT = Number(process.env.SMILE_E2E_PORT ?? 3100)

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false, // experiment flow tests are sequential
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // single worker — tests share browser state
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 1200, height: 900 },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'pnpm run dev',
    port: PORT,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
