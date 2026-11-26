/**
 * @fileoverview SmileAPI methods that useAPI.test.js doesn't reach. The API
 * object is built directly on a real store, with a timeline and a log that
 * record their calls.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNuxtApp } from '#imports'
import { SmileAPI } from '../../../src/runtime/composables/useAPI.js'
import useSmileStore from '../../../src/runtime/stores/smilestore'
import * as participant from '../../../src/runtime/core/participant-actions.js'

vi.mock('../../../src/runtime/core/participant-actions.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    resetLocalState: vi.fn(),
    completeConsent: vi.fn(async () => {}),
    connectDB: vi.fn(async () => {}),
    randomSeed: vi.fn(),
  }
})

const VIEWS = [
  { path: '/', name: 'landing' },
  { path: '/task', name: 'task' },
]

describe('SmileAPI', () => {
  let store, log, timeline, route, api, nuxtTimeline

  function build(runtimeConfig = { app: { baseURL: '/study/' }, public: { smile: {} } }) {
    return new SmileAPI(store, log, route, { push: vi.fn() }, timeline, runtimeConfig)
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    store = useSmileStore()
    store.browserEphemeral.unsavedChanges = false
    log = {
      debug: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn(),
      clearPageHistory: vi.fn(), addToHistory: vi.fn(),
    }
    timeline = {
      goNextView: vi.fn(callback => callback?.()),
      goPrevView: vi.fn(callback => callback?.()),
      goToView: vi.fn(async () => {}),
      nextView: vi.fn(() => null),
      prevView: vi.fn(() => null),
    }
    route = { path: '/task', name: 'slug', query: {}, params: {} }
    nuxtTimeline = { getViewForPath: vi.fn(path => VIEWS.find(v => v.path === path) || null) }
    vi.mocked(useNuxtApp).mockReturnValue({ $timeline: nuxtTimeline })
    for (const fn of Object.values(participant)) fn.mockClear?.()
    api = build()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    store.stopSnapshots()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('store access', () => {
    it('all_data has the private data and the record', () => {
      expect(api.all_data.private).toBe(store.private)
      expect(api.all_data.data).toBe(store.data)
    })

    it('all_config has the persisted state, the dev state, the code info and the config', () => {
      store.config.github = { repo: 'r' }
      store.cookieState.lastRoute = 'task'
      const all = api.all_config
      expect(all.browserPersisted.lastRoute).toBe('task')
      expect(all.dev).toBe(store.dev)
      expect(all.code).toEqual({ repo: 'r' })
      expect(all.config).toBe(store.config)
    })

    it('syncStatus is the sync loop\'s state in the store', () => {
      store.browserEphemeral.sync = { status: 'pending', error: null, retryAt: null }
      expect(api.syncStatus).toEqual({ status: 'pending', error: null, retryAt: null })
    })
  })

  describe('log', () => {
    it('passes each call and its arguments to the log store', () => {
      api.log.debug('a', 1)
      api.log.log('b')
      api.log.warn('c')
      api.log.error('d')
      api.log.success('e')
      api.log.addToHistory('f', 2)
      api.log.clearPageHistory()
      expect(log.debug).toHaveBeenCalledWith('a', 1)
      expect(log.log).toHaveBeenCalledWith('b')
      expect(log.warn).toHaveBeenCalledWith('c')
      expect(log.error).toHaveBeenCalledWith('d')
      expect(log.success).toHaveBeenCalledWith('e')
      expect(log.addToHistory).toHaveBeenCalledWith('f', 2)
      expect(log.clearPageHistory).toHaveBeenCalledTimes(1)
    })
  })

  describe('navigation', () => {
    /** A scrolled .device-container, which is what scrollToTop resets. */
    function scrolledContainer() {
      document.body.innerHTML = '<div class="device-container"></div>'
      const el = document.querySelector('.device-container')
      el.scrollTop = 250
      return el
    }

    it('goNextView scrolls the experiment\'s container to the top after navigating', () => {
      const el = scrolledContainer()
      api.goNextView()
      expect(timeline.goNextView).toHaveBeenCalledTimes(1)
      expect(el.scrollTop).toBe(0)
    })

    it('goNextView(false) leaves the scroll position', () => {
      const el = scrolledContainer()
      api.goNextView(false)
      expect(timeline.goNextView).toHaveBeenCalledTimes(1)
      expect(el.scrollTop).toBe(250)
    })

    it('goPrevView scrolls to the top unless told not to', () => {
      const el = scrolledContainer()
      api.goPrevView(false)
      expect(el.scrollTop).toBe(250)
      api.goPrevView()
      expect(timeline.goPrevView).toHaveBeenCalledTimes(2)
      expect(el.scrollTop).toBe(0)
    })

    it('goToView forces by default and scrolls to the top', async () => {
      const el = scrolledContainer()
      await api.goToView('task')
      expect(timeline.goToView).toHaveBeenCalledWith('task', true)
      expect(el.scrollTop).toBe(0)
    })

    it('goToView passes force on and can leave the scroll position', async () => {
      const el = scrolledContainer()
      await api.goToView('task', false, false)
      expect(timeline.goToView).toHaveBeenCalledWith('task', false)
      expect(el.scrollTop).toBe(250)
    })

    it('scrollToTop does nothing when the page has no experiment container', () => {
      expect(() => api.scrollToTop()).not.toThrow()
    })

    it('hasNextView, hasPrevView, nextView and prevView read the timeline', () => {
      expect(api.hasNextView()).toBe(false)
      expect(api.hasPrevView()).toBe(false)
      expect(api.nextView()).toBeNull()
      timeline.nextView.mockReturnValue({ name: 'task' })
      timeline.prevView.mockReturnValue({ name: 'landing' })
      expect(api.hasNextView()).toBe(true)
      expect(api.hasPrevView()).toBe(true)
      expect(api.nextView()).toEqual({ name: 'task' })
      expect(api.prevView()).toEqual({ name: 'landing' })
    })
  })

  describe('current route', () => {
    it('is the timeline view for the current path', () => {
      expect(api.currentRouteName()).toBe('task')
      expect(api.currentViewName()).toBe('task')
    })

    it('is looked up without the /dev or /presentation prefix', () => {
      route.path = '/dev/task'
      expect(api.currentRouteName()).toBe('task')
      route.path = '/presentation/task'
      expect(api.currentRouteName()).toBe('task')
      route.path = '/presentation'
      expect(api.currentRouteName()).toBe('landing')
      expect(nuxtTimeline.getViewForPath).toHaveBeenLastCalledWith('/')
    })

    it('is "recruit" at the dev root, which shows the recruitment chooser', () => {
      route.path = '/dev'
      expect(api.currentRouteName()).toBe('recruit')
      route.path = '/dev/'
      expect(api.currentRouteName()).toBe('recruit')
      expect(nuxtTimeline.getViewForPath).not.toHaveBeenCalled()
    })

    it('is undefined for a path that is not in the timeline', () => {
      route.path = '/nowhere'
      expect(api.currentRouteName()).toBeUndefined()
    })

    it('is undefined when the app has no timeline yet', () => {
      vi.mocked(useNuxtApp).mockReturnValue({})
      expect(api.currentRouteName()).toBeUndefined()
      vi.mocked(useNuxtApp).mockReturnValue(null)
      expect(api.currentRouteName()).toBeUndefined()
    })

    it('is undefined when the Nuxt app can\'t be reached (outside a component)', () => {
      vi.mocked(useNuxtApp).mockImplementation(() => {
        throw new Error('no nuxt instance')
      })
      expect(api.currentRouteName()).toBeUndefined()
    })

    it('is undefined where there is no window', () => {
      vi.stubGlobal('window', undefined)
      expect(api.currentRouteName()).toBeUndefined()
    })

    it('currentRouteInfo is the route object', () => {
      expect(api.currentRouteInfo()).toBe(route)
    })
  })

  describe('URLs', () => {
    it('getPublicUrl and getStaticUrl are under the app\'s base URL', () => {
      expect(api.getPublicUrl('img/a.png')).toBe('/study/img/a.png')
      expect(api.getPublicUrl('/img/a.png')).toBe('/study/img/a.png')
      expect(api.getStaticUrl('img/a.png')).toBe('/study/img/a.png')
    })

    it('getCoreStaticUrl is under _smile/ in the base URL', () => {
      expect(api.getCoreStaticUrl('images/smile.svg')).toBe('/study/_smile/images/smile.svg')
      expect(api.getCoreStaticUrl('/images/smile.svg')).toBe('/study/_smile/images/smile.svg')
    })

    it('use the root when there is no runtime config', () => {
      api = build(null)
      expect(api.getPublicUrl('a.png')).toBe('/a.png')
      expect(api.getCoreStaticUrl('a.png')).toBe('/_smile/a.png')
    })
  })

  describe('reset and reload', () => {
    it('resetApp sets the reset flag, and isResetApp reads it', () => {
      expect(api.isResetApp()).toBe(false)
      api.resetApp()
      expect(api.isResetApp()).toBe(true)
    })

    it('resetStore resets the store\'s local state', () => {
      const reset = vi.spyOn(store, 'resetLocal').mockImplementation(() => {})
      api.resetStore()
      expect(reset).toHaveBeenCalledTimes(1)
    })

    it('resetLocalState passes the store and the base URL', () => {
      api.resetLocalState()
      expect(participant.resetLocalState).toHaveBeenCalledWith(store, '/study/')
      api = build(null)
      api.resetLocalState()
      expect(participant.resetLocalState).toHaveBeenLastCalledWith(store, undefined)
    })

    it('reloadBrowser reloads the page', () => {
      const reload = vi.fn()
      vi.stubGlobal('location', { ...window.location, reload })
      api.reloadBrowser()
      expect(reload).toHaveBeenCalledTimes(1)
    })

    it('reloadBrowser does nothing where there is no window', () => {
      vi.stubGlobal('window', undefined)
      expect(() => api.reloadBrowser()).not.toThrow()
    })
  })

  describe('app components and config', () => {
    afterEach(() => {
      delete store.config.global_app_components
      delete store.config.runtime
    })

    it('getAppComponent logs an error and returns undefined before any component is set', () => {
      expect(api.getAppComponent('logo')).toBeUndefined()
      expect(log.error).toHaveBeenCalledWith('SMILE API: getAppComponent() key not found:', 'logo')
    })

    it('setAppComponent stores a component, and an unknown key is still an error', () => {
      const Logo = { name: 'Logo' }
      api.setAppComponent('logo', Logo)
      expect(api.getAppComponent('logo')).toEqual(Logo)
      expect(log.error).not.toHaveBeenCalled()
      expect(api.getAppComponent('other')).toBeUndefined()
      expect(log.error).toHaveBeenCalledWith('SMILE API: getAppComponent() key not found:', 'other')
    })

    it('setRuntimeConfig changes a key the config already has', () => {
      const before = store.config.maxWrites
      api.setRuntimeConfig('maxWrites', 123)
      expect(store.config.maxWrites).toBe(123)
      expect(store.config.runtime?.maxWrites).toBeUndefined()
      api.setRuntimeConfig('maxWrites', before)
    })

    it('setRuntimeConfig keeps a new key under config.runtime', () => {
      api.setRuntimeConfig('myStudySetting', 'a')
      api.setRuntimeConfig('another', 2)
      expect(store.config.runtime).toEqual({ myStudySetting: 'a', another: 2 })
      expect(api.getConfig('myStudySetting')).toBe('a')
    })

    it('setRuntimeConfig copies the config into the record, without the app components', () => {
      api.setAppComponent('logo', { name: 'Logo' })
      api.setRuntimeConfig('myStudySetting', 'a')
      expect(store.data.smileConfig.runtime).toEqual({ myStudySetting: 'a' })
      expect(store.data.smileConfig.codeName).toBe(store.config.codeName)
      expect('global_app_components' in store.data.smileConfig).toBe(false)
    })

    it('getConfig reads the main config first, then the runtime config', () => {
      expect(api.getConfig('codeName')).toBe(store.config.codeName)
      expect(log.error).not.toHaveBeenCalled()
    })

    it('getConfig logs an error and returns null for an unknown key', () => {
      expect(api.getConfig('nope')).toBeNull()
      expect(log.error).toHaveBeenCalledWith('SMILE API: getConfig() key not found', 'nope')
      api.setRuntimeConfig('known', 1)
      expect(api.getConfig('nope')).toBeNull()
    })
  })

  describe('participant state', () => {
    it('setKnown returns what the store\'s setKnown resolves to', async () => {
      vi.spyOn(store, 'setKnown').mockResolvedValue('done')
      expect(await api.setKnown()).toBe('done')
    })

    it('setDone, setConsented, setWithdrawn and verifyVisibility change the store', () => {
      api.setDone()
      api.setConsented()
      api.setWithdrawn({ reason: 'r' })
      api.verifyVisibility(true)
      expect(store.isDone).toBe(true)
      expect(store.isConsented).toBe(true)
      expect(store.isWithdrawn).toBe(true)
      expect(store.private.withdrawData).toEqual({ reason: 'r' })
      expect(api.getVerifiedVisibility()).toBe(true)
    })

    it('connectDB and completeConsent pass the store to the shared actions', async () => {
      await api.connectDB()
      await api.completeConsent()
      expect(participant.connectDB).toHaveBeenCalledWith(store)
      expect(participant.completeConsent).toHaveBeenCalledWith(store)
    })

    it('setCompletionCode stores the code', () => {
      api.setCompletionCode('XYZ')
      expect(store.cookieState.completionCode).toBe('XYZ')
    })

    it('getRecruitmentService and getConditionByName read the store', () => {
      store.setRecruitmentService('prolific', {})
      store.setCondition('color', 'red')
      expect(api.getRecruitmentService()).toBe('prolific')
      expect(api.getConditionByName('color')).toBe('red')
    })

    it('getBrowserFingerprint and recordWindowEvent call the store', () => {
      const fingerprint = vi.spyOn(store, 'getBrowserFingerprint').mockImplementation(() => {})
      api.getBrowserFingerprint()
      expect(fingerprint).toHaveBeenCalledTimes(1)
      api.recordWindowEvent('blur')
      api.recordWindowEvent('resize', { width: 5 })
      expect(store.data.browserData.map(e => e.event_type)).toEqual(['blur', 'resize'])
      expect(store.data.browserData[1].event_data).toEqual({ width: 5 })
    })

    it('recordProperty writes a top-level value', () => {
      api.recordProperty('score', 3)
      expect(store.data.score).toBe(3)
    })

    it('randomSeed passes the seed on', () => {
      api.randomSeed('abc')
      expect(participant.randomSeed).toHaveBeenCalledWith('abc')
    })
  })

  describe('saving', () => {
    it('sync and saveData both return the store\'s sync result', async () => {
      const sync = vi.spyOn(store, 'sync').mockResolvedValue({ ok: true, rev: 2, error: null })
      expect(await api.sync()).toEqual({ ok: true, rev: 2, error: null })
      expect(await api.saveData()).toEqual({ ok: true, rev: 2, error: null })
      expect(sync).toHaveBeenCalledTimes(2)
    })
  })

  describe('dev tools autofill', () => {
    it('hasAutofill and autofill use the store\'s', () => {
      const fn = vi.fn()
      store.setAutofill(fn)
      expect(api.hasAutofill()).toBe(fn)
      api.autofill()
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('setAutofill and removeAutofill do not change the store outside a development build', () => {
      const fn = vi.fn()
      api.setAutofill(fn)
      expect(store.dev.viewProvidesAutofill).toBeNull()
      store.setAutofill(fn)
      api.removeAutofill()
      expect(store.dev.viewProvidesAutofill).toBe(fn)
      expect(log.debug).toHaveBeenCalledWith('SMILEAPI: registering autofill function')
      expect(log.debug).toHaveBeenCalledWith('SMILEAPI: removing autofill')
    })
  })

  describe('isBrowserTooSmall', () => {
    beforeEach(() => {
      store.config.windowsizerAggressive = true
      store.config.windowsizerRequest = { width: 800, height: 600 }
      store.data.verifiedVisibility = true
    })

    afterEach(() => {
      store.config.windowsizerAggressive = false
    })

    it('is true when the width or the height is under the requested size plus the margins', () => {
      // margins: 16 across, 28 down
      expect(api.isBrowserTooSmall(816, 628)).toBe(false)
      expect(api.isBrowserTooSmall(815, 628)).toBe(true)
      expect(api.isBrowserTooSmall(816, 627)).toBe(true)
      expect(api.isBrowserTooSmall(2000, 100)).toBe(true)
    })

    it('is false when the aggressive setting is off', () => {
      store.config.windowsizerAggressive = false
      expect(api.isBrowserTooSmall(10, 10)).toBe(false)
    })

    it('is false until the participant has passed the window size page', () => {
      store.data.verifiedVisibility = false
      expect(api.isBrowserTooSmall(10, 10)).toBe(false)
    })

    it('is false for a participant who has withdrawn', () => {
      store.cookieState.withdrawn = true
      expect(api.isBrowserTooSmall(10, 10)).toBe(false)
    })
  })

  describe('recordPageData', () => {
    it('records under visit_0 when the record has no routeOrder', () => {
      delete store.data.routeOrder
      expect(api.recordPageData({ a: 1 })).toBe(true)
      expect(store.data.pageData_task.visit_0.data).toEqual([{ a: 1 }])
      expect(store.browserEphemeral.unsavedChanges).toBe(true)
    })

    it('stores null for a value with no JSON form', () => {
      api.recordPageData(undefined, 'page')
      expect(store.data.pageData_page.visit_0.data).toEqual([null])
      expect(store.data.pageData_page.visit_0.timestamps).toHaveLength(1)
    })
  })

  describe('randomAssignCondition', () => {
    it('assigns one of the possibilities and remembers it', () => {
      const assigned = api.randomAssignCondition({ color: ['red', 'blue'] })
      expect(['red', 'blue']).toContain(assigned)
      expect(store.getConditionByName('color')).toBe(assigned)
      expect(store.localState.possibleConditions.color).toEqual(['red', 'blue'])
      expect(store.data.conditions.color).toBe(assigned)
    })

    it('returns the condition already assigned instead of drawing again', () => {
      store.setCondition('color', 'red')
      for (let i = 0; i < 20; i++) {
        expect(api.randomAssignCondition({ color: ['green', 'blue'] })).toBe('red')
      }
      expect(store.localState.possibleConditions.color).toBeUndefined()
    })

    it('uses the weights', () => {
      expect(api.randomAssignCondition({ color: ['red', 'blue'], weights: [0, 1] })).toBe('blue')
      expect(api.randomAssignCondition({ shape: ['square', 'circle'], weights: [1, 0] })).toBe('square')
    })

    it('refuses more than one condition name at a time', () => {
      expect(api.randomAssignCondition({ color: ['red'], shape: ['square'] })).toBeNull()
      expect(log.error).toHaveBeenCalledWith('SMILE API: randomAssignCondition() only accepts one condition name at a time')
      expect(store.localState.conditions).toEqual({})
    })

    it('refuses weights of the wrong length, and assigns nothing', () => {
      expect(api.randomAssignCondition({ color: ['red', 'blue'], weights: [1] })).toBeNull()
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('weights must be the same length'))
      expect(store.getConditionByName('color')).toBeUndefined()
    })
  })

  describe('preloading', () => {
    it('preloadAllImages creates an image for each path, under the base URL', () => {
      const created = []
      vi.spyOn(window, 'Image').mockImplementation(function () {
        created.push(this)
      })
      api = build({ app: { baseURL: '/study/' }, public: { smile: { preloadImages: ['a.png', '/img/b.png'] } } })
      api.preloadAllImages()
      expect(created.map(img => img.src)).toEqual(['/study/a.png', '/study/img/b.png'])
      expect(log.debug).toHaveBeenCalledWith('Preloading 2 image(s)')
    })

    it('preloadAllVideos creates a video element for each path, set to load at once', () => {
      const created = []
      const realCreate = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        const el = realCreate(tag)
        if (tag === 'video') created.push(el)
        return el
      })
      api = build({ app: { baseURL: '/' }, public: { smile: { preloadVideos: ['v/intro.mp4'] } } })
      api.preloadAllVideos()
      expect(created).toHaveLength(1)
      expect(created[0].preload).toBe('auto')
      expect(created[0].getAttribute('src')).toBe('/v/intro.mp4')
      expect(log.debug).toHaveBeenCalledWith('Preloading 1 video(s)')
    })

    it('both do nothing when the module option is not set', () => {
      const image = vi.spyOn(window, 'Image')
      api.preloadAllImages()
      api.preloadAllVideos()
      expect(image).not.toHaveBeenCalled()
      expect(log.debug).toHaveBeenCalledWith('Preloading 0 image(s)')
      expect(log.debug).toHaveBeenCalledWith('Preloading 0 video(s)')
      api = build(null)
      expect(() => {
        api.preloadAllImages()
        api.preloadAllVideos()
      }).not.toThrow()
    })

    it('both do nothing where there is no window', () => {
      api = build({ public: { smile: { preloadImages: ['a.png'], preloadVideos: ['a.mp4'] } } })
      vi.stubGlobal('window', undefined)
      expect(() => {
        api.preloadAllImages()
        api.preloadAllVideos()
      }).not.toThrow()
    })
  })
})
