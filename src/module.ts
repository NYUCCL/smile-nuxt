import { defineNuxtModule, addPlugin, addImports, addLayout, addRouteMiddleware, createResolver, extendPages, addComponentsDir, addServerScanDir, addServerImportsDir } from '@nuxt/kit'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

// Module options TypeScript interface definition
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ModuleOptions {}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@nyuccl/smile',
    configKey: 'smile',
  },
  // Default configuration options of the Nuxt module
  defaults: {},
  setup(_options, _nuxt) {
    const resolver = createResolver(import.meta.url)
    const runtimeDir = fileURLToPath(new URL('./runtime', import.meta.url))

    // Experiments are pure client-side apps (no SEO needed, dynamic state).
    // Disable SSR for fast SPA-style navigation without server round-trips.
    _nuxt.options.ssr = false

    // Transpile runtime directory so .js files are processed
    _nuxt.options.build.transpile.push(runtimeDir)

    // Register server routes, middleware, and utilities from runtime/server/
    addServerScanDir(resolver.resolve('./runtime/server'))
    addServerImportsDir(resolver.resolve('./runtime/server/utils'))

    // Runtime config: server-only secrets + public experiment config
    _nuxt.options.runtimeConfig = _nuxt.options.runtimeConfig || {}
    _nuxt.options.runtimeConfig.smile = {
      devPassword: process.env.SMILE_DEV_PASSWORD || '',
      tursoUrl: process.env.TURSO_DATABASE_URL || '',
      tursoAuthToken: process.env.TURSO_AUTH_TOKEN || '',
    }
    _nuxt.options.runtimeConfig.public = _nuxt.options.runtimeConfig.public || {}
    _nuxt.options.runtimeConfig.public.smile = {
      codeName: process.env.VITE_CODE_NAME || '',
      projectRef: process.env.VITE_PROJECT_REF || '',
    }

    // Alias for dev components — layouts are copied into .nuxt/ so relative imports break;
    // this alias lets layouts import dev components via '#smile-dev/...'
    _nuxt.options.alias['#smile-dev'] = resolver.resolve('./runtime/components/dev')

    // Register Tailwind CSS via Vite plugin
    _nuxt.options.vite.plugins = _nuxt.options.vite.plugins || []
    _nuxt.options.vite.plugins.push(tailwindcss())

    // Pre-bundle CJS dependencies so Vite converts them to ESM for the browser
    _nuxt.options.vite.optimizeDeps = _nuxt.options.vite.optimizeDeps || {}
    _nuxt.options.vite.optimizeDeps.include = _nuxt.options.vite.optimizeDeps.include || []
    _nuxt.options.vite.optimizeDeps.include.push(
      '@nyuccl/smile > seedrandom',
      '@nyuccl/smile > lodash',
      '@nyuccl/smile > clipboard',
      '@nyuccl/smile > crypto-js/sha256',
      '@nyuccl/smile > crypto-js/enc-base64',
      '@nyuccl/smile > json-stable-stringify',
      '@nyuccl/smile > qrcode-svg',
    )

    // Add global CSS (Tailwind theme + SMILE styles)
    _nuxt.options.css.push(resolver.resolve('./runtime/css/main.css'))

    // Client-only plugins — order matters:
    // 1. store-sync: patches localState from localStorage, sets up cookie/localStorage watchers
    addPlugin(resolver.resolve('./runtime/plugins/store-sync.client'))
    // 2. seed: initializes global random seed (needs patched localState)
    addPlugin(resolver.resolve('./runtime/plugins/seed.client'))
    // 3. dev-sync: syncs dev cookie (after store is fully initialized)
    addPlugin(resolver.resolve('./runtime/plugins/dev-sync.client'))
    // 4. timeline: creates timeline instance (needs seed set)
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
      pages.push({
        name: 'dev-login',
        path: '/dev-login',
        file: resolver.resolve('./runtime/pages/dev-login.vue'),
      })
      pages.push({
        name: 'info',
        path: '/info',
        file: resolver.resolve('./runtime/pages/info.vue'),
      })
    })

    // Register UI component directories for auto-import
    addComponentsDir({ path: resolver.resolve('./runtime/components/ui'), pathPrefix: false, global: true, extensions: ['vue'] })
    addComponentsDir({ path: resolver.resolve('./runtime/components/forms'), pathPrefix: false, global: true, extensions: ['vue'] })
    addComponentsDir({ path: resolver.resolve('./runtime/components/layouts'), pathPrefix: false, global: true, extensions: ['vue'] })
    addComponentsDir({ path: resolver.resolve('./runtime/components/builtins'), pathPrefix: false, global: true, extensions: ['vue'] })

    // Auto-import composables and core classes so they're available in consuming apps without explicit imports
    addImports([
      { name: 'default', as: 'useAPI', from: resolver.resolve('./runtime/composables/useAPI') },
      { name: 'default', as: 'useViewAPI', from: resolver.resolve('./runtime/composables/useViewAPI') },
      { name: 'default', as: 'useTimeline', from: resolver.resolve('./runtime/composables/useTimeline') },
      { name: 'default', as: 'useStepper', from: resolver.resolve('./runtime/composables/useStepper') },
      { name: 'useSmileColorMode', from: resolver.resolve('./runtime/composables/useColorMode') },
      { name: 'getColorMode', from: resolver.resolve('./runtime/composables/useColorMode') },
      { name: 'setColorMode', from: resolver.resolve('./runtime/composables/useColorMode') },
      { name: 'default', as: 'Timeline', from: resolver.resolve('./runtime/core/timeline/Timeline') },
      { name: 'cn', from: resolver.resolve('./runtime/lib/utils') },
      { name: 'default', as: 'useSmileStore', from: resolver.resolve('./runtime/stores/smilestore') },
      { name: 'default', as: 'useLog', from: resolver.resolve('./runtime/stores/log') },
    ])
  },
})
