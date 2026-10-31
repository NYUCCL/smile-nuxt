import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
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
      // Stub #imports so vi.mock('#imports') can intercept it
      '#imports': resolve(import.meta.dirname, 'test/setup/nuxt-imports-stub.js'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['test/**/*.test.{js,ts}'],
    exclude: ['test/basic.test.ts'],
    setupFiles: ['./test/setup/mocks.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,ts,vue}'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
    },
  },
})
