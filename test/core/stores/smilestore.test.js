/**
 * @fileoverview The store's own actions and getters (stores/smilestore.js):
 * the flags, what each action writes to the record, the dev state, and the
 * values recorded from experiment code. Saving and loading are tested in
 * test/core/sync/.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import useSmileStore, { initCookieState, snapshotKey } from '../../../src/runtime/stores/smilestore'
import useLog from '../../../src/runtime/stores/log'

describe('smilestore', () => {
  let store, log

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.stubGlobal('$fetch', vi.fn(async (url, opts) => {
      if (opts?.method === 'POST') return { id: 'p-new' }
      const body = typeof opts?.body === 'string' ? JSON.parse(opts.body) : {}
      return { success: true, rev: body.rev }
    }))
    vi.stubGlobal('CompressionStream', undefined)
    store = useSmileStore()
    // A new store starts as unsaved; the tests below check which actions set it
    store.browserEphemeral.unsavedChanges = false
    log = useLog()
    for (const fn of [log.log, log.warn, log.error, log.debug, log.success]) fn.mockClear()
  })

  afterEach(() => {
    store.stopSnapshots()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('getters', () => {
    it('read the flags from the cookie state', () => {
      expect(store.isKnownUser).toBe(false)
      expect(store.isConsented).toBe(false)
      expect(store.isWithdrawn).toBe(false)
      expect(store.isDone).toBe(false)
      expect(store.lastRoute).toBe('landing')
      Object.assign(store.cookieState, { knownUser: true, consented: true, withdrawn: true, done: true, lastRoute: 'task', seedID: 's-1' })
      expect(store.isKnownUser).toBe(true)
      expect(store.isConsented).toBe(true)
      expect(store.isWithdrawn).toBe(true)
      expect(store.isDone).toBe(true)
      expect(store.lastRoute).toBe('task')
      expect(store.getSeedID).toBe('s-1')
    })

    it('browserPersisted has both tiers; a cookie value wins over a local one of the same name', () => {
      store.localState.conditions = { color: 'red' }
      store.cookieState.lastRoute = 'task'
      expect(store.browserPersisted.conditions).toEqual({ color: 'red' })
      expect(store.browserPersisted.lastRoute).toBe('task')
      expect(Object.keys(store.browserPersisted)).toEqual(
        expect.arrayContaining([...Object.keys(store.localState), ...Object.keys(store.cookieState)]),
      )
    })

    it('getShortId is the first 10 characters of the participant id', () => {
      expect(store.getShortId).toBe('N/A')
      store.cookieState.participantId = 'abcdefghij-klmnop'
      expect(store.getShortId).toBe('abcdefghij')
      store.cookieState.participantId = 'short'
      expect(store.getShortId).toBe('short')
    })

    it('getShortId is N/A for an id that is not a string', () => {
      store.cookieState.participantId = 12345678901234
      expect(store.getShortId).toBe('N/A')
      store.cookieState.participantId = ''
      expect(store.getShortId).toBe('N/A')
    })

    it('read the dev state, and are undefined without one', () => {
      const fn = () => {}
      store.dev.viewProvidesAutofill = fn
      store.dev.searchParams = '?a=1'
      expect(store.hasAutofill).toBe(fn)
      expect(store.searchParams).toBe('?a=1')
      store.dev = null
      expect(store.hasAutofill).toBeUndefined()
      expect(store.searchParams).toBeUndefined()
    })

    it('read the record and the local state', () => {
      store.data.recruitmentService = 'prolific'
      store.data.verifiedVisibility = true
      store.localState.conditions = { a: 1 }
      store.localState.randomizedRoutes = { r: 'x' }
      store.browserEphemeral.dataLoaded = true
      expect(store.recruitmentService).toBe('prolific')
      expect(store.verifiedVisibility).toBe(true)
      expect(store.getConditions).toEqual({ a: 1 })
      expect(store.getRandomizedRoutes).toEqual({ r: 'x' })
      expect(store.isDataLoaded).toBe(true)
    })
  })

  describe('participant flags', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-03-04T05:06:07.089Z'))
    })

    it('setConsented marks the cookie and the record, with the start time and the time zone', () => {
      store.setConsented()
      expect(store.cookieState.consented).toBe(true)
      expect(store.data.consented).toBe(true)
      expect(store.data.starttime).toBe(Date.parse('2026-03-04T05:06:07.089Z'))
      expect(store.data.userTimezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
      expect(store.data.userTimezoneOffset).toBe(new Date().getTimezoneOffset())
    })

    it('the local start time is the same instant, written with the zone offset', () => {
      store.setConsented()
      expect(store.data.starttimeLocal).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.089[+-]\d{2}:\d{2}$/)
      expect(Date.parse(store.data.starttimeLocal)).toBe(store.data.starttime)
    })

    it('setDone marks the cookie and the record, with the end time', () => {
      store.setDone()
      expect(store.cookieState.done).toBe(true)
      expect(store.data.done).toBe(true)
      expect(store.data.endtime).toBe(Date.now())
      expect(Date.parse(store.data.endtimeLocal)).toBe(Date.now())
    })

    it('setWithdrawn marks both, keeps the form in the private data, and sets the end time', () => {
      store.setWithdrawn({ reason: 'bored', email: 'a@b.c' })
      expect(store.cookieState.withdrawn).toBe(true)
      expect(store.data.withdrawn).toBe(true)
      expect(store.private.withdrawData).toEqual({ reason: 'bored', email: 'a@b.c' })
      expect(store.data.withdrawData).toBeUndefined()
      expect(store.data.endtime).toBe(Date.now())
      expect(Date.parse(store.data.endtimeLocal)).toBe(Date.now())
    })

    it('verifyVisibility writes the value to the local state and the record', () => {
      store.verifyVisibility(true)
      expect(store.localState.verifiedVisibility).toBe(true)
      expect(store.data.verifiedVisibility).toBe(true)
      store.verifyVisibility(false)
      expect(store.localState.verifiedVisibility).toBe(false)
      expect(store.data.verifiedVisibility).toBe(false)
    })

    it('setCompletionCode, resetApp and setLastRoute each set their one value', () => {
      store.setCompletionCode('ABC123')
      store.resetApp()
      store.setLastRoute('task')
      expect(store.cookieState.completionCode).toBe('ABC123')
      expect(store.localState.reset).toBe(true)
      expect(store.cookieState.lastRoute).toBe('task')
    })
  })

  describe('setDataLoaded', () => {
    it('copies the conditions, randomized routes and seed into the record the first time', () => {
      store.localState.conditions = { color: 'red' }
      store.localState.randomizedRoutes = { fork: 'a' }
      store.cookieState.seedID = 'seed-9'
      store.setDataLoaded()
      expect(store.browserEphemeral.dataLoaded).toBe(true)
      expect(store.data.conditions).toEqual({ color: 'red' })
      expect(store.data.randomizedRoutes).toEqual({ fork: 'a' })
      expect(store.data.seedID).toBe('seed-9')
    })

    it('does not copy again when the data is already loaded', () => {
      store.setDataLoaded()
      store.localState.conditions = { color: 'blue' }
      store.data.conditions = { color: 'from-server' }
      store.setDataLoaded()
      expect(store.data.conditions).toEqual({ color: 'from-server' })
    })
  })

  describe('setSeedID', () => {
    it('sets the seed and clears the conditions and randomized routes that came from the old one', () => {
      store.setCondition('color', 'red')
      store.setRandomizedRoute('fork', 'a')
      store.setSeedID('new-seed')
      expect(store.cookieState.seedID).toBe('new-seed')
      expect(store.cookieState.seedSet).toBe(true)
      expect(store.data.seedID).toBe('new-seed')
      expect(store.localState.conditions).toEqual({})
      expect(store.localState.randomizedRoutes).toEqual({})
      expect(store.data.conditions).toEqual({})
      expect(store.data.randomizedRoutes).toEqual({})
    })

    it('changes nothing when the seed is the one already set', () => {
      const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
      store.setSeedID('same')
      store.setCondition('color', 'red')
      store.setSeedID('same')
      expect(store.localState.conditions).toEqual({ color: 'red' })
      expect(store.data.conditions).toEqual({ color: 'red' })
      expect(debug).toHaveBeenCalledWith('SMILESTORE: seed already set to', 'same')
    })
  })

  describe('conditions and randomized routes', () => {
    it('are written to the local state and the record, and marked unsaved', () => {
      store.setCondition('color', 'red')
      expect(store.browserEphemeral.unsavedChanges).toBe(true)
      store.browserEphemeral.unsavedChanges = false
      store.setRandomizedRoute('fork', 'left')
      expect(store.browserEphemeral.unsavedChanges).toBe(true)
      expect(store.localState.conditions).toEqual({ color: 'red' })
      expect(store.data.conditions).toEqual({ color: 'red' })
      expect(store.localState.randomizedRoutes).toEqual({ fork: 'left' })
      expect(store.data.randomizedRoutes).toEqual({ fork: 'left' })
    })

    it('can be read back by name', () => {
      store.setCondition('color', 'red')
      store.setRandomizedRoute('fork', 'left')
      expect(store.getConditionByName('color')).toBe('red')
      expect(store.getConditionByName('missing')).toBeUndefined()
      expect(store.getRandomizedRouteByName('fork')).toBe('left')
      expect(store.getRandomizedRouteByName('missing')).toBeUndefined()
    })
  })

  describe('steppers', () => {
    it('registerStepper without a stepper makes an empty saved state and returns nothing', () => {
      store.localState.viewSteppers.task = { data: { old: true } }
      expect(store.registerStepper('task')).toBeUndefined()
      expect(store.localState.viewSteppers.task).toEqual({})
    })

    it('registerStepper keeps the stepper, saves it under the view, and returns it', () => {
      const stepper = { save: vi.fn() }
      const returned = store.registerStepper('task', stepper)
      expect(stepper.save).toHaveBeenCalledWith('task')
      expect(returned.save).toBe(stepper.save)
      expect(store.browserEphemeral.steppers.task.save).toBe(stepper.save)
    })

    it('registerStepper keeps the steppers of other views', () => {
      const a = { save: vi.fn(), name: 'a' }
      const b = { save: vi.fn(), name: 'b' }
      store.registerStepper('one', a)
      store.registerStepper('two', b)
      expect(store.browserEphemeral.steppers.one.name).toBe('a')
      expect(store.browserEphemeral.steppers.two.name).toBe('b')
    })

    it('getStepper returns the saved state of a view', () => {
      store.localState.viewSteppers.task = { data: { at: 3 } }
      expect(store.getStepper('task')).toEqual({ data: { at: 3 } })
      expect(store.getStepper('other')).toBeUndefined()
    })

    it('resetStepper empties a view\'s saved state, and does not create one for an unknown view', () => {
      store.localState.viewSteppers.task = { data: { at: 3 } }
      store.resetStepper('task')
      store.resetStepper('other')
      expect(store.localState.viewSteppers).toEqual({ task: {} })
    })
  })

  describe('recorded values', () => {
    it('recordData appends to studyData and marks the record unsaved', () => {
      store.recordData({ trial: 1 })
      store.recordData({ trial: 2 })
      expect(store.data.studyData).toEqual([{ trial: 1 }, { trial: 2 }])
      expect(store.browserEphemeral.unsavedChanges).toBe(true)
    })

    it('recordData stores null for a value that has no JSON form', () => {
      store.recordData(undefined)
      store.recordData(() => {})
      expect(store.data.studyData).toEqual([null, null])
    })

    it('recordProperty sets a top-level value, or null when there is nothing to store', () => {
      store.recordProperty('score', 12)
      store.recordProperty('nothing', undefined)
      expect(store.data.score).toBe(12)
      expect(store.data.nothing).toBeNull()
      expect(store.browserEphemeral.unsavedChanges).toBe(true)
    })

    it('recordData stores a copy, not the caller\'s object', () => {
      const trial = { n: 1, nested: { a: 1 } }
      store.recordData(trial)
      trial.nested.a = 2
      expect(store.data.studyData[0]).toEqual({ n: 1, nested: { a: 1 } })
    })

    it('cleanValue returns plain JSON and logs nothing for a clean value', () => {
      expect(store.cleanValue({ a: [1, 'b', null] }, 'x')).toEqual({ a: [1, 'b', null] })
      expect(log.warn).not.toHaveBeenCalled()
      expect(store.data.smileWarnings).toBeUndefined()
    })

    it('cleanValue records what it changed in data.smileWarnings and logs it', () => {
      const cleaned = store.cleanValue({ big: 10n }, 'studyData[0]')
      expect(typeof cleaned.big).not.toBe('bigint')
      expect(log.warn).toHaveBeenCalledTimes(1)
      expect(log.warn.mock.calls[0][0]).toMatch(/^SMILE: recorded value cleaned at studyData\[0\]\.big: /)
      expect(JSON.stringify(store.data.smileWarnings)).toContain('studyData[0].big')
    })

    it('cleanValue logs the first five changes and then a count of the rest', () => {
      const value = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`k${i}`, BigInt(i)]))
      store.cleanValue(value, 'p')
      expect(log.warn).toHaveBeenCalledTimes(6)
      expect(log.warn).toHaveBeenLastCalledWith('SMILE: ...and 3 more (see data.smileWarnings)')
    })

    it('cleanValue does not log a count when there are exactly five changes', () => {
      const value = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`k${i}`, BigInt(i)]))
      store.cleanValue(value, 'p')
      expect(log.warn).toHaveBeenCalledTimes(5)
    })

    it('recordWindowEvent with data appends the event, its time and a cleaned copy of the data', () => {
      vi.useFakeTimers()
      vi.setSystemTime(1_700_000_000_000)
      store.recordWindowEvent('resize', { width: 800, id: 5n })
      expect(store.data.browserData).toHaveLength(1)
      expect(store.data.browserData[0].event_type).toBe('resize')
      expect(store.data.browserData[0].timestamp).toBe(1_700_000_000_000)
      expect(store.data.browserData[0].event_data.width).toBe(800)
      expect(typeof store.data.browserData[0].event_data.id).not.toBe('bigint')
      expect(log.warn.mock.calls[0][0]).toContain('browserData[0].event_data.id')
    })

    it('recordWindowEvent without data appends the event and its time only', () => {
      store.recordWindowEvent('blur')
      store.recordWindowEvent('focus', null)
      expect(store.data.browserData.map(e => e.event_type)).toEqual(['blur', 'focus'])
      expect('event_data' in store.data.browserData[0]).toBe(false)
      expect('event_data' in store.data.browserData[1]).toBe(false)
    })

    it('recordWindowEvent numbers the warning path by the event\'s position', () => {
      store.recordWindowEvent('blur')
      store.recordWindowEvent('resize', { id: 5n })
      expect(log.warn.mock.calls[0][0]).toContain('browserData[1].event_data.id')
    })
  })

  describe('recordRoute', () => {
    it('appends the route with its time and no time delta', () => {
      vi.useFakeTimers()
      vi.setSystemTime(1000)
      store.recordRoute('welcome')
      expect(store.data.routeOrder).toEqual([{ route: 'welcome', timestamp: 1000, timeDelta: null }])
      expect(store.browserEphemeral.unsavedChanges).toBe(true)
    })

    it('fills in the time spent on the previous route', () => {
      vi.useFakeTimers()
      vi.setSystemTime(1000)
      store.recordRoute('welcome')
      vi.setSystemTime(4500)
      store.recordRoute('consent')
      vi.setSystemTime(5000)
      store.recordRoute('task')
      expect(store.data.routeOrder).toEqual([
        { route: 'welcome', timestamp: 1000, timeDelta: 3500 },
        { route: 'consent', timestamp: 4500, timeDelta: 500 },
        { route: 'task', timestamp: 5000, timeDelta: null },
      ])
    })
  })

  describe('recruitment service', () => {
    it('puts the service in the record and its ids in the private data', () => {
      store.setRecruitmentService('prolific', { prolific_id: 'P1' })
      expect(store.data.recruitmentService).toBe('prolific')
      expect(store.private.recruitmentInfo).toEqual({ prolific_id: 'P1' })
      expect(store.data.recruitmentInfo).toBeUndefined()
      expect(store.browserEphemeral.unsavedChanges).toBe(true)
    })
  })

  describe('browser fingerprint', () => {
    const settle = async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve()
    }

    it('stores the IP address from the lookup with the browser\'s details', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ip: '203.0.113.7' }) })))
      store.getBrowserFingerprint()
      await settle()
      expect(fetch).toHaveBeenCalledWith('https://api.ipify.org/?format=json')
      expect(store.private.browserFingerprint).toEqual({
        ip: '203.0.113.7',
        userAgent: window.navigator.userAgent,
        language: window.navigator.language,
        webdriver: window.navigator.webdriver,
      })
      expect(log.success).toHaveBeenCalledWith(expect.stringContaining('203.0.113.7'))
    })

    it('stores "unknown" when the lookup answers with an error status', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })))
      store.getBrowserFingerprint()
      await settle()
      expect(store.private.browserFingerprint.ip).toBe('unknown')
      expect(store.private.browserFingerprint.userAgent).toBe(window.navigator.userAgent)
      expect(String(log.log.mock.calls[0][0])).toContain('HTTP 503')
    })

    it('stores "unknown" when the lookup fails', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => {
        throw new Error('offline')
      }))
      store.getBrowserFingerprint()
      await settle()
      expect(store.private.browserFingerprint.ip).toBe('unknown')
    })

    it('stores "unknown" when the answer has no ip', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
      store.getBrowserFingerprint()
      await settle()
      expect(store.private.browserFingerprint.ip).toBe('unknown')
      expect(log.success).not.toHaveBeenCalled()
    })

    it('keeps the fingerprint out of the record', async () => {
      store.setFingerPrint('1.2.3.4', 'agent', 'en', false)
      expect(store.private.browserFingerprint).toEqual({ ip: '1.2.3.4', userAgent: 'agent', language: 'en', webdriver: false })
      expect(JSON.stringify(store.data)).not.toContain('1.2.3.4')
    })
  })

  describe('autofill (dev tools)', () => {
    it('setAutofill keeps the view\'s function and autofill runs it', () => {
      const fn = vi.fn()
      store.setAutofill(fn)
      expect(store.hasAutofill).toBe(fn)
      store.autofill()
      expect(fn).toHaveBeenCalledTimes(1)
      expect(log.warn).toHaveBeenCalledWith('DEV MODE: View was autofilled by a user-provided component function')
    })

    it('removeAutofill clears it, and autofill then does nothing', () => {
      const fn = vi.fn()
      store.setAutofill(fn)
      store.removeAutofill()
      expect(store.dev.viewProvidesAutofill).toBeNull()
      store.autofill()
      expect(fn).not.toHaveBeenCalled()
      expect(log.warn).not.toHaveBeenCalled()
    })

    it('all three do nothing without a dev state', () => {
      store.dev = null
      expect(() => {
        store.setAutofill(() => {})
        store.removeAutofill()
        store.autofill()
      }).not.toThrow()
      expect(store.dev).toBeNull()
    })
  })

  describe('setKnown', () => {
    it('marks the participant known, creates the record, and takes the server\'s id', async () => {
      store.cookieState.seedID = 'seed-3'
      await store.setKnown()
      expect(store.cookieState.knownUser).toBe(true)
      expect(store.data.seedID).toBe('seed-3')
      expect(store.cookieState.participantId).toBe('p-new')
      expect(store.isDataLoaded).toBe(true)
      expect($fetch.mock.calls[0][1].method).toBe('POST')
      expect(log.error).not.toHaveBeenCalled()
    })

    it('writes the local snapshot at once', async () => {
      await store.setKnown()
      const snapshot = JSON.parse(localStorage.getItem(snapshotKey))
      expect(snapshot.participantId).toBe('p-new')
    })

    it('still marks the participant known and loaded when the record can\'t be created', async () => {
      $fetch.mockImplementation(async () => {
        throw Object.assign(new Error('server down'), { statusCode: 500 })
      })
      await store.setKnown()
      expect(store.cookieState.knownUser).toBe(true)
      expect(store.isDataLoaded).toBe(true)
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('could not create participant record (it will be tried again)'))
    })
  })

  describe('saveData', () => {
    it('is the older name for sync()', async () => {
      const sync = vi.spyOn(store, 'sync').mockResolvedValue({ ok: true, rev: 4, error: null })
      expect(await store.saveData()).toEqual({ ok: true, rev: 4, error: null })
      expect(sync).toHaveBeenCalledTimes(1)
    })
  })

  describe('clearing', () => {
    it('clearSmileCookies puts every cookie value back to its default', () => {
      Object.assign(store.cookieState, { knownUser: true, lastRoute: 'task', participantId: 'p-1', completionCode: 'C', consented: true, withdrawn: true, done: true, seedID: 's', seedSet: true })
      store.clearSmileCookies()
      expect(store.cookieState).toEqual(initCookieState)
    })

    it('resetLocal clears the cookies, the local snapshot and the state in memory', () => {
      store.cookieState.participantId = 'p-1'
      store.setDataLoaded()
      store.recordData({ trial: 1 })
      store.captureSnapshot()
      expect(localStorage.getItem(snapshotKey)).not.toBeNull()

      store.resetLocal()
      expect(localStorage.getItem(snapshotKey)).toBeNull()
      expect(store.cookieState).toEqual(initCookieState)
      expect(store.data.studyData).toEqual([])
      expect(store.isDataLoaded).toBe(false)
    })
  })
})
