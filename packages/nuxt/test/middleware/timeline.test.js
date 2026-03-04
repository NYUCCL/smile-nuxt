/**
 * @fileoverview Unit tests for the timeline navigation guard middleware.
 * Tests the exported executeGuards() function directly with mock dependencies,
 * adapted from tests/vitest/core/router.test.js.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent } from 'vue'
import Timeline from '../../src/runtime/core/timeline/Timeline.js'
import { executeGuards } from '../../src/runtime/middleware/timeline.global.js'

// --- Mock #imports (Nuxt auto-imports used in the middleware) ---
vi.mock('#imports', () => ({
  defineNuxtRouteMiddleware: (fn) => fn,
  useNuxtApp: vi.fn(),
  navigateTo: vi.fn((path, opts) => ({ __navigateTo: true, path, opts })),
  abortNavigation: vi.fn(() => ({ __abortNavigation: true })),
}))

// --- Mock internal store imports (these use Pinia which isn't set up in unit tests) ---
vi.mock('../../src/runtime/stores/smilestore', () => ({
  default: vi.fn(),
}))
vi.mock('../../src/runtime/stores/log', () => ({
  default: vi.fn(),
}))
vi.mock('../../src/runtime/utils/utils', () => ({
  getQueryParams: vi.fn(() => ({})),
}))

// --- Helpers ---

const MockComponent = (text = 'Mock') =>
  defineComponent({
    render() {
      return null
    },
  })

/**
 * Creates a test timeline matching the original router test's createTestTimeline.
 */
function createTestTimeline() {
  const mockApi = {
    config: { mode: 'production', localStorageKey: 'test_storage' },
    log: {
      debug: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
    },
    store: {
      getRandomizedRouteByName: vi.fn().mockReturnValue(null),
      setRandomizedRoute: vi.fn(),
      registerStepper: vi.fn(),
      config: { mode: 'production' },
      browserPersisted: { seqtimeline: [], routes: [] },
    },
    sampleWithReplacement: vi.fn((options) => [options[0]]),
    getConditionByName: vi.fn(),
    randomAssignCondition: vi.fn((options) => options.conditionname[0]),
  }

  const timeline = new Timeline(mockApi)

  timeline.pushSeqView({
    path: '/welcome',
    name: 'welcome_anonymous',
    component: MockComponent('Welcome'),
    meta: { allowAlways: true, requiresConsent: false },
  })

  timeline.pushSeqView({
    path: '/consent',
    name: 'consent',
    component: MockComponent('Consent'),
    meta: { requiresConsent: false, setConsented: true },
  })

  timeline.pushSeqView({
    path: '/demograph',
    name: 'demograph',
    component: MockComponent('Demograph'),
  })

  timeline.pushSeqView({
    path: '/instructions',
    name: 'instructions',
    component: MockComponent('Instructions'),
  })

  timeline.pushSeqView({
    path: '/quiz',
    name: 'quiz',
    component: MockComponent('Quiz'),
  })

  timeline.pushSeqView({
    path: '/experiment',
    name: 'exp',
    component: MockComponent('Experiment'),
  })

  timeline.pushSeqView({
    path: '/debrief',
    name: 'debrief',
    component: MockComponent('Debrief'),
  })

  timeline.pushSeqView({
    path: '/feedback',
    name: 'feedback',
    component: MockComponent('Feedback'),
    meta: { setDone: true },
  })

  timeline.registerView({
    path: '/always_allow',
    name: 'always_allow',
    component: MockComponent('Always Allow'),
    meta: { allowAlways: true, requiresConsent: false },
  })

  timeline.pushSeqView({
    path: '/thanks',
    name: 'thanks',
    component: MockComponent('Thanks'),
    meta: { requiresDone: true, resetApp: true },
  })

  timeline.pushSeqView({
    path: '/thanks2',
    name: 'thanks2',
    component: MockComponent('Thanks 2'),
    meta: { requiresDone: true, resetApp: false },
  })

  timeline.registerView({
    path: '/withdraw',
    name: 'withdraw',
    component: MockComponent('Withdraw'),
    meta: { requiresWithdraw: true },
  })

  timeline.build()
  return timeline
}

/**
 * Creates a mock store with default production-mode state.
 */
function createMockStore(overrides = {}) {
  return {
    config: { mode: 'production', localStorageKey: 'test_storage', autoSave: false },
    dev: { pinnedRoute: null, viewProvidesStepper: false },
    browserPersisted: {
      knownUser: false,
      lastRoute: 'landing',
      consented: false,
      withdrawn: false,
      done: false,
      reset: false,
      useSeed: false,
      seedID: '',
      seedSet: false,
      ...overrides.browserPersisted,
    },
    browserEphemeral: {
      currentViewDone: false,
      forceNavigate: false,
      dbConnected: false,
      ...overrides.browserEphemeral,
    },
    // Getters (computed-like)
    get isKnownUser() {
      return this.browserPersisted.knownUser
    },
    get isConsented() {
      return this.browserPersisted.consented
    },
    get isWithdrawn() {
      return this.browserPersisted.withdrawn
    },
    get isDone() {
      return this.browserPersisted.done
    },
    get lastRoute() {
      return this.browserPersisted.lastRoute
    },
    get isDBConnected() {
      return this.browserEphemeral.dbConnected
    },
    get getSeedID() {
      return this.browserPersisted.seedID
    },
    // Actions
    setLastRoute: vi.fn(function (route) {
      this.browserPersisted.lastRoute = route
    }),
    recordRoute: vi.fn(),
    setConsented: vi.fn(function () {
      this.browserPersisted.consented = true
    }),
    setDone: vi.fn(function () {
      this.browserPersisted.done = true
    }),
    resetApp: vi.fn(function () {
      this.browserPersisted.reset = true
    }),
    setKnown: vi.fn(async function () {
      this.browserPersisted.knownUser = true
    }),
    setWithdrawn: vi.fn(function () {
      this.browserPersisted.withdrawn = true
    }),
    loadData: vi.fn(async function () {
      this.browserEphemeral.dbConnected = true
    }),
    removeAutofill: vi.fn(),
    resetLocal: vi.fn(),
    ...overrides,
  }
}

/**
 * Creates a mock log.
 */
function createMockLog() {
  return {
    debug: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    clearPageHistory: vi.fn(),
  }
}

/**
 * Creates a mock api-like object matching what the middleware provides.
 */
function createMockApi(store) {
  return {
    isResetApp: vi.fn(() => store.browserPersisted.reset),
    resetLocalState: vi.fn(),
    completeConsent: vi.fn(async () => {
      store.setConsented()
      if (!store.browserPersisted.knownUser) {
        await store.setKnown()
      }
    }),
    setDone: vi.fn(() => store.setDone()),
    resetApp: vi.fn(() => store.resetApp()),
    connectDB: vi.fn(async () => {
      if (!store.browserPersisted.knownUser) {
        await store.setKnown()
        store.setConsented()
      }
    }),
    removeAutofill: vi.fn(),
    randomSeed: vi.fn(),
  }
}

/**
 * Helper to create a mock route object.
 */
function mockRoute(path, query = {}) {
  return { path, query, name: 'slug' }
}

// ===================== TESTS =====================

describe('Timeline middleware guards', () => {
  let timeline, store, log, api

  beforeEach(() => {
    vi.clearAllMocks()
    timeline = createTestTimeline()
    store = createMockStore()
    log = createMockLog()
    api = createMockApi(store)
  })

  describe('Basic guard behavior', () => {
    it('should allow navigation to allowAlways routes for unknown users', async () => {
      const result = await executeGuards(
        mockRoute('/welcome'),
        mockRoute('/'),
        { timeline, store, log, api }
      )
      expect(result).toBeUndefined() // undefined = allow
    })

    it('should allow navigation to always_allow route', async () => {
      const result = await executeGuards(
        mockRoute('/always_allow'),
        mockRoute('/welcome'),
        { timeline, store, log, api }
      )
      expect(result).toBeUndefined()
    })

    it('should redirect unknown users trying to access non-welcome routes', async () => {
      store.browserPersisted.lastRoute = 'welcome_anonymous'
      const result = await executeGuards(
        mockRoute('/demograph'),
        mockRoute('/welcome'),
        { timeline, store, log, api }
      )
      expect(result).toBeDefined()
      expect(result.path).toBe('/welcome')
    })

    it('should allow navigation to landing (it has allowAlways, redirect handled by catch-all page)', async () => {
      // The `/` landing route has allowAlways:true in its meta.
      // The redirect to welcome_anonymous is handled by the catch-all page, not the guard.
      const result = await executeGuards(
        mockRoute('/'),
        mockRoute('/'),
        { timeline, store, log, api }
      )
      expect(result).toBeUndefined() // allowed (landing is allowAlways)
    })
  })

  describe('Consent gating', () => {
    it('should call completeConsent when leaving a setConsented route', async () => {
      // Navigate from consent to demograph
      store.browserPersisted.knownUser = true
      store.browserPersisted.consented = true
      store.browserPersisted.lastRoute = 'demograph'
      store.browserEphemeral.currentViewDone = true

      await executeGuards(
        mockRoute('/demograph'),
        mockRoute('/consent'),
        { timeline, store, log, api }
      )
      expect(api.completeConsent).toHaveBeenCalled()
    })

    it('should block unconsented users from routes requiring consent', async () => {
      store.browserPersisted.lastRoute = 'welcome_anonymous'
      store.browserPersisted.consented = false
      store.browserEphemeral.forceNavigate = true

      // First, force navigate to consent to set lastRoute
      await executeGuards(
        mockRoute('/consent'),
        mockRoute('/welcome'),
        { timeline, store, log, api }
      )

      // Now try to go to task without consenting (not forced)
      store.browserEphemeral.forceNavigate = false
      store.browserPersisted.lastRoute = 'consent'

      const result = await executeGuards(
        mockRoute('/demograph'),
        mockRoute('/consent'),
        { timeline, store, log, api }
      )
      // demograph requires consent (default), user hasn't consented
      expect(result).toBeDefined()
      expect(result.path).toBe('/consent')
    })
  })

  describe('Done gating', () => {
    it('should call setDone when leaving a setDone route', async () => {
      store.browserPersisted.knownUser = true
      store.browserPersisted.consented = true
      store.browserPersisted.lastRoute = 'thanks'
      store.browserEphemeral.currentViewDone = true

      await executeGuards(
        mockRoute('/thanks'),
        mockRoute('/feedback'),
        { timeline, store, log, api }
      )
      expect(api.setDone).toHaveBeenCalled()
    })

    it('should block navigation to requiresDone routes when not done', async () => {
      store.browserPersisted.knownUser = true
      store.browserPersisted.consented = true
      store.browserPersisted.done = false
      store.browserPersisted.lastRoute = 'feedback'

      const result = await executeGuards(
        mockRoute('/thanks'),
        mockRoute('/feedback'),
        { timeline, store, log, api }
      )
      expect(result).toBeDefined()
      expect(result.path).toBe('/feedback')
    })
  })

  describe('Reset app', () => {
    it('should call resetApp when navigating to a resetApp route', async () => {
      store.browserPersisted.knownUser = true
      store.browserPersisted.consented = true
      store.browserPersisted.done = true
      store.browserPersisted.lastRoute = 'thanks'
      store.browserEphemeral.currentViewDone = true

      await executeGuards(
        mockRoute('/thanks'),
        mockRoute('/feedback'),
        { timeline, store, log, api }
      )
      expect(api.resetApp).toHaveBeenCalled()
    })

    it('should NOT call resetApp when navigating to thanks2 (resetApp=false)', async () => {
      store.browserPersisted.knownUser = true
      store.browserPersisted.consented = true
      store.browserPersisted.done = true
      store.browserPersisted.lastRoute = 'thanks2'
      store.browserEphemeral.currentViewDone = true

      await executeGuards(
        mockRoute('/thanks2'),
        mockRoute('/feedback'),
        { timeline, store, log, api }
      )
      expect(api.resetApp).not.toHaveBeenCalled()
    })
  })

  describe('Withdrawn state', () => {
    it('should redirect withdrawn users to withdraw page', async () => {
      store.browserPersisted.withdrawn = true

      const result = await executeGuards(
        mockRoute('/demograph'),
        mockRoute('/welcome'),
        { timeline, store, log, api }
      )
      expect(result).toBeDefined()
      expect(result.path).toBe('/withdraw')
    })

    it('should allow withdrawn users to access the withdraw page', async () => {
      store.browserPersisted.withdrawn = true

      const result = await executeGuards(
        mockRoute('/withdraw'),
        mockRoute('/welcome'),
        { timeline, store, log, api }
      )
      expect(result).toBeUndefined() // allowed
    })
  })

  describe('Force navigate / dev mode', () => {
    it('should allow force navigation in production mode', async () => {
      store.browserEphemeral.forceNavigate = true

      const result = await executeGuards(
        mockRoute('/demograph'),
        mockRoute('/welcome'),
        { timeline, store, log, api }
      )
      expect(result).toBeUndefined() // allowed
    })

    it('should allow any navigation in development mode with forceNavigate', async () => {
      store.config.mode = 'development'
      store.browserEphemeral.forceNavigate = true

      const result = await executeGuards(
        mockRoute('/instructions'),
        mockRoute('/welcome'),
        { timeline, store, log, api }
      )
      expect(result).toBeUndefined()
    })

    it('should allow any navigation in presentation mode', async () => {
      store.config.mode = 'presentation'

      const result = await executeGuards(
        mockRoute('/instructions'),
        mockRoute('/welcome'),
        { timeline, store, log, api }
      )
      expect(result).toBeUndefined()
    })
  })

  describe('Sequential navigation', () => {
    it('should allow going to next route when currentViewDone is true', async () => {
      // welcome_anonymous → consent (next in sequence)
      store.browserPersisted.lastRoute = 'welcome_anonymous'
      store.browserEphemeral.currentViewDone = true

      const result = await executeGuards(
        mockRoute('/consent'),
        mockRoute('/welcome'),
        { timeline, store, log, api }
      )
      expect(result).toBeUndefined() // allowed
    })

    it('should block going to next route when currentViewDone is false', async () => {
      // welcome_anonymous → consent but not done
      store.browserPersisted.lastRoute = 'welcome_anonymous'
      store.browserEphemeral.currentViewDone = false

      const result = await executeGuards(
        mockRoute('/consent'),
        mockRoute('/welcome'),
        { timeline, store, log, api }
      )
      expect(result).toBeDefined()
      expect(result.path).toBe('/welcome') // redirect to lastRoute
    })

    it('should allow navigating to the same route as lastRoute', async () => {
      store.browserPersisted.knownUser = true
      store.browserPersisted.consented = true
      store.browserPersisted.lastRoute = 'demograph'

      const result = await executeGuards(
        mockRoute('/demograph'),
        mockRoute('/demograph'),
        { timeline, store, log, api }
      )
      expect(result).toBeUndefined() // allowed
    })
  })

  describe('Known user guards', () => {
    it('should allow known user to navigate to their lastRoute', async () => {
      store.browserPersisted.knownUser = true
      store.browserPersisted.consented = true
      store.browserPersisted.lastRoute = 'demograph'

      const result = await executeGuards(
        mockRoute('/demograph'),
        mockRoute('/welcome'),
        { timeline, store, log, api }
      )
      expect(result).toBeUndefined() // allowed (same as lastRoute)
    })

    it('should redirect known users trying to access unauthorized routes', async () => {
      store.browserPersisted.knownUser = true
      store.browserPersisted.consented = true
      store.browserPersisted.lastRoute = 'demograph'

      // Try to jump to instructions (not the next route from demograph in the guard check)
      const result = await executeGuards(
        mockRoute('/instructions'),
        mockRoute('/demograph'),
        { timeline, store, log, api }
      )
      expect(result).toBeDefined()
      expect(result.path).toBe('/demograph') // redirect back to lastRoute
    })
  })

  describe('Post-guard effects', () => {
    it('should reset currentViewDone to false after allowing navigation', async () => {
      store.browserEphemeral.currentViewDone = true

      await executeGuards(
        mockRoute('/welcome'),
        mockRoute('/'),
        { timeline, store, log, api }
      )
      // After guard allows navigation, post-guard should reset currentViewDone
      expect(store.browserEphemeral.currentViewDone).toBe(false)
    })

    it('should call removeAutofill after allowing navigation', async () => {
      await executeGuards(
        mockRoute('/welcome'),
        mockRoute('/'),
        { timeline, store, log, api }
      )
      expect(api.removeAutofill).toHaveBeenCalled()
    })

    it('should reset viewProvidesStepper after allowing navigation', async () => {
      store.dev.viewProvidesStepper = true

      await executeGuards(
        mockRoute('/welcome'),
        mockRoute('/'),
        { timeline, store, log, api }
      )
      expect(store.dev.viewProvidesStepper).toBe(false)
    })

    it('should NOT run post-guard when navigation is redirected', async () => {
      // Unknown user trying to go to /demograph — should redirect, not run post-guard
      store.browserPersisted.lastRoute = 'welcome_anonymous'
      store.browserEphemeral.currentViewDone = true

      const result = await executeGuards(
        mockRoute('/demograph'),
        mockRoute('/welcome'),
        { timeline, store, log, api }
      )
      expect(result).toBeDefined() // redirected
      // currentViewDone should NOT be reset (post-guard didn't run)
      expect(store.browserEphemeral.currentViewDone).toBe(true)
    })
  })

  describe('Side effects: setLastRoute and recordRoute', () => {
    it('should set lastRoute when allowing navigation to allowAlways route', async () => {
      await executeGuards(
        mockRoute('/welcome'),
        mockRoute('/'),
        { timeline, store, log, api }
      )
      expect(store.setLastRoute).toHaveBeenCalledWith('welcome_anonymous')
      expect(store.recordRoute).toHaveBeenCalledWith('welcome_anonymous')
    })

    it('should set lastRoute when force navigating', async () => {
      store.browserEphemeral.forceNavigate = true

      await executeGuards(
        mockRoute('/demograph'),
        mockRoute('/welcome'),
        { timeline, store, log, api }
      )
      expect(store.setLastRoute).toHaveBeenCalledWith('demograph')
    })
  })

  describe('Full sequential flow', () => {
    it('should allow complete happy-path navigation through the experiment', async () => {
      // Simulate: welcome → consent → demograph → instructions → quiz → exp → debrief → feedback → thanks

      // 1. Welcome (allowAlways)
      let result = await executeGuards(mockRoute('/welcome'), mockRoute('/'), { timeline, store, log, api })
      expect(result).toBeUndefined()

      // Mark view as done and go to consent
      store.browserEphemeral.currentViewDone = true
      result = await executeGuards(mockRoute('/consent'), mockRoute('/welcome'), { timeline, store, log, api })
      expect(result).toBeUndefined()
      // completeConsent was NOT called yet (it's called when LEAVING consent)

      // Mark view as done and go to demograph (leaving consent triggers completeConsent)
      store.browserEphemeral.currentViewDone = true
      result = await executeGuards(mockRoute('/demograph'), mockRoute('/consent'), { timeline, store, log, api })
      expect(result).toBeUndefined()
      expect(api.completeConsent).toHaveBeenCalled()

      // Continue through the flow
      store.browserEphemeral.currentViewDone = true
      result = await executeGuards(mockRoute('/instructions'), mockRoute('/demograph'), { timeline, store, log, api })
      expect(result).toBeUndefined()

      store.browserEphemeral.currentViewDone = true
      result = await executeGuards(mockRoute('/quiz'), mockRoute('/instructions'), { timeline, store, log, api })
      expect(result).toBeUndefined()

      store.browserEphemeral.currentViewDone = true
      result = await executeGuards(mockRoute('/experiment'), mockRoute('/quiz'), { timeline, store, log, api })
      expect(result).toBeUndefined()

      store.browserEphemeral.currentViewDone = true
      result = await executeGuards(mockRoute('/debrief'), mockRoute('/experiment'), { timeline, store, log, api })
      expect(result).toBeUndefined()

      store.browserEphemeral.currentViewDone = true
      result = await executeGuards(mockRoute('/feedback'), mockRoute('/debrief'), { timeline, store, log, api })
      expect(result).toBeUndefined()

      // Leaving feedback triggers setDone
      store.browserEphemeral.currentViewDone = true
      result = await executeGuards(mockRoute('/thanks'), mockRoute('/feedback'), { timeline, store, log, api })
      expect(api.setDone).toHaveBeenCalled()
      expect(api.resetApp).toHaveBeenCalled()
      expect(result).toBeUndefined()
    })
  })

  describe('Unknown paths (not in timeline)', () => {
    it('should redirect unknown users at unknown paths to welcome', async () => {
      const result = await executeGuards(
        mockRoute('/nonexistent'),
        mockRoute('/welcome'),
        { timeline, store, log, api }
      )
      expect(result).toBeDefined()
      expect(result.path).toBe('/welcome')
    })

    it('should redirect known users at unknown paths to lastRoute', async () => {
      store.browserPersisted.knownUser = true
      store.browserPersisted.consented = true
      store.browserPersisted.lastRoute = 'demograph'

      const result = await executeGuards(
        mockRoute('/nonexistent'),
        mockRoute('/demograph'),
        { timeline, store, log, api }
      )
      expect(result).toBeDefined()
      expect(result.path).toBe('/demograph')
    })

    it('should redirect to welcome when lastRoute is not a valid timeline route', async () => {
      // This is the infinite redirect scenario: lastRoute='recruit' but recruit
      // is not in the timeline. resolveNameToPath should fall back to welcome.
      store.browserPersisted.lastRoute = 'recruit'

      const result = await executeGuards(
        mockRoute('/recruit'),
        mockRoute('/'),
        { timeline, store, log, api }
      )
      expect(result).toBeDefined()
      expect(result.path).toBe('/welcome') // falls back to welcome, not /recruit
    })
  })

  describe('skipBlockingGuards (dev/presentation mode)', () => {
    it('should allow navigation to any route when skipBlockingGuards is true', async () => {
      // Unknown, unconsented user trying to jump to instructions — normally blocked
      store.browserPersisted.lastRoute = 'welcome_anonymous'
      const result = await executeGuards(
        mockRoute('/instructions'),
        mockRoute('/welcome'),
        { timeline, store, log, api, skipBlockingGuards: true }
      )
      expect(result).toBeUndefined() // allowed
    })

    it('should still run state-setting guards (completeConsent) with skipBlockingGuards', async () => {
      store.browserPersisted.knownUser = true
      store.browserPersisted.consented = true
      store.browserPersisted.lastRoute = 'demograph'
      store.browserEphemeral.currentViewDone = true

      await executeGuards(
        mockRoute('/demograph'),
        mockRoute('/consent'),
        { timeline, store, log, api, skipBlockingGuards: true }
      )
      expect(api.completeConsent).toHaveBeenCalled()
    })

    it('should still run state-setting guards (setDone) with skipBlockingGuards', async () => {
      store.browserPersisted.knownUser = true
      store.browserPersisted.consented = true
      store.browserPersisted.done = true
      store.browserPersisted.lastRoute = 'thanks'
      store.browserEphemeral.currentViewDone = true

      await executeGuards(
        mockRoute('/thanks'),
        mockRoute('/feedback'),
        { timeline, store, log, api, skipBlockingGuards: true }
      )
      expect(api.setDone).toHaveBeenCalled()
    })

    it('should still run postGuard (setLastRoute, currentViewDone reset) with skipBlockingGuards', async () => {
      store.browserEphemeral.currentViewDone = true

      await executeGuards(
        mockRoute('/welcome'),
        mockRoute('/'),
        { timeline, store, log, api, skipBlockingGuards: true }
      )
      expect(store.setLastRoute).toHaveBeenCalledWith('welcome_anonymous')
      expect(store.recordRoute).toHaveBeenCalledWith('welcome_anonymous')
      expect(store.browserEphemeral.currentViewDone).toBe(false)
    })

    it('should allow unknown paths in skipBlockingGuards mode (dev pages handle resolution)', async () => {
      const result = await executeGuards(
        mockRoute('/nonexistent'),
        mockRoute('/welcome'),
        { timeline, store, log, api, skipBlockingGuards: true }
      )
      expect(result).toBeUndefined() // allowed — dev page handles its own resolution
    })

    it('should skip pinned route guard with skipBlockingGuards', async () => {
      store.config.mode = 'development'
      store.dev.pinnedRoute = 'demograph'

      // Normally pinned route would redirect to /demograph
      const result = await executeGuards(
        mockRoute('/instructions'),
        mockRoute('/welcome'),
        { timeline, store, log, api, skipBlockingGuards: true }
      )
      expect(result).toBeUndefined() // allowed — pinned route guard skipped
    })
  })

  describe('Parameterized route matching (getViewForPath)', () => {
    let paramTimeline

    beforeEach(() => {
      const mockApi = {
        config: { mode: 'production', localStorageKey: 'test_storage' },
        log: { debug: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
        store: {
          getRandomizedRouteByName: vi.fn().mockReturnValue(null),
          setRandomizedRoute: vi.fn(),
          registerStepper: vi.fn(),
          config: { mode: 'production' },
          browserPersisted: { seqtimeline: [], routes: [] },
        },
        sampleWithReplacement: vi.fn((options) => [options[0]]),
        getConditionByName: vi.fn(),
        randomAssignCondition: vi.fn((options) => options.conditionname[0]),
      }

      paramTimeline = new Timeline(mockApi)

      paramTimeline.pushSeqView({
        path: '/welcome',
        name: 'welcome_anonymous',
        component: MockComponent('Welcome'),
        meta: { allowAlways: true },
      })

      paramTimeline.pushSeqView({
        path: '/welcome/:service',
        name: 'welcome_referred',
        component: MockComponent('Welcome Referred'),
        meta: { allowAlways: true },
      })

      paramTimeline.pushSeqView({
        path: '/task/:id/step/:step',
        name: 'task_step',
        component: MockComponent('Task Step'),
      })

      paramTimeline.build()
    })

    it('should match exact paths first', () => {
      const result = paramTimeline.getViewForPath('/welcome')
      expect(result).not.toBeNull()
      expect(result.name).toBe('welcome_anonymous')
    })

    it('should match parameterized routes like /welcome/:service', () => {
      const result = paramTimeline.getViewForPath('/welcome/prolific')
      expect(result).not.toBeNull()
      expect(result.name).toBe('welcome_referred')
    })

    it('should match multi-param routes', () => {
      const result = paramTimeline.getViewForPath('/task/42/step/3')
      expect(result).not.toBeNull()
      expect(result.name).toBe('task_step')
    })

    it('should not match partial paths against parameterized routes', () => {
      // /welcome/prolific/extra should not match /welcome/:service
      const result = paramTimeline.getViewForPath('/welcome/prolific/extra')
      expect(result).toBeNull()
    })

    it('should return null for completely unknown paths', () => {
      const result = paramTimeline.getViewForPath('/unknown')
      expect(result).toBeNull()
    })

    it('should prefer exact match over parameterized match', () => {
      // /welcome should match welcome_anonymous, not welcome_referred
      const result = paramTimeline.getViewForPath('/welcome')
      expect(result.name).toBe('welcome_anonymous')
    })
  })

  describe('getRouteByName helper', () => {
    it('should find routes by name', () => {
      const route = timeline.getRouteByName('welcome_anonymous')
      expect(route).toBeDefined()
      expect(route.path).toBe('/welcome')
    })

    it('should return null for non-existent route names', () => {
      const route = timeline.getRouteByName('nonexistent')
      expect(route).toBeNull()
    })
  })
})
