import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'

// The timing tests in StepperPerformance.test.js measure the code's speed, so
// they need the machine to themselves: next to 80 other test files, or under
// coverage instrumentation, they fail on time alone. `pnpm test:perf` runs them.
const perfRun = !!process.env.SMILE_PERF_TESTS

// Nuxt replaces import.meta.dev, .client and .server when it builds. Under
// vitest they are undefined, so the code behind them never ran. This puts a
// global in their place that a test can set (test/setup/flags.js). Unset, a
// global is undefined, as before. Each name is as long as the text it
// replaces, so line and column numbers (and coverage) stay exact.
const FLAGS = {
  'import.meta.dev': 'globalThis.SDEV',
  'import.meta.client': 'globalThis.SCLIENT',
  'import.meta.server': 'globalThis.SSERVER',
}
const smileFlags = {
  name: 'smile-test-flags',
  enforce: 'pre',
  transform(code, id) {
    if (!id.includes('/src/') || !code.includes('import.meta.')) return null
    return { code: code.replace(/import\.meta\.(dev|client|server)\b/g, match => FLAGS[match]), map: null }
  },
}

export default defineConfig({
  plugins: [smileFlags, vue()],
  resolve: {
    alias: {
      // Map legacy @/core/... import paths to new locations
      '@/core/timeline': resolve(import.meta.dirname, 'src/runtime/core/timeline'),
      '@/core/stepper': resolve(import.meta.dirname, 'src/runtime/core/stepper'),
      '@/core/utils': resolve(import.meta.dirname, 'src/runtime/utils'),
      '@/core/stores': resolve(import.meta.dirname, 'src/runtime/stores'),
      '@/core/composables': resolve(import.meta.dirname, 'src/runtime/composables'),
      '@/core/config': resolve(import.meta.dirname, 'src/runtime/core/config'),
      '@/core/plugins': resolve(import.meta.dirname, 'src/runtime/plugins'),
      // The module's own aliases (src/module.ts)
      '#smile-dev': resolve(import.meta.dirname, 'src/runtime/components/dev'),
      '#smile-composables': resolve(import.meta.dirname, 'src/runtime/composables'),
      // The list of public files the module writes at build time
      '#build/smile-public-files.mjs': resolve(import.meta.dirname, 'test/setup/public-files-stub.js'),
      // Stub #imports so vi.mock('#imports') can intercept it
      '#imports': resolve(import.meta.dirname, 'test/setup/nuxt-imports-stub.js'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['test/**/*.test.{js,ts}'],
    exclude: ['test/basic.test.ts', ...(perfRun ? [] : ['test/core/stepper/StepperPerformance.test.js'])],
    setupFiles: ['./test/setup/mocks.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,ts,vue}'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      // A floor a little under the numbers on 2026-11-27 (94.6% lines, 94.3%
      // statements, 94.3% branches, 95.0% functions), so coverage can't drop
      // unnoticed. Raise it as coverage goes up.
      thresholds: { lines: 93, statements: 93, branches: 93, functions: 93 },
    },
  },
})
