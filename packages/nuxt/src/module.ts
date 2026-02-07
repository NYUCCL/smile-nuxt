import { defineNuxtModule, addPlugin, createResolver } from '@nuxt/kit'
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
  },
})
