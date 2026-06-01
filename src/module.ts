import { defineNuxtModule, addPlugin, addImports, addLayout, addRouteMiddleware, createResolver, extendPages, addComponentsDir, addServerScanDir, addServerImportsDir, useLogger } from '@nuxt/kit'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { basename, dirname, extname, join } from 'node:path'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'

// Module options TypeScript interface definition
export interface ModuleOptions {
  /**
   * Paths (relative to public/) of images to warm into the browser cache
   * when api.preloadAllImages() is called from a built-in or custom view.
   * @example ['stimuli/dog.png', 'stimuli/cat.png']
   */
  preloadImages?: string[]
  /**
   * Paths (relative to public/) of videos to warm into the browser cache
   * when api.preloadAllVideos() is called.
   */
  preloadVideos?: string[]
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@nyuccl/smile-nuxt',
    configKey: 'smile',
  },
  defaults: {
    preloadImages: [],
    preloadVideos: [],
  },
  setup(_options, _nuxt) {
    const resolver = createResolver(import.meta.url)
    const runtimeDir = fileURLToPath(new URL('./runtime', import.meta.url))
    const _require = createRequire(import.meta.url)

    // Experiments are pure client-side apps (no SEO needed, dynamic state).
    // Disable SSR for fast SPA-style navigation without server round-trips.
    _nuxt.options.ssr = false

    // Transpile runtime directory so .js files are processed
    _nuxt.options.build.transpile.push(runtimeDir)

    // Exclude local SQLite database from file watchers to prevent rebuild
    // loops (the migrate plugin writes to .data/experiment.db on startup)
    _nuxt.options.nitro = _nuxt.options.nitro || {}
    _nuxt.options.nitro.watchOptions = _nuxt.options.nitro.watchOptions || {}
    _nuxt.options.nitro.watchOptions.ignored = _nuxt.options.nitro.watchOptions.ignored || []
    if (Array.isArray(_nuxt.options.nitro.watchOptions.ignored)) {
      _nuxt.options.nitro.watchOptions.ignored.push('**/.data/**')
    }
    _nuxt.options.watchers = _nuxt.options.watchers || {} as typeof _nuxt.options.watchers
    _nuxt.options.watchers.chokidar = _nuxt.options.watchers.chokidar || {}
    _nuxt.options.watchers.chokidar.ignored = _nuxt.options.watchers.chokidar.ignored || []
    if (Array.isArray(_nuxt.options.watchers.chokidar.ignored)) {
      _nuxt.options.watchers.chokidar.ignored.push('**/.data/**')
    }

    // Serve module static assets (e.g. smile.svg) at /_smile/
    _nuxt.options.nitro.publicAssets = _nuxt.options.nitro.publicAssets || []
    _nuxt.options.nitro.publicAssets.push({
      dir: resolver.resolve('./runtime/public'),
      baseURL: '/_smile',
    })

    // Register server routes, middleware, and utilities from runtime/server/
    addServerScanDir(resolver.resolve('./runtime/server'))
    addServerImportsDir(resolver.resolve('./runtime/server/utils'))

    // Runtime config: server-only secrets + public experiment config
    _nuxt.options.runtimeConfig = _nuxt.options.runtimeConfig || {}
    _nuxt.options.runtimeConfig.smile = {
      devPassword: process.env.SMILE_DEV_PASSWORD || '',
      publicPresentation: process.env.SMILE_PUBLIC_PRESENTATION === 'true',
      tursoUrl: process.env.TURSO_DATABASE_URL || '',
      tursoAuthToken: process.env.TURSO_AUTH_TOKEN || '',
    }
    _nuxt.options.runtimeConfig.public = _nuxt.options.runtimeConfig.public || {}
    _nuxt.options.runtimeConfig.public.smile = {
      codeName: process.env.VITE_CODE_NAME || 'unnamed-experiment',
      projectRef: process.env.VITE_PROJECT_REF || 'local-experiment-main',
      owner: process.env.VITE_GIT_OWNER || 'local',
      repo: process.env.VITE_GIT_REPO_NAME || 'experiment',
      branch: process.env.VITE_GIT_BRANCH_NAME || 'main',
      preloadImages: _options.preloadImages || [],
      preloadVideos: _options.preloadVideos || [],
    }

    // Aliases for layouts — layouts are copied into .nuxt/ so relative imports break;
    // these aliases let layouts import dev components and composables reliably
    _nuxt.options.alias['#smile-dev'] = resolver.resolve('./runtime/components/dev')
    _nuxt.options.alias['#smile-composables'] = resolver.resolve('./runtime/composables')

    // Resolve module dependencies so that .vue component files inside
    // node_modules/@nyuccl/smile-nuxt/dist/runtime/ can import them correctly
    // (pnpm strict isolation prevents Vite from resolving across package boundaries)
    for (const dep of ['lucide-vue-next', '@vueuse/core', 'motion', 'clipboard']) {
      _nuxt.options.alias[dep] = dirname(_require.resolve(`${dep}/package.json`))
    }

    // Dedupe shared singletons: when the module is installed into a consumer
    // (via link: or normal npm), pnpm's strict isolation may resolve `vue` and
    // `pinia` to two different copies — one from the module's node_modules,
    // one from the consumer's. That breaks Pinia (setActivePinia registers on
    // one instance, getActivePinia reads from the other) and creates subtle
    // bugs with Vue reactivity. Forcing dedupe collapses them to a single copy.
    _nuxt.options.vite.resolve = _nuxt.options.vite.resolve || {}
    _nuxt.options.vite.resolve.dedupe = _nuxt.options.vite.resolve.dedupe || []
    if (Array.isArray(_nuxt.options.vite.resolve.dedupe)) {
      for (const dep of ['vue', 'pinia']) {
        if (!_nuxt.options.vite.resolve.dedupe.includes(dep)) {
          _nuxt.options.vite.resolve.dedupe.push(dep)
        }
      }
    }

    // Inject SMILE version so config.js can read it via import.meta.env
    let smileVersion = '0.0.0'
    try {
      const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8'))
      smileVersion = pkg.version
    }
    catch { /* ignored */ }
    _nuxt.options.vite.define = _nuxt.options.vite.define || {}
    _nuxt.options.vite.define['import.meta.env.VITE_SMILE_VERSION'] = JSON.stringify(smileVersion)

    // Register Tailwind CSS via Vite plugin
    _nuxt.options.vite.plugins = _nuxt.options.vite.plugins || []
    _nuxt.options.vite.plugins.push(tailwindcss())

    // Pre-bundle CJS dependencies so Vite converts them to ESM for the browser
    _nuxt.options.vite.optimizeDeps = _nuxt.options.vite.optimizeDeps || {}
    _nuxt.options.vite.optimizeDeps.include = _nuxt.options.vite.optimizeDeps.include || []
    _nuxt.options.vite.optimizeDeps.include.push(
      '@nyuccl/smile-nuxt > seedrandom',
      '@nyuccl/smile-nuxt > lodash',
      '@nyuccl/smile-nuxt > clipboard',
      '@nyuccl/smile-nuxt > crypto-js/sha256',
      '@nyuccl/smile-nuxt > crypto-js/enc-base64',
      '@nyuccl/smile-nuxt > json-stable-stringify',
      '@nyuccl/smile-nuxt > qrcode-svg',
      '@nyuccl/smile-nuxt > lucide-vue-next',
      '@nyuccl/smile-nuxt > reka-ui',
      '@nyuccl/smile-nuxt > reka-ui/date',
      '@nyuccl/smile-nuxt > @internationalized/date',
      '@nyuccl/smile-nuxt > vue-sonner',
      '@nyuccl/smile-nuxt > class-variance-authority',
      '@nyuccl/smile-nuxt > clsx',
      '@nyuccl/smile-nuxt > tailwind-merge',
      '@nyuccl/smile-nuxt > @vueuse/core',
      '@nyuccl/smile-nuxt > uuid',
      '@nyuccl/smile-nuxt > axios',
      '@nyuccl/smile-nuxt > motion',
    )

    // Add global CSS (Tailwind theme + SMILE styles).
    // Unshift (not push) so the module's stylesheet loads BEFORE the consumer's
    // CSS array entries. That way a consumer's `assets/css/app.css` overrides
    // the module's theme tokens at equal specificity.
    _nuxt.options.css.unshift(resolver.resolve('./runtime/css/main.css'))

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
      // Info page is now rendered inside the dev layout (mainView = 'info')
    })

    // Register UI component directories for auto-import
    // priority: -1 ensures user's local components/ override these module-provided ones (issue #10)
    addComponentsDir({ path: resolver.resolve('./runtime/components/ui'), pathPrefix: false, global: true, extensions: ['vue'], priority: -1 })
    addComponentsDir({ path: resolver.resolve('./runtime/components/forms'), pathPrefix: false, global: true, extensions: ['vue'], priority: -1 })
    addComponentsDir({ path: resolver.resolve('./runtime/components/layouts'), pathPrefix: false, global: true, extensions: ['vue'], priority: -1 })
    addComponentsDir({ path: resolver.resolve('./runtime/components/builtins'), pathPrefix: false, global: true, extensions: ['vue'], priority: -1 })

    // Ensure local components that override module globals inherit the global flag (issue #10).
    // Without this, a user's local InformedConsentView.vue would win by priority but lose
    // the global: true registration, breaking <component :is="'InformedConsentView'"> resolution.
    //
    // Scan module component dirs at setup time to build a known set of global component names,
    // then in components:extend, promote any user override that shadows a module global.
    const moduleGlobalNames = new Set<string>()
    const moduleComponentDirs = [
      resolver.resolve('./runtime/components/ui'),
      resolver.resolve('./runtime/components/forms'),
      resolver.resolve('./runtime/components/layouts'),
      resolver.resolve('./runtime/components/builtins'),
    ]
    function scanDir(dir: string) {
      try {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry)
          if (statSync(full).isDirectory()) {
            scanDir(full)
          }
          else if (extname(entry) === '.vue') {
            // Convert filename to PascalCase component name
            moduleGlobalNames.add(basename(entry, '.vue'))
          }
        }
      }
      catch { /* ignore unreadable directories */ }
    }
    for (const dir of moduleComponentDirs) {
      scanDir(dir)
    }

    _nuxt.hook('components:extend', (components) => {
      for (const c of components) {
        if (!c.global && moduleGlobalNames.has(c.pascalName)) {
          c.global = true
        }
      }
    })

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

    // Dev server banner: show SMILE-specific URLs after Nuxt's default output
    if (_nuxt.options.dev) {
      const logger = useLogger('smile')
      _nuxt.hook('listen', async (_server, listener) => {
        const { colors } = await import('consola/utils')
        const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8'))
        const fmt = (url: string) => colors.cyan(colors.underline(url))
        const urls = await listener.getURLs()
        const local = urls.find((u: { type: string }) => u.type === 'local')
        if (local) {
          const base = local.url.replace(/\/$/, '')
          logger.info(``)
          logger.info(`  ${colors.bold(`SMILE ${pkg.version}`)}`)
          logger.info(`  Experiment:    ${fmt(base)}`)
          logger.info(`  Dev:           ${fmt(`${base}/dev/`)}`)
          logger.info(`  Presentation:  ${fmt(`${base}/presentation/`)}`)
        }
      })
    }
  },
})
