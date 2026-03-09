// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

// Run `npx @eslint/config-inspector` to inspect the resolved config interactively
export default createConfigForNuxt({
  features: {
    // Rules for module authors
    tooling: true,
    // Rules for formatting
    stylistic: true,
  },
  dirs: {
    src: [
      './playground',
    ],
  },
})
  .prepend({
    ignores: [
      'docs/**',
      'plans/**',
      'start/**',
    ],
  })
  .append(
    {
      rules: {
        // UI components use single-word names (Button, Card, etc.)
        'vue/multi-word-component-names': 'off',
      },
    },
    {
      // Test files frequently create variables for side effects (tree building)
      files: ['test/**/*.{js,ts}'],
      rules: {
        'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
      },
    },
  )
