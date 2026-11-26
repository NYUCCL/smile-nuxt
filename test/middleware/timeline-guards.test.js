/**
 * @fileoverview The navigation middleware's remaining branches: the guards
 * test/middleware/timeline.test.js doesn't reach (reset, data load, pinned
 * route, query merge, the known and unknown user fallbacks), what happens
 * after an allowed navigation (recruitment service, the seed), and the
 * middleware function itself (prefixes, the api object it builds).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useNuxtApp, useRuntimeConfig, navigateTo } from '#imports'
import middleware, { executeGuards } from '../../src/runtime/middleware/timeline.global.js'
import useSmileStore from '../../src/runtime/stores/smilestore'
import useLog from '../../src/runtime/stores/log'
import { getQueryParams, processQuery, initService } from '../../src/runtime/utils/utils'
import * as actions from '../../src/runtime/core/participant-actions.js'

vi.mock('#imports', () => ({
  defineNuxtRouteMiddleware: fn => fn,
  useNuxtApp: vi.fn(),
  useRuntimeConfig: vi.fn(() => ({ app: { baseURL: '/study/' } })),
  navigateTo: vi.fn((path, opts) => ({ __navigateTo: true, path, opts })),
}))
vi.mock('../../src/runtime/stores/smilestore', () => ({ default: vi.fn() }))
vi.mock('../../src/runtime/stores/log', () => ({ default: vi.fn() }))
vi.mock('../../src/runtime/utils/utils', () => ({
  getQueryParams: vi.fn(() => ({})),
  processQuery: vi.fn(),
  initService: vi.fn(() => true),
}))
vi.mock('../../src/runtime/core/participant-actions.js', () => ({
  resetLocalState: vi.fn(),
  completeConsent: vi.fn(async () => {}),
  connectDB: vi.fn(async () => {}),
  randomSeed: vi.fn(),
}))

// The views of a small study, in order. `next` is what Timeline.build() sets.
const VIEWS = [
  { path: '/welcome', name: 'welcome_anonymous', meta: { allowAlways: true, requiresConsent: false, next: 'consent' } },
  { path: '/welcome/:service', name: 'welcome_referred', meta: { allowAlways: true, requiresConsent: false, next: 'consent' } },
  { path: '/consent', name: 'consent', meta: { requiresConsent: false, setConsented: true, next: 'task' } },
  { path: '/task', name: 'task', meta: { requiresConsent: true, next: 'feedback' } },
  { path: '/feedback', name: 'feedback', meta: { requiresConsent: true, setDone: true, next: 'thanks' } },
  { path: '/thanks', name: 'thanks', meta: { requiresConsent: true, requiresDone: true, resetApp: true } },
  { path: '/withdraw', name: 'withdraw', meta: { requiresWithdraw: true } },
  { path: '/landing', name: 'landing', meta: { requiresConsent: true } },
  { path: '/open', name: 'open', meta: { requiresConsent: false } },
  { path: '/nometa', name: 'nometa' },
]

function createTimeline(views = VIEWS) {
  return {
    getViewForPath(path) {
      const exact = views.find(v => v.path === path)
      if (exact) return exact
      return views.find((v) => {
        if (!v.path.includes(':')) return false
        const pattern = new RegExp('^' + v.path.replace(/:\w+/g, '[^/]+') + '$')
        return pattern.test(path)
      }) || null
    },
    getRouteByName(name) {
      return views.find(v => v.name === name) || null
    },
  }
}

function createStore(overrides = {}) {
  return {
    config: { mode: 'production', ...overrides.config },
    dev: 'dev' in overrides ? overrides.dev : { pinnedRoute: null, viewProvidesStepper: true },
    cookieState: {
      knownUser: false,
      lastRoute: 'welcome_anonymous',
      consented: false,
      withdrawn: false,
      done: false,
      seedID: 'seed-1',
      ...overrides.cookieState,
    },
    localState: { reset: false, useSeed: false, ...overrides.localState },
    browserEphemeral: { currentViewDone: false, forceNavigate: false, dataLoaded: false, ...overrides.browserEphemeral },
    get isKnownUser() {
      return this.cookieState.knownUser
    },
    get isConsented() {
      return this.cookieState.consented
    },
    get isWithdrawn() {
      return this.cookieState.withdrawn
    },
    get isDone() {
      return this.cookieState.done
    },
    get lastRoute() {
      return this.cookieState.lastRoute
    },
    get isDataLoaded() {
      return this.browserEphemeral.dataLoaded
    },
    get getSeedID() {
      return this.cookieState.seedID
    },
    setLastRoute: vi.fn(function (route) {
      this.cookieState.lastRoute = route
    }),
    recordRoute: vi.fn(),
    setDone: vi.fn(),
    resetApp: vi.fn(),
    removeAutofill: vi.fn(),
    loadData: vi.fn(async function () {
      this.browserEphemeral.dataLoaded = true
    }),
  }
}

function createLog() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn(), clearPageHistory: vi.fn() }
}

function createApi(store) {
  return {
    isResetApp: vi.fn(() => store.localState.reset),
    resetLocalState: vi.fn(),
    completeConsent: vi.fn(async () => {}),
    setDone: vi.fn(),
    resetApp: vi.fn(),
    connectDB: vi.fn(async () => {}),
    removeAutofill: vi.fn(),
    randomSeed: vi.fn(),
  }
}

const route = (path, query = {}) => ({ path, query, name: 'slug' })
const redirectTo = path => ({ __navigateTo: true, path, opts: { replace: true } })

describe('executeGuards', () => {
  let timeline, store, log, api
  const run = (to, from, extra = {}) => executeGuards(to, from, { timeline, store, log, api, ...extra })

  beforeEach(() => {
    vi.clearAllMocks()
    getQueryParams.mockReturnValue({})
    initService.mockReturnValue(true)
    timeline = createTimeline()
    store = createStore()
    log = createLog()
    api = createApi(store)
  })

  describe('a path that is not in the timeline', () => {
    it('lets an unknown user stay when the path is the welcome path', async () => {
      // No welcome_anonymous view: the welcome path falls back to '/welcome',
      // which is then itself not in the timeline.
      timeline = createTimeline(VIEWS.filter(v => !v.name.startsWith('welcome')))
      expect(await run(route('/welcome'), route('/'))).toBeUndefined()
      expect(navigateTo).not.toHaveBeenCalled()
      expect(log.warn).toHaveBeenCalledWith('ROUTER GUARD: Path /welcome is not in the timeline')
    })

    it('sends a known user to the welcome path when their last route is not in the timeline either', async () => {
      // lastRoute 'gone' doesn't resolve, so the target is the welcome path;
      // the participant is at another unknown path, so they are redirected.
      store = createStore({ cookieState: { knownUser: true, lastRoute: 'gone' } })
      expect(await run(route('/elsewhere'), route('/'))).toEqual(redirectTo('/welcome'))
    })

    it('does not redirect a known user to the path they are already on', async () => {
      timeline = createTimeline(VIEWS.filter(v => !v.name.startsWith('welcome')))
      store = createStore({ cookieState: { knownUser: true, lastRoute: 'gone' } })
      // Target (the fallback '/welcome') equals the path: no redirect either way
      expect(await run(route('/welcome'), route('/'))).toBeUndefined()
      expect(navigateTo).not.toHaveBeenCalled()
    })

    it('does not run the reset, consent or done steps for an unknown path', async () => {
      store = createStore({ localState: { reset: true } })
      api = createApi(store)
      await run(route('/nowhere'), route('/consent'))
      expect(api.resetLocalState).not.toHaveBeenCalled()
      expect(api.completeConsent).not.toHaveBeenCalled()
    })
  })

  describe('reset flag', () => {
    it('resets the local state when the reset flag is set', async () => {
      store = createStore({ localState: { reset: true } })
      api = createApi(store)
      await run(route('/welcome'), route('/'))
      expect(api.resetLocalState).toHaveBeenCalledTimes(1)
      expect(log.warn).toHaveBeenCalledWith('ROUTER GUARD: Resetting app')
    })

    it('does not reset when the flag is not set', async () => {
      await run(route('/welcome'), route('/'))
      expect(api.resetLocalState).not.toHaveBeenCalled()
    })
  })

  describe('loading a known user\'s data', () => {
    it('loads the data when it is not loaded yet', async () => {
      store = createStore({ cookieState: { knownUser: true, lastRoute: 'task', consented: true } })
      await run(route('/task'), route('/'))
      expect(store.loadData).toHaveBeenCalledTimes(1)
    })

    it('does not load again when the data is loaded', async () => {
      store = createStore({ cookieState: { knownUser: true, lastRoute: 'task', consented: true }, browserEphemeral: { dataLoaded: true } })
      await run(route('/task'), route('/'))
      expect(store.loadData).not.toHaveBeenCalled()
    })

    it('does not load for an unknown user', async () => {
      await run(route('/welcome'), route('/'))
      expect(store.loadData).not.toHaveBeenCalled()
    })

    it('loads on a dev route too, before the blocking guards are skipped (#58)', async () => {
      store = createStore({ cookieState: { knownUser: true, lastRoute: 'task' } })
      await run(route('/feedback'), route('/'), { skipBlockingGuards: true })
      expect(store.loadData).toHaveBeenCalledTimes(1)
    })
  })

  describe('pinned route (dev tools)', () => {
    it('allows navigation to the pinned route and connects the database', async () => {
      store = createStore({ dev: { pinnedRoute: 'task' } })
      expect(await run(route('/task'), route('/'), { skipBlockingGuards: true })).toBeUndefined()
      expect(api.connectDB).toHaveBeenCalledTimes(1)
      expect(store.setLastRoute).toHaveBeenCalledWith('task')
    })

    it('redirects any other navigation to the pinned route', async () => {
      store = createStore({ dev: { pinnedRoute: 'task' } })
      expect(await run(route('/feedback'), route('/'), { skipBlockingGuards: true })).toEqual(redirectTo('/task'))
      expect(api.connectDB).toHaveBeenCalledTimes(1)
      expect(store.setLastRoute).not.toHaveBeenCalled()
    })

    it('clears a pinned route that is not in the timeline and carries on', async () => {
      store = createStore({ dev: { pinnedRoute: 'removed_view' } })
      expect(await run(route('/feedback'), route('/'), { skipBlockingGuards: true })).toBeUndefined()
      expect(store.dev.pinnedRoute).toBeNull()
      expect(api.connectDB).not.toHaveBeenCalled()
    })

    it('works when the store has no dev state', async () => {
      store = createStore({ dev: null })
      expect(await run(route('/welcome'), route('/'))).toBeUndefined()
      expect(store.dev).toBeNull()
    })
  })

  describe('query parameters', () => {
    it('merges the previous route\'s, the target\'s and the URL\'s parameters; the URL wins', async () => {
      getQueryParams.mockReturnValue({ c: 'url', b: 'url' })
      const to = route('/welcome', { b: 'to', d: 'to' })
      await run(to, route('/', { a: 'from', b: 'from' }))
      expect(to.query).toEqual({ a: 'from', b: 'url', c: 'url', d: 'to' })
    })

    it('leaves the query alone when the blocking guards are skipped', async () => {
      getQueryParams.mockReturnValue({ c: 'url' })
      const to = route('/task', { b: 'to' })
      await run(to, route('/', { a: 'from' }), { skipBlockingGuards: true })
      expect(to.query).toEqual({ b: 'to' })
    })
  })

  describe('withdrawn participants', () => {
    it('are redirected to the welcome path when the timeline has no withdraw view', async () => {
      timeline = createTimeline(VIEWS.filter(v => v.name !== 'withdraw'))
      store = createStore({ cookieState: { knownUser: true, withdrawn: true, lastRoute: 'task' } })
      expect(await run(route('/task'), route('/'))).toEqual(redirectTo('/welcome'))
    })

    it('may still open an allowAlways view', async () => {
      store = createStore({ cookieState: { knownUser: true, withdrawn: true, lastRoute: 'task' } })
      expect(await run(route('/welcome'), route('/task'))).toBeUndefined()
    })

    it('a withdraw view is not open to a participant who has not withdrawn', async () => {
      store = createStore({ cookieState: { knownUser: true, consented: true, lastRoute: 'task' }, browserEphemeral: { dataLoaded: true } })
      expect(await run(route('/withdraw'), route('/task'))).toEqual(redirectTo('/task'))
    })
  })

  describe('forced navigation', () => {
    it('logs the development message in development mode', async () => {
      store = createStore({ config: { mode: 'development' }, browserEphemeral: { forceNavigate: true } })
      expect(await run(route('/thanks'), route('/'))).toBeUndefined()
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('allowed in development mode but not in production'))
    })

    it('logs the goToView message in other modes', async () => {
      store = createStore({ browserEphemeral: { forceNavigate: true } })
      expect(await run(route('/thanks'), route('/'))).toBeUndefined()
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('forced by api.goToView()'))
    })

    it('does not override a withdrawn participant\'s redirect', async () => {
      store = createStore({ cookieState: { knownUser: true, withdrawn: true }, browserEphemeral: { forceNavigate: true } })
      expect(await run(route('/task'), route('/'))).toEqual(redirectTo('/withdraw'))
    })
  })

  describe('consent and done requirements', () => {
    it('sends an unconsented user from a consent-only view to their last route', async () => {
      store = createStore({ cookieState: { lastRoute: 'consent' } })
      expect(await run(route('/task'), route('/consent'))).toEqual(redirectTo('/consent'))
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('requires consent'))
    })

    it('sends a participant who is not done from a done-only view to their last route', async () => {
      store = createStore({ cookieState: { knownUser: true, consented: true, lastRoute: 'feedback' }, browserEphemeral: { dataLoaded: true, currentViewDone: true } })
      // Leaving 'task', not 'feedback': setDone has not run
      expect(await run(route('/thanks'), route('/task'))).toEqual(redirectTo('/feedback'))
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('requires being marked as done'))
    })

    it('lets a participant who is done into a done-only view that is next', async () => {
      store = createStore({ cookieState: { knownUser: true, consented: true, done: true, lastRoute: 'feedback' }, browserEphemeral: { dataLoaded: true, currentViewDone: true } })
      expect(await run(route('/thanks'), route('/feedback'))).toBeUndefined()
      expect(api.setDone).toHaveBeenCalledTimes(1)
      expect(api.resetApp).toHaveBeenCalledTimes(1)
    })
  })

  describe('a known user going somewhere that is not next', () => {
    it('is returned to the last route', async () => {
      store = createStore({ cookieState: { knownUser: true, consented: true, lastRoute: 'task' }, browserEphemeral: { dataLoaded: true, currentViewDone: true } })
      expect(await run(route('/open'), route('/task'))).toEqual(redirectTo('/task'))
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('which is not \'next\''))
    })

    it('is returned to the last route when the page they came from is not in the timeline', async () => {
      store = createStore({ cookieState: { knownUser: true, consented: true, lastRoute: 'task' }, browserEphemeral: { dataLoaded: true } })
      expect(await run(route('/feedback'), route('/'))).toEqual(redirectTo('/task'))
    })
  })

  describe('an unknown user', () => {
    it('going to the landing view is sent to the welcome view', async () => {
      const landing = VIEWS.map(v => v.name === 'landing' ? { ...v, meta: {} } : v)
      timeline = createTimeline(landing)
      expect(await run(route('/landing'), route('/'))).toEqual(redirectTo('/welcome'))
      expect(log.error).toHaveBeenCalledWith('ROUTER GUARD: Unknown user trying to go to landing page')
    })

    it('is blocked from a view with no meta (consent is required unless the view says otherwise)', async () => {
      expect(await run(route('/nometa'), route('/'))).toEqual(redirectTo('/welcome'))
      expect(log.error).toHaveBeenCalledWith('ROUTER GUARD: Unknown user blocked trying to go to nometa')
    })

    it('may open a view that says consent is not required', async () => {
      expect(await run(route('/open'), route('/'))).toBeUndefined()
      expect(store.setLastRoute).toHaveBeenCalledWith('open')
      expect(store.recordRoute).toHaveBeenCalledWith('open')
    })

    it('may not skip ahead to the next view before the current one is done', async () => {
      store = createStore({ cookieState: { lastRoute: 'welcome_anonymous' } })
      expect(await run(route('/consent'), route('/welcome'))).toEqual(redirectTo('/welcome'))
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('not marked as done'))
    })

    it('may go to the next view once the current one is done', async () => {
      store = createStore({ browserEphemeral: { currentViewDone: true } })
      expect(await run(route('/consent'), route('/welcome'))).toBeUndefined()
      expect(log.log).toHaveBeenCalledWith(expect.stringContaining('from welcome_anonymous to consent'))
    })
  })

  describe('after an allowed navigation', () => {
    it('reads the recruitment service from /welcome/<service> and stores the URL\'s parameters', async () => {
      getQueryParams.mockReturnValue({ PROLIFIC_PID: 'p1' })
      await run(route('/welcome/prolific'), route('/'))
      expect(initService).toHaveBeenCalledWith('prolific')
      expect(processQuery).toHaveBeenCalledWith({ PROLIFIC_PID: 'p1' }, 'prolific')
    })

    it('does not store the parameters when the service\'s setup says to stop', async () => {
      initService.mockReturnValue(false)
      await run(route('/welcome/panda'), route('/'))
      expect(initService).toHaveBeenCalledWith('panda')
      expect(processQuery).not.toHaveBeenCalled()
    })

    it('does nothing about services on other paths', async () => {
      await run(route('/welcome'), route('/'))
      expect(initService).not.toHaveBeenCalled()
    })

    it('seeds Math.random from the participant\'s seed and the view when useSeed is on', async () => {
      store = createStore({ localState: { useSeed: true }, cookieState: { seedID: 'abc' } })
      await run(route('/welcome'), route('/'))
      const first = [Math.random(), Math.random()]
      expect(log.log).toHaveBeenCalledWith('ROUTER GUARD: Seed set to abc-welcome_anonymous')
      expect(api.randomSeed).not.toHaveBeenCalled()

      // The same participant on the same view gets the same numbers
      await run(route('/welcome'), route('/'))
      expect([Math.random(), Math.random()]).toEqual(first)

      // Another view gets different ones
      await run(route('/open'), route('/'))
      expect(Math.random()).not.toBe(first[0])
    })

    it('seeds randomly when useSeed is off', async () => {
      await run(route('/welcome'), route('/'))
      expect(api.randomSeed).toHaveBeenCalledTimes(1)
    })

    it('clears the page\'s log history and the per-view flags', async () => {
      store = createStore({ browserEphemeral: { currentViewDone: true, forceNavigate: true } })
      await run(route('/task'), route('/'))
      expect(log.clearPageHistory).toHaveBeenCalledTimes(1)
      expect(store.dev.viewProvidesStepper).toBe(false)
      expect(store.browserEphemeral.currentViewDone).toBe(false)
      expect(log.log).toHaveBeenLastCalledWith('ROUTER GUARD: Router navigated to /task')
    })

    it('records the route under the route object\'s name when the path is not in the timeline (dev pages)', async () => {
      await run({ path: '/somewhere', query: {}, name: 'devpage' }, route('/'), { skipBlockingGuards: true })
      expect(store.setLastRoute).toHaveBeenCalledWith('devpage')
    })
  })
})

describe('the middleware', () => {
  let store, log, timeline

  beforeEach(() => {
    vi.clearAllMocks()
    getQueryParams.mockReturnValue({})
    initService.mockReturnValue(true)
    store = createStore()
    log = createLog()
    timeline = createTimeline()
    useSmileStore.mockReturnValue(store)
    useLog.mockReturnValue(log)
    useNuxtApp.mockReturnValue({ $timeline: timeline })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does nothing, with a warning, when the timeline is not available', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    useNuxtApp.mockReturnValue({})
    expect(await middleware(route('/task'), route('/'))).toBeUndefined()
    expect(warn).toHaveBeenCalledWith('[SMILE middleware] $timeline not available yet, skipping guards')
    expect(useSmileStore).not.toHaveBeenCalled()
  })

  it('does not guard the dev login page', async () => {
    expect(await middleware(route('/dev-login'), route('/dev/task'))).toBeUndefined()
    expect(useSmileStore).not.toHaveBeenCalled()
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('keeps the /dev prefix when a dev page navigates to an unprefixed path', async () => {
    expect(await middleware(route('/consent'), route('/dev/welcome'))).toEqual(redirectTo('/dev/consent'))
    expect(await middleware(route('/consent'), route('/dev'))).toEqual(redirectTo('/dev/consent'))
    expect(useSmileStore).not.toHaveBeenCalled()
  })

  it('keeps the /presentation prefix when a presentation page navigates to an unprefixed path', async () => {
    expect(await middleware(route('/task'), route('/presentation/welcome'))).toEqual(redirectTo('/presentation/task'))
    expect(await middleware(route('/task'), route('/presentation'))).toEqual(redirectTo('/presentation/task'))
  })

  it('does not treat a path that only starts with the letters "dev" as a dev route', async () => {
    // '/developer' is not under /dev/: no prefix is added, and it is guarded as a participant path
    expect(await middleware(route('/welcome'), route('/developer'))).toBeUndefined()
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('on a dev route, looks the view up without the prefix and skips the blocking guards', async () => {
    // An unknown user could not open /task on a participant route
    expect(await middleware(route('/dev/task'), route('/dev/welcome'))).toBeUndefined()
    expect(store.setLastRoute).toHaveBeenCalledWith('task')
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('on a presentation route, does the same', async () => {
    expect(await middleware(route('/presentation/task'), route('/presentation/welcome'))).toBeUndefined()
    expect(store.setLastRoute).toHaveBeenCalledWith('task')
  })

  it('treats /dev and /presentation themselves as the root path', async () => {
    const root = [...VIEWS, { path: '/', name: 'root', meta: {} }]
    useNuxtApp.mockReturnValue({ $timeline: createTimeline(root) })
    await middleware(route('/dev'), route('/dev'))
    expect(store.setLastRoute).toHaveBeenLastCalledWith('root')
    await middleware(route('/presentation'), route('/presentation'))
    expect(store.setLastRoute).toHaveBeenCalledTimes(2)
  })

  it('does not change the route objects it was given', async () => {
    const to = route('/dev/task')
    const from = route('/dev/welcome')
    await middleware(to, from)
    expect(to.path).toBe('/dev/task')
    expect(from.path).toBe('/dev/welcome')
  })

  it('on a participant route, runs the blocking guards', async () => {
    expect(await middleware(route('/task'), route('/welcome'))).toEqual(redirectTo('/welcome'))
  })

  describe('the actions it gives the guards', () => {
    it('resets the local state with the app\'s base URL when the reset flag is set', async () => {
      store.localState.reset = true
      await middleware(route('/welcome'), route('/'))
      expect(actions.resetLocalState).toHaveBeenCalledWith(store, '/study/')
    })

    it('resets without a base URL when the runtime config has no app entry', async () => {
      useRuntimeConfig.mockReturnValueOnce({})
      store.localState.reset = true
      await middleware(route('/welcome'), route('/'))
      expect(actions.resetLocalState).toHaveBeenCalledWith(store, undefined)
    })

    it('completes consent when leaving the consent view', async () => {
      store.browserEphemeral.currentViewDone = true
      store.cookieState.lastRoute = 'consent'
      await middleware(route('/dev/task'), route('/dev/consent'))
      expect(actions.completeConsent).toHaveBeenCalledWith(store)
    })

    it('marks the participant done when leaving a setDone view, and sets the reset flag on a resetApp view', async () => {
      await middleware(route('/dev/thanks'), route('/dev/feedback'))
      expect(store.setDone).toHaveBeenCalledTimes(1)
      expect(store.resetApp).toHaveBeenCalledTimes(1)
    })

    it('connects the database for a pinned route', async () => {
      store.dev.pinnedRoute = 'task'
      await middleware(route('/dev/task'), route('/dev/welcome'))
      expect(actions.connectDB).toHaveBeenCalledWith(store)
    })

    it('seeds randomly after an allowed navigation', async () => {
      await middleware(route('/welcome'), route('/'))
      expect(actions.randomSeed).toHaveBeenCalledTimes(1)
      expect(actions.randomSeed).toHaveBeenCalledWith()
    })

    it('does not remove autofill outside a development build', async () => {
      await middleware(route('/welcome'), route('/'))
      expect(store.removeAutofill).not.toHaveBeenCalled()
    })
  })
})
