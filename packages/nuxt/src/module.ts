import { defineNuxtModule, addPlugin, addImports, createResolver } from '@nuxt/kit'
import { fileURLToPath } from 'url'

// Module options TypeScript interface definition
export interface ModuleOptions {}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@gureckislab/smile',
    configKey: 'smile',
  },
  // Default configuration options of the Nuxt module
  defaults: {},
  setup(_options, _nuxt) {
    const resolver = createResolver(import.meta.url)
    const runtimeDir = fileURLToPath(new URL('./runtime', import.meta.url))

    // Transpile runtime directory so .js files are processed
    _nuxt.options.build.transpile.push(runtimeDir)

    // Do not add the extension since the `.ts` will be transpiled to `.mjs` after `pnpm run prepack`
    addPlugin(resolver.resolve('./runtime/plugin'))

    // Auto-import composables so they're available in consuming apps without explicit imports
    addImports([
      { name: 'default', as: 'useAPI', from: resolver.resolve('./runtime/composables/useAPI') },
      { name: 'default', as: 'useViewAPI', from: resolver.resolve('./runtime/composables/useViewAPI') },
      { name: 'default', as: 'useTimeline', from: resolver.resolve('./runtime/composables/useTimeline') },
      { name: 'default', as: 'useStepper', from: resolver.resolve('./runtime/composables/useStepper') },
      { name: 'useSmileColorMode', from: resolver.resolve('./runtime/composables/useColorMode') },
      { name: 'getColorMode', from: resolver.resolve('./runtime/composables/useColorMode') },
      { name: 'setColorMode', from: resolver.resolve('./runtime/composables/useColorMode') },
    ])
  },
})
