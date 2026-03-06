import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.{js,ts}'],
    // Exclude the e2e/SSR test that requires Nuxt test-utils setup
    exclude: ['test/basic.test.ts'],
  },
})
