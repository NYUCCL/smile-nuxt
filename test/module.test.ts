// @vitest-environment node
/**
 * The module's setup (src/module.ts): what it changes in a project's Nuxt
 * options and what it registers, for a dev server and for a build with and
 * without the developer tools. @nuxt/kit is replaced by spies and Nuxt by a
 * plain object with the options the setup reads, so this checks what the
 * module asks Nuxt for, not what Nuxt then does with it (the e2e suite and
 * `pnpm test:starter` cover that).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as kit from '@nuxt/kit'
import smileModule from '../src/module'
import { createDevConfigHandler } from '../src/devconfig/handler'

const fsState = vi.hoisted(() => ({ docs: true as boolean, unreadable: '' }))
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }))

vi.mock('@nuxt/kit', async () => {
  const { dirname, resolve } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  return {
    defineNuxtModule: (definition: unknown) => definition,
    createResolver: (base: string) => ({ resolve: (path: string) => resolve(dirname(fileURLToPath(base)), path) }),
    useLogger: () => logger,
    addDevServerHandler: vi.fn(),
    addPlugin: vi.fn(),
    addImports: vi.fn(),
    addRouteMiddleware: vi.fn(),
    extendPages: vi.fn(),
    addComponentsDir: vi.fn(),
    addServerHandler: vi.fn(),
    addServerScanDir: vi.fn(),
    addServerImportsDir: vi.fn(),
  }
})
vi.mock('@tailwindcss/vite', () => ({ default: () => ({ name: 'tailwind' }) }))
// The handler itself has its own tests (test/devconfig); here it is replaced
// so the two functions the module hands it can be called.
vi.mock('../src/devconfig/handler', async original => ({
  ...(await original<typeof import('../src/devconfig/handler')>()),
  createDevConfigHandler: vi.fn(() => 'the handler'),
}))
// The shipped docs (dist/docs/index.json) exist only after a build, so the
// test decides whether they are there. One directory can be made unreadable.
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return {
    ...fs,
    existsSync: (path: string) => String(path).endsWith('docs/index.json') ? fsState.docs : fs.existsSync(path),
    readdirSync: (path: string, ...rest: never[]) => {
      if (fsState.unreadable && String(path) === fsState.unreadable) throw new Error('EACCES')
      return (fs.readdirSync as (..._args: unknown[]) => unknown)(path, ...rest)
    },
  }
})

const SRC = resolve(import.meta.dirname, '../src')
const VERSION = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf-8')).version

// defineNuxtModule is mocked to hand back the definition
const definition = smileModule as unknown as {
  meta: Record<string, unknown>
  defaults: Record<string, unknown>
  moduleDependencies: Record<string, unknown>
  setup: (_options: Record<string, unknown>, _nuxt: unknown) => void
}

type Hooks = Record<string, ((..._args: any[]) => unknown)[]> // eslint-disable-line @typescript-eslint/no-explicit-any

/** A project's Nuxt, with the options the setup reads */
function makeNuxt(options: Record<string, unknown> = {}) {
  const hooks: Hooks = {}
  const nuxt = {
    options: {
      dev: false,
      ssr: true,
      rootDir: '/project',
      build: { transpile: [] as string[] },
      alias: {} as Record<string, string>,
      vite: {} as Record<string, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
      css: ['~/assets/css/app.css'],
      ...options,
    } as Record<string, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
    hook: (name: string, fn: (..._args: unknown[]) => unknown) => {
      (hooks[name] ||= []).push(fn)
    },
  }
  return { nuxt, hooks }
}

/** Runs the setup and returns the Nuxt it changed */
function run({ dev = false, moduleOptions = {}, nuxtOptions = {} }: { dev?: boolean, moduleOptions?: Record<string, unknown>, nuxtOptions?: Record<string, unknown> } = {}) {
  const made = makeNuxt({ dev, ...nuxtOptions })
  definition.setup({ ...definition.defaults, ...moduleOptions }, made.nuxt)
  return made
}

/** The pages the module adds to a project with none */
function pagesOf() {
  const pages: { name: string, path: string, file: string }[] = []
  for (const [extend] of vi.mocked(kit.extendPages).mock.calls) (extend as (_pages: unknown[]) => void)(pages)
  return pages
}

const ENV = [
  'SMILE_DEV_TOOLS', 'SMILE_DEV_ACCESS', 'SMILE_DEV_PASSWORD',
  'VITE_CODE_NAME', 'VITE_GIT_OWNER', 'VITE_GIT_REPO_NAME', 'VITE_GIT_BRANCH_NAME',
]

beforeEach(() => {
  vi.clearAllMocks()
  fsState.docs = true
  fsState.unreadable = ''
  for (const key of ENV) vi.stubEnv(key, '')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the module definition', () => {
  it('is configured under "smile", needs Nuxt 4 and installs Pinia', () => {
    expect(definition.meta).toEqual({ name: '@nyuccl/smile-nuxt', configKey: 'smile', compatibility: { nuxt: '>=4.0.0' } })
    expect(definition.moduleDependencies).toEqual({ '@pinia/nuxt': {} })
  })

  it('preloads nothing and leaves the dev tools out of a build by default', () => {
    expect(definition.defaults).toEqual({ preloadImages: [], preloadVideos: [], devTools: false })
  })
})

describe('what the setup changes in the project\'s options', () => {
  it('turns off server rendering and has the runtime directory transpiled', () => {
    const { nuxt } = run()
    expect(nuxt.options.ssr).toBe(false)
    expect(nuxt.options.build.transpile).toEqual([resolve(SRC, 'runtime')])
  })

  it('keeps the data, build and test directories out of both file watchers', () => {
    const { nuxt } = run()
    for (const ignored of [nuxt.options.nitro.watchOptions.ignored, nuxt.options.watchers.chokidar.ignored]) {
      expect(ignored).toEqual(expect.arrayContaining(['**/.data/**', '**/node_modules/**', '**/.output/**', '**/test-results/**']))
      expect(ignored).toHaveLength(9)
    }
  })

  it('adds to the patterns a project already ignores', () => {
    const { nuxt } = run({ nuxtOptions: { nitro: { watchOptions: { ignored: ['**/mine/**'] } }, watchers: { chokidar: { ignored: ['**/mine/**'] } } } })
    expect(nuxt.options.nitro.watchOptions.ignored[0]).toBe('**/mine/**')
    expect(nuxt.options.nitro.watchOptions.ignored).toHaveLength(10)
    expect(nuxt.options.watchers.chokidar.ignored).toHaveLength(10)
  })

  it('leaves an ignore setting that is not a list as the project wrote it', () => {
    const pattern = /mine/
    const { nuxt } = run({ nuxtOptions: { nitro: { watchOptions: { ignored: pattern } }, watchers: { chokidar: { ignored: pattern } } } })
    expect(nuxt.options.nitro.watchOptions.ignored).toBe(pattern)
    expect(nuxt.options.watchers.chokidar.ignored).toBe(pattern)
  })

  it('serves the module\'s static files at /_smile, after the project\'s own', () => {
    const { nuxt } = run({ nuxtOptions: { nitro: { publicAssets: [{ dir: '/project/extra', baseURL: '/extra' }] } } })
    expect(nuxt.options.nitro.publicAssets).toEqual([
      { dir: '/project/extra', baseURL: '/extra' },
      { dir: resolve(SRC, 'runtime/public'), baseURL: '/_smile' },
    ])
  })

  it('has Nitro scan the module\'s server directory and import its utilities', () => {
    run()
    expect(kit.addServerScanDir).toHaveBeenCalledWith(resolve(SRC, 'runtime/server'))
    expect(kit.addServerImportsDir).toHaveBeenCalledWith(resolve(SRC, 'runtime/server/utils'))
  })

  it('names the study "unnamed-experiment" in local/experiment/main when the build has no git context', () => {
    const { nuxt } = run()
    expect(nuxt.options.runtimeConfig.public.smile).toEqual({
      codeName: 'unnamed-experiment',
      owner: 'local',
      repo: 'experiment',
      branch: 'main',
      preloadImages: [],
      preloadVideos: [],
    })
  })

  it('takes the study\'s identity from the build\'s env and the preload lists from the module options', () => {
    vi.stubEnv('VITE_CODE_NAME', 'quiet-otter')
    vi.stubEnv('VITE_GIT_OWNER', 'nyuccl')
    vi.stubEnv('VITE_GIT_REPO_NAME', 'study')
    vi.stubEnv('VITE_GIT_BRANCH_NAME', 'pilot')
    const { nuxt } = run({ moduleOptions: { preloadImages: ['a.png'], preloadVideos: ['b.mp4'] } })
    expect(nuxt.options.runtimeConfig.public.smile).toEqual({
      codeName: 'quiet-otter',
      owner: 'nyuccl',
      repo: 'study',
      branch: 'pilot',
      preloadImages: ['a.png'],
      preloadVideos: ['b.mp4'],
    })
  })

  it('keeps the project\'s other public settings, and its values win for its own keys', () => {
    const { nuxt } = run({
      moduleOptions: { preloadImages: undefined, preloadVideos: undefined },
      nuxtOptions: { runtimeConfig: { secret: 'kept', public: { other: 1, smile: { mine: true, owner: 'overwritten' } } } },
    })
    expect(nuxt.options.runtimeConfig.secret).toBe('kept')
    expect(nuxt.options.runtimeConfig.public.other).toBe(1)
    expect(nuxt.options.runtimeConfig.public.smile).toMatchObject({ mine: true, owner: 'local', preloadImages: [], preloadVideos: [] })
  })

  it('puts no server secret in the runtime config', () => {
    vi.stubEnv('SMILE_DEV_PASSWORD', 'letmein')
    vi.stubEnv('SMILE_DEV_TOOLS', 'include')
    const { nuxt } = run()
    expect(JSON.stringify(nuxt.options.runtimeConfig)).not.toContain('letmein')
  })

  it('adds aliases for the dev components, the composables and three dependencies', () => {
    const { nuxt } = run()
    expect(nuxt.options.alias['#smile-dev']).toBe(resolve(SRC, 'runtime/components/dev'))
    expect(nuxt.options.alias['#smile-composables']).toBe(resolve(SRC, 'runtime/composables'))
    for (const dep of ['lucide-vue-next', '@vueuse/core', 'motion']) {
      expect(nuxt.options.alias[dep]).toContain(`node_modules/${dep}`)
    }
  })

  it('has Vite use one copy of vue and pinia, without listing either twice', () => {
    expect(run().nuxt.options.vite.resolve.dedupe).toEqual(['vue', 'pinia'])
    const { nuxt } = run({ nuxtOptions: { vite: { resolve: { dedupe: ['pinia', 'other'] } } } })
    expect(nuxt.options.vite.resolve.dedupe).toEqual(['pinia', 'other', 'vue'])
  })

  it('leaves a dedupe setting that is not a list as the project wrote it', () => {
    const { nuxt } = run({ nuxtOptions: { vite: { resolve: { dedupe: 'vue' } } } })
    expect(nuxt.options.vite.resolve.dedupe).toBe('vue')
  })

  it('gives the client the module\'s version from package.json', () => {
    const { nuxt } = run()
    expect(nuxt.options.vite.define['import.meta.env.VITE_SMILE_VERSION']).toBe(JSON.stringify(VERSION))
  })

  it('adds the Tailwind plugin and the dependencies to bundle ahead, after the project\'s own', () => {
    const { nuxt } = run({ nuxtOptions: { vite: { plugins: [{ name: 'mine' }], optimizeDeps: { include: ['mine'] }, define: { A: '1' } } } })
    expect(nuxt.options.vite.plugins).toEqual([{ name: 'mine' }, { name: 'tailwind' }])
    expect(nuxt.options.vite.optimizeDeps.include[0]).toBe('mine')
    expect(nuxt.options.vite.optimizeDeps.include).toEqual(expect.arrayContaining(['@nyuccl/smile-nuxt > seedrandom', '@nyuccl/smile-nuxt > reka-ui', '@vue/devtools-kit']))
    expect(nuxt.options.vite.define.A).toBe('1')
  })

  it('loads the module\'s stylesheet before the project\'s, so the project\'s theme wins', () => {
    const { nuxt } = run()
    expect(nuxt.options.css).toEqual([resolve(SRC, 'runtime/css/main.css'), '~/assets/css/app.css'])
  })
})

describe('what the setup registers', () => {
  it('adds the four client plugins in the order they depend on each other', () => {
    run()
    expect(vi.mocked(kit.addPlugin).mock.calls.map(call => call[0])).toEqual([
      resolve(SRC, 'runtime/plugins/store-sync.client'),
      resolve(SRC, 'runtime/plugins/seed.client'),
      resolve(SRC, 'runtime/plugins/dev-sync.client'),
      resolve(SRC, 'runtime/plugins/timeline.client'),
    ])
  })

  it('adds the navigation guard as global middleware', () => {
    run()
    expect(kit.addRouteMiddleware).toHaveBeenCalledWith({
      name: 'smile-timeline',
      path: resolve(SRC, 'runtime/middleware/timeline.global'),
      global: true,
    })
  })

  it('registers the ui, forms, layouts and builtins components globally, below the project\'s own', () => {
    run()
    expect(vi.mocked(kit.addComponentsDir).mock.calls.map(call => call[0])).toEqual(
      ['ui', 'forms', 'layouts', 'builtins'].map(dir => ({
        path: resolve(SRC, 'runtime/components', dir),
        pathPrefix: false,
        global: true,
        extensions: ['vue'],
        priority: -1,
      })),
    )
  })

  it('auto-imports the composables, the stores, Timeline and cn', () => {
    run()
    const imports = vi.mocked(kit.addImports).mock.calls[0]![0] as { name: string, as?: string, from: string }[]
    expect(imports.map(entry => entry.as ?? entry.name)).toEqual([
      'useAPI', 'useViewAPI', 'useTimeline', 'useStepper', 'useSmileColorMode', 'getColorMode', 'setColorMode',
      'Timeline', 'cn', 'useSmileStore', 'useLog',
    ])
    expect(imports.find(entry => entry.as === 'useAPI')).toEqual({ name: 'default', as: 'useAPI', from: resolve(SRC, 'runtime/composables/useAPI') })
  })
})

describe('pages and layouts', () => {
  it('a build without the dev tools has the experiment, presentation and login pages, and no /dev page', () => {
    run()
    expect(pagesOf().map(page => [page.name, page.path])).toEqual([
      ['slug', '/:slug(.*)*'],
      ['presentation-slug', '/presentation/:slug(.*)*'],
      ['dev-login', '/dev-login'],
    ])
  })

  it('a build with the dev tools also has the /dev page', () => {
    run({ moduleOptions: { devTools: true } })
    const pages = pagesOf()
    expect(pages.map(page => page.name)).toEqual(['slug', 'dev-slug', 'presentation-slug', 'dev-login'])
    expect(pages[1]).toEqual({ name: 'dev-slug', path: '/dev/:slug(.*)*', file: resolve(SRC, 'runtime/pages/dev/[...slug].vue') })
  })

  it('adds the experiment and presentation layouts, and the development one only with the dev tools', () => {
    const without = run()
    const app = { layouts: {} as Record<string, { name: string, file: string }> }
    without.hooks['app:templates']![0]!(app)
    expect(Object.keys(app.layouts)).toEqual(['experiment', 'presentation'])
    expect(app.layouts.experiment).toEqual({ name: 'experiment', file: resolve(SRC, 'runtime/layouts/experiment.vue') })

    const withTools = run({ moduleOptions: { devTools: true } })
    const appWithTools = { layouts: {} as Record<string, { name: string, file: string }> }
    withTools.hooks['app:templates']![0]!(appWithTools)
    expect(Object.keys(appWithTools.layouts)).toEqual(['experiment', 'presentation', 'development'])
  })

  it('leaves a project\'s own layout of the same name in place', () => {
    const { hooks } = run()
    const mine = { name: 'experiment', file: '/project/app/layouts/experiment.vue' }
    const app = { layouts: { experiment: mine } as Record<string, { name: string, file: string }> }
    hooks['app:templates']![0]!(app)
    expect(app.layouts.experiment).toBe(mine)
    expect(app.layouts.presentation!.file).toBe(resolve(SRC, 'runtime/layouts/presentation.vue'))
  })

  it('gives the same layouts when Nuxt regenerates the app', () => {
    const { hooks } = run()
    const app = { layouts: {} as Record<string, { name: string, file: string }> }
    hooks['app:templates']![0]!(app)
    const first = structuredClone(app.layouts)
    hooks['app:templates']![0]!(app)
    expect(app.layouts).toEqual(first)
  })
})

describe('a project component with the name of a module component', () => {
  const component = (pascalName: string, filePath: string, global = false) => ({ pascalName, filePath, global })
  const extend = (components: unknown[]) => run().hooks['components:extend']![0]!(components)

  it('is made global when it replaces a built-in view, with no warning', () => {
    const mine = component('InformedConsentView', '/project/app/components/InformedConsentView.vue')
    extend([mine])
    expect(mine.global).toBe(true)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('is made global with a warning when it replaces a UI component the built-in views use', () => {
    const mine = component('Checkbox', '/project/app/components/Checkbox.vue')
    extend([mine])
    expect(mine.global).toBe(true)
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn.mock.calls[0]![0]).toContain('components/Checkbox.vue overrides the built-in SMILE UI component <Checkbox>')
    expect(logger.warn.mock.calls[0]![0]).toContain('MyCheckbox')
  })

  it('is left alone when its name is not one of the module\'s', () => {
    const mine = component('MyTask', '/project/app/components/MyTask.vue')
    extend([mine])
    expect(mine.global).toBe(false)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('does not warn about the module\'s own components, or one with no file', () => {
    extend([
      component('Checkbox', resolve(SRC, 'runtime/components/ui/checkbox/Checkbox.vue'), true),
      component('Button', ''),
    ])
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('still knows the other names when one component directory cannot be read', () => {
    fsState.unreadable = resolve(SRC, 'runtime/components/builtins')
    const view = component('InformedConsentView', '/project/app/components/InformedConsentView.vue')
    const primitive = component('Checkbox', '/project/app/components/Checkbox.vue')
    extend([view, primitive])
    expect(view.global).toBe(false)
    expect(primitive.global).toBe(true)
  })
})

describe('under nuxt dev', () => {
  it('always has the dev tools, whatever the option or SMILE_DEV_TOOLS say', () => {
    vi.stubEnv('SMILE_DEV_TOOLS', 'exclude')
    const { nuxt } = run({ dev: true, moduleOptions: { devTools: false } })
    expect(nuxt.options.nitro.replace.__SMILE_DEV_TOOLS__).toBe('true')
    expect(pagesOf().map(page => page.name)).toContain('dev-slug')
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('serves the shipped docs to the dev tools when they are there', () => {
    const { nuxt } = run({ dev: true })
    expect(kit.addServerHandler).toHaveBeenCalledWith({ route: '/__smile/docs/**', handler: resolve(SRC, 'runtime/server/dev/docs') })
    expect(JSON.parse(nuxt.options.nitro.replace.__SMILE_DOCS_DIR__)).toMatch(/docs$/)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('warns, and adds no docs route, when the shipped docs are missing', () => {
    fsState.docs = false
    const { nuxt } = run({ dev: true })
    expect(kit.addServerHandler).not.toHaveBeenCalled()
    expect(nuxt.options.nitro.replace.__SMILE_DOCS_DIR__).toBeUndefined()
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn.mock.calls[0]![0]).toContain('No shipped docs found')
  })

  it('adds the route the build settings page reads, with the project\'s env directory and its devTools option', () => {
    run({ dev: true, nuxtOptions: { rootDir: '/project/playground', vite: { envDir: '..', server: { allowedHosts: ['x.test'] } }, smile: { devTools: true } } })
    expect(kit.addDevServerHandler).toHaveBeenCalledWith({ route: '/_smile/dev-config', handler: { nuxt: 'the handler' } })
    const [source, hosts] = vi.mocked(createDevConfigHandler).mock.calls[0]! as unknown as [() => Record<string, unknown>, () => unknown]
    expect(source()).toEqual({ rootDir: '/project', env: process.env, devToolsOption: true })
    expect(hosts()).toEqual(['x.test'])
  })

  it('reads env files from the project\'s root when Vite has no envDir, and passes no devTools option that was not written', () => {
    run({ dev: true })
    const [source, hosts] = vi.mocked(createDevConfigHandler).mock.calls[0]! as unknown as [() => Record<string, unknown>, () => unknown]
    expect(source()).toEqual({ rootDir: '/project', env: process.env, devToolsOption: undefined })
    expect(hosts()).toBeUndefined()
  })

  it('prints the experiment, dev and presentation addresses when the server starts', async () => {
    const { hooks } = run({ dev: true })
    await hooks.listen![0]!({}, { getURLs: async () => [{ type: 'network', url: 'http://10.0.0.2:3000/' }, { type: 'local', url: 'http://localhost:3000/' }] })
    const lines = logger.info.mock.calls.map(call => String(call[0]))
    expect(lines.some(line => line.includes(`SMILE ${VERSION}`))).toBe(true)
    expect(lines.some(line => line.includes('Experiment:') && line.includes('http://localhost:3000'))).toBe(true)
    expect(lines.some(line => line.includes('Dev:') && line.includes('http://localhost:3000/dev/'))).toBe(true)
    expect(lines.some(line => line.includes('Presentation:') && line.includes('http://localhost:3000/presentation/'))).toBe(true)
  })

  it('prints nothing when the server has no local address', async () => {
    const { hooks } = run({ dev: true })
    await hooks.listen![0]!({}, { getURLs: async () => [{ type: 'network', url: 'http://10.0.0.2:3000/' }] })
    expect(logger.info).not.toHaveBeenCalled()
  })
})

describe('a build: whether the dev tools are in it (#38)', () => {
  const built = (moduleOptions: Record<string, unknown> = {}) => run({ moduleOptions }).nuxt.options.nitro.replace.__SMILE_DEV_TOOLS__

  it('has no docs route, no build settings route and no start-up banner', () => {
    const { hooks } = run()
    expect(kit.addServerHandler).not.toHaveBeenCalled()
    expect(kit.addDevServerHandler).not.toHaveBeenCalled()
    expect(hooks.listen).toBeUndefined()
  })

  it('leaves them out by default and says how to include them', () => {
    expect(built()).toBe('false')
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('not included in this build'))
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('includes them when the devTools option is on', () => {
    expect(built({ devTools: true })).toBe('true')
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('included in this build (/dev'))
  })

  it.each(['include', 'true', '1', 'yes', 'on', ' Include '])('includes them when SMILE_DEV_TOOLS is "%s", whatever the option', (value) => {
    vi.stubEnv('SMILE_DEV_TOOLS', value)
    expect(built({ devTools: false })).toBe('true')
  })

  it.each(['exclude', 'false', '0', 'no', 'off', 'EXCLUDE'])('leaves them out when SMILE_DEV_TOOLS is "%s", whatever the option', (value) => {
    vi.stubEnv('SMILE_DEV_TOOLS', value)
    expect(built({ devTools: true })).toBe('false')
  })

  it('follows the option when SMILE_DEV_TOOLS is something else', () => {
    vi.stubEnv('SMILE_DEV_TOOLS', 'maybe')
    expect(built({ devTools: true })).toBe('true')
    expect(built({ devTools: false })).toBe('false')
    expect(built({ devTools: undefined })).toBe('false')
  })

  it('keeps what the project already has Nitro replace', () => {
    const { nuxt } = run({ nuxtOptions: { nitro: { replace: { __MINE__: '1' } } } })
    expect(nuxt.options.nitro.replace).toEqual({ __MINE__: '1', __SMILE_DEV_TOOLS__: 'false' })
  })

  it.each([
    ['a dev password is set', { SMILE_DEV_PASSWORD: 'letmein' }],
    ['dev access is "password"', { SMILE_DEV_ACCESS: 'password' }],
    ['dev access is "open"', { SMILE_DEV_ACCESS: ' Open ' }],
  ])('warns that /dev will 404 when they are left out and %s', (_name, env) => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
    expect(built()).toBe('false')
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn.mock.calls[0]![0]).toContain('/dev will 404')
  })

  it('does not warn when they are left out and dev access is "disabled"', () => {
    vi.stubEnv('SMILE_DEV_ACCESS', 'disabled')
    expect(built()).toBe('false')
    expect(logger.warn).not.toHaveBeenCalled()
  })
})
