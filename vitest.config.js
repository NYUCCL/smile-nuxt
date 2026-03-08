import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      // Map legacy @/core/... import paths to new locations
      '@/core/timeline': resolve(__dirname, 'src/runtime/core/timeline'),
      '@/core/stepper': resolve(__dirname, 'src/runtime/core/stepper'),
      '@/core/utils': resolve(__dirname, 'src/runtime/utils'),
      '@/core/stores': resolve(__dirname, 'src/runtime/stores'),
      '@/core/composables': resolve(__dirname, 'src/runtime/composables'),
      '@/core/config': resolve(__dirname, 'src/runtime/core/config'),
      '@/core/plugins': resolve(__dirname, 'src/runtime/plugins'),
      // Stub #imports so vi.mock('#imports') can intercept it
      '#imports': resolve(__dirname, 'test/setup/nuxt-imports-stub.js'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['test/**/*.test.{js,ts}'],
    exclude: ['test/basic.test.ts'],
    setupFiles: ['./test/setup/mocks.js'],
  },
})
