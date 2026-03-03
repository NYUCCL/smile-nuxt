import { defineNuxtModule, addPlugin, addImports, addLayout, addRouteMiddleware, createResolver, extendPages } from '@nuxt/kit'
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

    // Register timeline plugin (client-only — requires browser APIs and Pinia)
    addPlugin(resolver.resolve('./runtime/plugins/timeline.client'))

    // Register global navigation guard middleware
    addRouteMiddleware({
      name: 'smile-timeline',
      path: resolver.resolve('./runtime/middleware/timeline.global'),
      global: true,
    })

    // Register layouts
    addLayout({ src: resolver.resolve('./runtime/layouts/experiment.vue'), filename: 'experiment.vue' })
    addLayout({ src: resolver.resolve('./runtime/layouts/development.vue'), filename: 'development.vue' })
    addLayout({ src: resolver.resolve('./runtime/layouts/presentation.vue'), filename: 'presentation.vue' })

    // Register catch-all page for experiment routes + dev/presentation mode pages
    extendPages((pages) => {
      pages.push({
        name: 'slug',
        path: '/:slug(.*)*',
        file: resolver.resolve('./runtime/pages/[...slug].vue'),
      })
      pages.push({
        name: 'dev-slug',
        path: '/dev/:slug(.*)*',
        file: resolver.resolve('./runtime/pages/dev/[...slug].vue'),
      })
      pages.push({
        name: 'presentation-slug',
        path: '/presentation/:slug(.*)*',
        file: resolver.resolve('./runtime/pages/presentation/[...slug].vue'),
      })
    })

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
