import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import useSmileStore, { snapshotKey, LOAD_RETRY_DELAYS } from '../../../src/runtime/stores/smilestore'
import useLog from '../../../src/runtime/stores/log'
import { Stepper } from '../../../src/runtime/core/stepper/Stepper'
import { legacyDataKey, conflictCopyKey, SNAPSHOT_VERSION } from '../../../src/runtime/core/sync/snapshot.js'
import { BAD_VALUES } from '../../fixtures/bad-values.js'
import { decodeBody } from '../../../src/runtime/server/utils/read-body'

const RealCompressionStream = globalThis.CompressionStream

/**
 * Step 3 of plans/sync_engine.md: the store keeps one local snapshot (the
 * record and the position, in one localStorage value), and on load uses the
 * copy with the higher rev, local or server. Replaces the tests of the local
 * data backup (#42), whose cases are all here.
 */

const PID = 'p-1'

const readSnapshot = () => JSON.parse(localStorage.getItem(snapshotKey))
const writeSnapshot = value => localStorage.setItem(snapshotKey, typeof value === 'string' ? value : JSON.stringify(value))

/** A store connected to participant PID, as after consent or a successful load. */
function connectedStore() {
  const store = useSmileStore()
  store.cookieState.participantId = PID
  store.setDataLoaded()
  return store
}

/**
 * A localStorage stand-in that counts calls and can be made to fail. (Spying
 * on Storage.prototype doesn't reach the test environment's localStorage on
 * every Node version.)
 */
function stubStorage({ failing = null } = {}) {
  const real = globalThis.localStorage
  const state = { failing }
  const check = () => {
    if (state.failing) throw state.failing
  }
  const storage = {
    state,
    getItem: vi.fn((key) => {
      check()
      return real.getItem(key)
    }),
    setItem: vi.fn((key, value) => {
      check()
      real.setItem(key, value)
    }),
    removeItem: vi.fn((key) => {
      check()
      real.removeItem(key)
    }),
  }
  vi.stubGlobal('localStorage', storage)
  return storage
}

const stepperState = at => ({ data: { stepperState: { id: '/', currentIndex: at, states: [] } } })

function storedSnapshot(overrides = {}) {
  return {
    v: SNAPSHOT_VERSION,
    participantId: PID,
    rev: 5,
    savedRev: 2,
    local: { totalWrites: 3 },
    data: {
      routeOrder: [{ route: 'stroop', timestamp: 1 }],
      consented: true,
      pageData_stroop: { visit_0: { timestamps: [1, 2, 3, 4], data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] } },
    },
    resume: { view: 'stroop', viewSteppers: { stroop: stepperState(4) }, conditions: { color: 'red' } },
    ...overrides,
  }
}

/**
 * The server's answers, as the routes give them: a save answers with the rev
 * it stored (the client counts a save only when the answer carries it).
 */
async function saveRoute(url, opts) {
  if (opts?.method === 'PATCH' && !String(url).endsWith('/private')) {
    const text = typeof opts.body === 'string' ? opts.body : (await decodeBody(opts.body)).text
    const body = JSON.parse(text)
    if (typeof body.rev === 'number') return { success: true, rev: body.rev }
  }
  return { success: true }
}

/** An error as $fetch throws it for the server's own 403 or 404 (shared/save-answers.js) */
const marked = (statusCode, smile) => Object.assign(new Error('refused'), { statusCode, data: { data: { smile } } })

describe('the store\'s local snapshot', () => {
  let fetchMock
  const savedDelays = [...LOAD_RETRY_DELAYS]

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    fetchMock = vi.fn(saveRoute)
    vi.stubGlobal('$fetch', fetchMock)
    // As a browser without CompressionStream: the bodies are sent as text, so
    // the tests can read them. The gzip path has its own test below and
    // test/core/sync/compress.test.js.
    vi.stubGlobal('CompressionStream', undefined)
    // Fake timers that keep pace with the clock, so the sync loop's timers
    // (core/sync/loop.js) end with each test
    vi.useFakeTimers({ shouldAdvanceTime: true })
    LOAD_RETRY_DELAYS.splice(0, LOAD_RETRY_DELAYS.length, 1, 1)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    LOAD_RETRY_DELAYS.splice(0, LOAD_RETRY_DELAYS.length, ...savedDelays)
  })

  const dataPatches = () => fetchMock.mock.calls.filter(([url, opts]) =>
    opts?.method === 'PATCH' && !String(url).endsWith('/private'))
  const privatePatches = () => fetchMock.mock.calls.filter(([url, opts]) =>
    opts?.method === 'PATCH' && String(url).endsWith('/private'))
  const sentBody = (n = 0) => JSON.parse(dataPatches()[n][1].body)

  describe('writing', () => {
    it('when the copy can no longer be written, the older copy is not left to be taken for the record', () => {
      const store = connectedStore()
      store.cookieState.lastRoute = 'stroop'
      store.data.studyData.push({ trial: 1 })
      store.captureSnapshot()
      expect(readSnapshot().data.studyData).toHaveLength(1)

      // The record has grown past what the browser will store
      const real = globalThis.localStorage
      vi.stubGlobal('localStorage', {
        getItem: key => real.getItem(key),
        removeItem: key => real.removeItem(key),
        setItem: (key, value) => {
          if (value.includes('"studyData"')) throw new Error('QuotaExceededError')
          real.setItem(key, value)
        },
      })
      store.data.studyData.push({ trial: 2 })
      store.captureSnapshot()
      vi.unstubAllGlobals()

      const stored = readSnapshot()
      expect(stored.data).toBeNull()
      expect(stored.rev).toBe(store.browserEphemeral.rev)
      expect(stored.resume.view).toBe('stroop')
      expect(store.browserEphemeral.localCopyError).toContain('QuotaExceededError')
    })

    it('writes the record and the position together, as one value', () => {
      const store = connectedStore()
      store.cookieState.lastRoute = 'stroop'
      const { setItem } = stubStorage()
      store.data.pageData_stroop = { visit_0: { timestamps: [1], data: [{ id: 'a' }] } }
      store.localState.viewSteppers.stroop = stepperState(1)
      store.captureSnapshot()

      expect(setItem).toHaveBeenCalledTimes(1)
      expect(setItem.mock.calls[0][0]).toBe(snapshotKey)
      vi.unstubAllGlobals()
      const stored = readSnapshot()
      expect(stored.v).toBe(SNAPSHOT_VERSION)
      expect(stored.participantId).toBe(PID)
      expect(stored.data.pageData_stroop.visit_0.data).toEqual([{ id: 'a' }])
      expect(stored.resume.view).toBe('stroop')
      expect(stored.resume.viewSteppers.stroop.data.stepperState.currentIndex).toBe(1)
      expect(stored.rev).toBeGreaterThan(stored.savedRev)
      // Nothing else of the store's is in localStorage
      expect(Object.keys(localStorage)).toEqual([snapshotKey])
    })

    it('rev goes up once per change, and not when nothing changed', () => {
      const store = connectedStore()
      store.captureSnapshot()
      const first = store.browserEphemeral.rev
      const { setItem } = stubStorage()

      store.captureSnapshot()
      store.captureSnapshot()
      expect(store.browserEphemeral.rev).toBe(first)
      expect(setItem).not.toHaveBeenCalled()

      store.data.studyData.push({ trial: 1 })
      store.captureSnapshot()
      expect(store.browserEphemeral.rev).toBe(first + 1)

      store.localState.viewSteppers.stroop = stepperState(2)
      store.captureSnapshot()
      expect(store.browserEphemeral.rev).toBe(first + 2)

      store.cookieState.lastRoute = 'thanks'
      store.captureSnapshot()
      expect(store.browserEphemeral.rev).toBe(first + 3)
      expect(readSnapshot().rev).toBe(first + 3)
      expect(store.browserEphemeral.unsavedChanges).toBe(true)
    })

    it('rev is steady when each action is called through a new wrapper (Pinia in development)', () => {
      // Pinia's dev tools call every action with a fresh Proxy of the store
      // as `this`. Whatever the store remembers between calls must survive it.
      const store = connectedStore()
      const wrapped = () => new Proxy(store, {})
      wrapped().data.studyData.push({ trial: 1 })
      store.captureSnapshot.call(wrapped())
      const rev = store.browserEphemeral.rev
      const { setItem } = stubStorage()
      store.captureSnapshot.call(wrapped())
      store.captureSnapshot.call(wrapped())
      store.requestSnapshot.call(wrapped())
      expect(store.browserEphemeral.rev).toBe(rev)
      expect(setItem).not.toHaveBeenCalled()
    })

    it('a change to the device-only values is written without a new rev', () => {
      const store = connectedStore()
      store.captureSnapshot()
      const rev = store.browserEphemeral.rev
      store.localState.totalWrites = 7
      store.captureSnapshot()
      expect(store.browserEphemeral.rev).toBe(rev)
      expect(readSnapshot().local.totalWrites).toBe(7)
    })

    it('keeps the position, but no record, before the participant has one', () => {
      const store = useSmileStore()
      store.cookieState.lastRoute = 'welcome_anonymous'
      store.localState.conditions = { color: 'red' }
      store.data.studyData.push({ before: 'consent' })
      store.captureSnapshot()

      const stored = readSnapshot()
      expect(stored.participantId).toBeNull()
      expect(stored.data).toBeNull()
      expect(stored.resume.conditions).toEqual({ color: 'red' })
      expect(stored.resume.view).toBe('welcome_anonymous')
    })

    it('leaves a known participant\'s stored copy alone until it has been loaded', () => {
      writeSnapshot(storedSnapshot())
      const before = localStorage.getItem(snapshotKey)
      const store = useSmileStore()
      store.cookieState.knownUser = true
      store.cookieState.participantId = PID
      store.data.studyData.push({ recorded: 'too early' })

      expect(store.captureSnapshot()).toBeNull()
      expect(localStorage.getItem(snapshotKey)).toBe(before)
    })

    it('does not keep the route lists the timeline rebuilds on every load', () => {
      const store = connectedStore()
      store.localState.routes = [{ name: 'a' }]
      store.localState.seqtimeline = [{ name: 'a' }]
      store.captureSnapshot()
      const stored = readSnapshot()
      expect(JSON.stringify(stored)).not.toContain('seqtimeline')
      expect(stored.resume.routes).toBeUndefined()
    })

    it('removes the old data backup once the snapshot is written', () => {
      localStorage.setItem(legacyDataKey(snapshotKey), JSON.stringify({ participantId: PID, rev: 1, savedRev: 1, data: {} }))
      const store = connectedStore()
      store.captureSnapshot()
      expect(localStorage.getItem(legacyDataKey(snapshotKey))).toBeNull()
    })

    it('a full localStorage does not throw, is reported once, and saving still works', async () => {
      const store = connectedStore()
      const warn = vi.spyOn(useLog(), 'warn')
      warn.mockClear() // the spy keeps calls from earlier tests
      const storage = stubStorage({ failing: new DOMException('quota', 'QuotaExceededError') })
      vi.stubGlobal('$fetch', fetchMock)
      store.data.studyData.push({ trial: 1 })
      expect(() => store.captureSnapshot()).not.toThrow()
      store.data.studyData.push({ trial: 2 })
      store.captureSnapshot()
      expect(store.browserEphemeral.localCopyError).toMatch(/quota/i)
      expect(warn.mock.calls.filter(c => String(c[0]).includes('local copy'))).toHaveLength(1)

      await store.saveData(true)
      expect(sentBody().data.studyData).toHaveLength(2)

      // When there is room again the copy is written and the error cleared
      storage.state.failing = null
      store.data.studyData.push({ trial: 3 })
      store.captureSnapshot()
      expect(store.browserEphemeral.localCopyError).toBeNull()
      expect(readSnapshot().data.studyData).toHaveLength(3)
    })

    it('localStorage that throws on every call stops nothing', async () => {
      const store = connectedStore()
      stubStorage({ failing: new Error('blocked') })
      store.data.studyData.push({ trial: 1 })
      expect(() => store.captureSnapshot()).not.toThrow()
      expect(() => store.restoreLocal()).not.toThrow()
      expect(() => store.clearLocalSnapshot()).not.toThrow()
      await store.saveData(true)
      expect(dataPatches()).toHaveLength(1)
    })

    for (const bad of BAD_VALUES.filter(b => !b.slow)) {
      it(`a bad value written straight to the record still gives a readable snapshot and a save: ${bad.name}`, async () => {
        const store = connectedStore()
        store.data.bad = bad.make()
        store.data.good = 'kept'
        expect(() => store.captureSnapshot()).not.toThrow()
        expect(readSnapshot().data.good).toBe('kept')

        await store.saveData(true)
        expect(sentBody().data.good).toBe('kept')
      })
    }
  })

  describe('the stepper', () => {
    function stepperAt(store, steps) {
      const root = new Stepper({ id: '/', parent: null, data: { gvars: {} }, store })
      root.name = 'stroop'
      root.append(steps)
      return root
    }

    it('saving a step writes its position and the trial just recorded in one write', () => {
      vi.useFakeTimers()
      const store = connectedStore()
      store.cookieState.lastRoute = 'stroop'
      const root = stepperAt(store, [{ id: 'a' }, { id: 'b' }, { id: 'c' }])
      root.next()
      root.save()
      store.captureSnapshot()
      const { setItem } = stubStorage()

      // What a keypress does: the step's data is set (the stepper saves on
      // each assignment), the trial is recorded, the position moves on. The
      // store-sync plugin's watcher asks for a snapshot after each change.
      root.save()
      store.requestSnapshot()
      root.save()
      store.requestSnapshot()
      store.data.pageData_stroop = { visit_0: { timestamps: [1], data: [{ id: 'a', rt: 300 }] } }
      store.requestSnapshot()
      root.next()
      root.save()
      store.requestSnapshot()
      expect(setItem).not.toHaveBeenCalled()

      // A moment later: one write, the record and the position together
      vi.advanceTimersByTime(10)
      expect(setItem).toHaveBeenCalledTimes(1)
      vi.unstubAllGlobals()
      const stored = readSnapshot()
      expect(stored.data.pageData_stroop.visit_0.data).toEqual([{ id: 'a', rt: 300 }])
      const reloaded = new Stepper({ serializedState: stored.resume.viewSteppers.stroop.data.stepperState, store })
      expect(reloaded.currentPathString).toBe(root.currentPathString)
      expect(reloaded.currentData.id).toBe('c')
    })

    it('a write asked for is made at once when the page closes or a save is sent', () => {
      vi.useFakeTimers()
      const store = connectedStore()
      store.data.studyData.push({ trial: 1 })
      store.requestSnapshot()
      expect(localStorage.getItem(snapshotKey)).toBeNull()
      store.captureSnapshot() // what pagehide and saveData() call
      expect(readSnapshot().data.studyData).toHaveLength(1)

      // The write that was waiting is not made a second time
      const { setItem } = stubStorage()
      vi.advanceTimersByTime(5000)
      expect(setItem).not.toHaveBeenCalled()
    })

    it('waits longer between writes when a write is slow, and never more than 2 s', () => {
      vi.useFakeTimers()
      // No participant yet: only the position is written and nothing is sent
      const store = useSmileStore()
      store.captureSnapshot()
      const storage = stubStorage()
      // Each write takes 30 ms of the main thread
      storage.setItem.mockImplementation(() => vi.advanceTimersByTime(30))

      store.localState.conditions.sample = 1
      store.requestSnapshot()
      vi.advanceTimersByTime(10)
      expect(storage.setItem).toHaveBeenCalledTimes(1)

      // The next one waits about ten times as long as that write took
      store.localState.conditions.sample = 2
      store.requestSnapshot()
      vi.advanceTimersByTime(250)
      expect(storage.setItem).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(100)
      expect(storage.setItem).toHaveBeenCalledTimes(2)

      // However slow, a change is written within 2 s
      storage.setItem.mockImplementation(() => vi.advanceTimersByTime(5000))
      store.localState.conditions.sample = 3
      store.requestSnapshot()
      vi.advanceTimersByTime(400)
      expect(storage.setItem).toHaveBeenCalledTimes(3)
      storage.setItem.mockImplementation(() => {})
      store.localState.conditions.sample = 4
      store.requestSnapshot()
      vi.advanceTimersByTime(1999)
      expect(storage.setItem).toHaveBeenCalledTimes(3)
      vi.advanceTimersByTime(2)
      expect(storage.setItem).toHaveBeenCalledTimes(4)
    })

    it('after a reset has begun nothing is written, so the old state cannot come back', () => {
      vi.useFakeTimers()
      const store = connectedStore()
      store.captureSnapshot()
      store.data.studyData.push({ trial: 1 })
      store.requestSnapshot()
      store.stopSnapshots()
      localStorage.removeItem(snapshotKey)

      vi.advanceTimersByTime(5000)
      store.requestSnapshot()
      vi.advanceTimersByTime(5000)
      expect(store.captureSnapshot()).toBeNull() // what pagehide calls
      expect(localStorage.getItem(snapshotKey)).toBeNull()
    })
  })

  describe('saving', () => {
    it('sends the rev, the record and the position, and records what the server has', async () => {
      const store = connectedStore()
      store.cookieState.lastRoute = 'stroop'
      store.localState.viewSteppers = { consent: stepperState(1), stroop: stepperState(3) }
      store.data.studyData.push({ trial: 1 })
      await store.saveData()

      expect(dataPatches()).toHaveLength(1)
      const [url, opts] = dataPatches()[0]
      expect(url).toBe(`/api/participants/${PID}`)
      expect(opts.headers['Content-Type']).toBe('application/json')
      const body = sentBody()
      expect(body.rev).toBe(store.browserEphemeral.rev)
      expect(body.rev).toBeGreaterThan(0)
      expect(body.data.studyData).toEqual([{ trial: 1 }])
      expect(body.resume.view).toBe('stroop')
      // Only the current View's stepper is uploaded; the local copy has both
      expect(Object.keys(body.resume.viewSteppers)).toEqual(['stroop'])
      expect(Object.keys(readSnapshot().resume.viewSteppers).sort()).toEqual(['consent', 'stroop'])

      expect(store.browserEphemeral.savedRev).toBe(body.rev)
      expect(store.browserEphemeral.unsavedChanges).toBe(false)
      const stored = readSnapshot()
      expect(stored.savedRev).toBe(stored.rev)
      expect(stored.local.totalWrites).toBe(1)
    })

    it('the rev sent names exactly the record sent, even when the change was made just before', async () => {
      const store = connectedStore()
      store.captureSnapshot()
      await store.saveData(true)
      const first = sentBody(0)

      // No watcher has run between the change and the save
      store.data.studyData.push({ trial: 1 })
      await store.saveData(true)
      const second = sentBody(1)
      expect(second.rev).toBe(first.rev + 1)
      expect(second.data.studyData).toHaveLength(1)

      // Nothing new: nothing is sent, and the answer says it's all saved
      await expect(store.sync()).resolves.toEqual({ ok: true, rev: second.rev, error: null })
      expect(dataPatches()).toHaveLength(2)
    })

    it('keeps changes made while a save is in flight marked unsaved', async () => {
      const store = connectedStore()
      fetchMock.mockImplementationOnce(async () => {
        store.data.studyData.push({ trial: 'mid-request' })
        store.captureSnapshot()
        return {}
      })
      await store.saveData()

      const stored = readSnapshot()
      expect(stored.rev).toBeGreaterThan(stored.savedRev)
      expect(store.browserEphemeral.unsavedChanges).toBe(true)
    })

    it('sends the private data in the save\'s own body: once, and again only when it changes', async () => {
      const store = connectedStore()
      await store.sync()
      // Nothing in it yet: sent empty, so the participant has a row (the server merges)
      expect(sentBody(0).private).toEqual({})
      expect(privatePatches()).toHaveLength(0) // no second request

      store.private.recruitmentInfo = { prolific_id: 'abc' }
      await store.sync()
      expect(sentBody(1).private).toEqual({ recruitmentInfo: { prolific_id: 'abc' } })

      store.data.studyData.push({ trial: 1 })
      await store.sync()
      expect(dataPatches()).toHaveLength(3)
      expect(sentBody(2)).not.toHaveProperty('private')

      store.private.withdrawData = { reason: 'bored' }
      await store.sync()
      expect(sentBody(3).private).toEqual({ recruitmentInfo: { prolific_id: 'abc' }, withdrawData: { reason: 'bored' } })
    })

    it('never sends the empty parts of the private data (a reloaded page may not know them)', async () => {
      const store = connectedStore()
      store.private.withdrawData = { reason: 'bored' }
      await store.sync()
      expect(sentBody(0).private).toEqual({ withdrawData: { reason: 'bored' } })
    })

    it('keeps the private data in the local copy and restores it after a reload', async () => {
      const store = connectedStore()
      store.private.recruitmentInfo = { prolific_id: 'abc' }
      store.captureSnapshot()
      expect(readSnapshot().private).toEqual({ recruitmentInfo: { prolific_id: 'abc' } })

      setActivePinia(createPinia())
      const reloaded = useSmileStore()
      reloaded.cookieState.participantId = PID
      reloaded.restoreLocal()
      expect(reloaded.private.recruitmentInfo).toEqual({ prolific_id: 'abc' })
      expect(reloaded.private.withdrawData).toEqual({})
    })

    it('the private data goes again with each try until a save is confirmed', async () => {
      vi.useFakeTimers()
      const store = connectedStore()
      let failing = true
      fetchMock.mockImplementation(async (url, opts) => {
        if (failing) throw new Error('fetch failed')
        return saveRoute(url, opts)
      })
      store.private.recruitmentInfo = { prolific_id: 'abc' }
      store.data.studyData.push({ trial: 1 })
      const first = await store.sync()
      expect(first.ok).toBe(false)
      expect(store.browserEphemeral.sync.error.kind).toBe('retrying')

      failing = false
      await vi.advanceTimersByTimeAsync(1100)
      expect(store.browserEphemeral.savedRev).toBe(store.browserEphemeral.rev)
      expect(store.browserEphemeral.sync).toMatchObject({ status: 'saved', error: null })
      expect(dataPatches()).toHaveLength(2)
      expect(sentBody(0).private).toEqual({ recruitmentInfo: { prolific_id: 'abc' } })
      expect(sentBody(1).private).toEqual({ recruitmentInfo: { prolific_id: 'abc' } })

      // Confirmed: not sent again with the next save
      store.data.studyData.push({ trial: 2 })
      await store.sync()
      expect(sentBody(2)).not.toHaveProperty('private')
    })

    it.each([400, 413, 500])('a save refused with %i does not throw and stays unsaved', async (statusCode) => {
      const store = connectedStore()
      fetchMock.mockImplementation(async () => {
        throw Object.assign(new Error('refused'), { statusCode, data: { data: { rev: 99 } } })
      })
      store.private.recruitmentInfo = { prolific_id: 'abc' }
      store.data.studyData.push({ trial: 1 })
      const result = await store.sync()
      expect(result.ok).toBe(false)
      expect(result.error).toBeTruthy()
      expect(store.browserEphemeral.savedRev).toBe(0)
      expect(store.browserEphemeral.unsavedChanges).toBe(true)
      expect(store.browserEphemeral.sync.status).toBe('error')
      expect(readSnapshot().data.studyData).toHaveLength(1)
      expect(privatePatches()).toHaveLength(0)
    })

    it('a change is sent by itself a second later, and several changes together are one send', async () => {
      vi.useFakeTimers()
      const store = connectedStore()
      store.data.studyData.push({ trial: 1 })
      store.requestSnapshot()
      await vi.advanceTimersByTimeAsync(500)
      store.data.studyData.push({ trial: 2 })
      store.requestSnapshot()
      await vi.advanceTimersByTimeAsync(500)
      expect(dataPatches()).toHaveLength(0)
      expect(store.browserEphemeral.sync.status).toBe('pending')

      await vi.advanceTimersByTimeAsync(600)
      expect(dataPatches()).toHaveLength(1)
      expect(sentBody().data.studyData).toHaveLength(2)
      expect(store.browserEphemeral.sync.status).toBe('saved')
      expect(store.browserEphemeral.unsavedChanges).toBe(false)
    })

    it('saveData() is sync() under its older name', async () => {
      const store = connectedStore()
      store.data.studyData.push({ trial: 1 })
      await expect(store.saveData(true)).resolves.toMatchObject({ ok: true })
      expect(dataPatches()).toHaveLength(1)
    })

    it('a browser that can compress sends the record gzipped; the page-closing save and short bodies stay text', async () => {
      vi.stubGlobal('CompressionStream', RealCompressionStream)
      const store = connectedStore()
      for (let i = 0; i < 200; i++) store.data.studyData.push({ trial: i, stimulus: 'table', response: 'f', rt: 500 + i })
      await expect(store.sync()).resolves.toMatchObject({ ok: true })
      const [, opts] = dataPatches()[0]
      expect(opts.body).toBeInstanceOf(Uint8Array)
      expect(opts.headers).toMatchObject({ 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' })
      const decoded = await decodeBody(opts.body)
      expect(decoded.ok).toBe(true)
      const sent = JSON.parse(decoded.text)
      expect(sent.rev).toBe(store.browserEphemeral.rev)
      expect(sent.data.studyData).toHaveLength(200)
      expect(opts.body.length).toBeLessThan(decoded.text.length / 3)
      // The save made as the page closes is text too
      store.data.studyData.push({ trial: 200 })
      store.saveOnClose()
      await vi.advanceTimersByTimeAsync(50)
      const closing = dataPatches().at(-1)[1]
      expect(closing.keepalive).toBe(true)
      expect(typeof closing.body).toBe('string')
      expect(closing.headers['Content-Encoding']).toBeUndefined()
    })

    it('when a gzipped save is refused on the way, it is sent again as text, and so are the later ones', async () => {
      vi.stubGlobal('CompressionStream', RealCompressionStream)
      const store = connectedStore()
      for (let i = 0; i < 200; i++) store.data.studyData.push({ trial: i, stimulus: 'table', response: 'f', rt: 500 + i })
      fetchMock.mockImplementation(async (url, opts) => {
        if (opts.headers?.['Content-Encoding'] === 'gzip') throw Object.assign(new Error('Unsupported Media Type'), { statusCode: 415 })
        return saveRoute(url, opts)
      })
      await expect(store.sync()).resolves.toMatchObject({ ok: true })
      expect(dataPatches().map(([, opts]) => typeof opts.body)).toEqual(['object', 'string'])
      expect(JSON.parse(dataPatches()[1][1].body).data.studyData).toHaveLength(200)

      store.data.studyData.push({ trial: 200 })
      await expect(store.sync()).resolves.toMatchObject({ ok: true })
      expect(dataPatches()).toHaveLength(3)
      expect(typeof dataPatches()[2][1].body).toBe('string')
    })

    it('sync() before consent sends nothing and says why', async () => {
      const store = useSmileStore()
      await expect(store.sync()).resolves.toEqual({ ok: false, rev: 0, error: 'not consented' })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('a 403 or 404 that is not the server\'s own is tried again: the participant and the local copy are kept', async () => {
      vi.useFakeTimers()
      for (const statusCode of [403, 404]) {
        const store = connectedStore()
        let blocked = true
        fetchMock.mockImplementation(async (url, opts) => {
          if (blocked) throw Object.assign(new Error('blocked on the way'), { statusCode })
          return saveRoute(url, opts)
        })
        store.data.studyData.push({ trial: statusCode })
        expect((await store.sync()).ok).toBe(false)
        expect(store.cookieState.participantId).toBe(PID)
        expect(readSnapshot().data.studyData).toEqual([{ trial: statusCode }])
        expect(store.browserEphemeral.sync.error.kind).toBe('retrying')

        blocked = false
        await vi.advanceTimersByTimeAsync(1100)
        expect(store.browserEphemeral.sync.status).toBe('saved')
        store.clearLocalSnapshot()
        setActivePinia(createPinia())
      }
    })

    it('the server refuses the token: the record is kept and saved as a new row', async () => {
      vi.useFakeTimers()
      const store = connectedStore()
      store.cookieState.knownUser = true
      store.private.recruitmentInfo = { prolific_id: 'abc' }
      const posts = []
      fetchMock.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') {
          posts.push(JSON.parse(opts.body))
          return { id: 'new-row', rev: 0 }
        }
        if (String(url).includes(PID)) throw marked(403, 'bad-token')
        return saveRoute(url, opts)
      })
      store.data.studyData.push({ trial: 1 })
      await store.sync()
      await vi.advanceTimersByTimeAsync(1100)

      expect(posts).toHaveLength(1)
      expect(posts[0].data.studyData).toEqual([{ trial: 1 }])
      expect(posts[0].data.previousParticipantIds).toEqual([PID])
      expect(store.cookieState.participantId).toBe('new-row')
      expect(store.browserEphemeral.sync.status).toBe('saved')
      expect(store.browserEphemeral.savedRev).toBe(store.browserEphemeral.rev)
      expect(readSnapshot()).toMatchObject({ participantId: 'new-row', data: { studyData: [{ trial: 1 }] } })
      // The private data goes to the new row too
      const [lastUrl, lastOpts] = dataPatches().at(-1)
      expect(lastUrl).toBe('/api/participants/new-row')
      expect(JSON.parse(lastOpts.body).private).toEqual({ recruitmentInfo: { prolific_id: 'abc' } })
    })

    it('the server says the row is gone: reset to a new user, with an empty record', async () => {
      const store = connectedStore()
      store.cookieState.knownUser = true
      store.private.recruitmentInfo = { prolific_id: 'abc' }
      fetchMock.mockImplementation(async () => {
        throw marked(404, 'no-participant')
      })
      store.data.studyData.push({ trial: 1 })
      store.data.pageData_stroop = { visit_0: { timestamps: [1], data: [{ id: 'a' }] } }
      await store.sync()
      expect(store.cookieState.participantId).toBeNull()
      expect(localStorage.getItem(snapshotKey)).toBeNull()
      // The next participant's row is created from the record in memory
      expect(store.data.studyData).toEqual([])
      expect(store.data.pageData_stroop).toBeUndefined()
      expect(store.private.recruitmentInfo).toEqual({})
    })

    it('a 200 that is not the save route\'s answer does not count as saved', async () => {
      vi.useFakeTimers()
      const store = connectedStore()
      let portal = true
      fetchMock.mockImplementation(async (url, opts) => (portal ? '<html>Sign in to the wifi</html>' : saveRoute(url, opts)))
      store.data.studyData.push({ trial: 1 })
      expect((await store.sync()).ok).toBe(false)
      expect(store.browserEphemeral.savedRev).toBeLessThan(store.browserEphemeral.rev)
      expect(store.browserEphemeral.sync.error.kind).toBe('retrying')

      portal = false
      await vi.advanceTimersByTimeAsync(1100)
      expect(store.browserEphemeral.savedRev).toBe(store.browserEphemeral.rev)
    })

    it('counts every send in the local copy, and stops at the limit with a report to the server', async () => {
      const store = connectedStore()
      store.localState.totalSends = 9_999 // from earlier pages
      store.data.studyData.push({ trial: 1 })
      expect((await store.sync()).ok).toBe(true)
      expect(store.localState.totalSends).toBe(10_000)
      expect(JSON.parse(localStorage.getItem(snapshotKey)).local.totalSends).toBe(10_000)
      const before = dataPatches().length

      store.data.studyData.push({ trial: 2 })
      store.requestSnapshot()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(store.browserEphemeral.sync.error.kind).toBe('limit')
      const after = dataPatches().slice(before)
      expect(after).toHaveLength(1) // only the report
      expect(JSON.parse(after[0][1].body)).toEqual({ limit: true, sends: 10_000 })
      expect(store.browserEphemeral.unsavedChanges).toBe(true)

      // Asked for, it is still sent
      expect((await store.sync()).ok).toBe(true)
      expect(store.browserEphemeral.unsavedChanges).toBe(false)
    })

    it('a record over the size limit is kept locally, reported, and not sent', async () => {
      const store = connectedStore()
      store.data.big = 'x'.repeat(4_100_000)
      const result = await store.sync()
      expect(result.ok).toBe(false)
      expect(store.browserEphemeral.sync.error.kind).toBe('oversize')
      expect(dataPatches()).toHaveLength(1) // only the report
      expect(JSON.parse(dataPatches()[0][1].body)).toMatchObject({ oversize: true })
      expect(store.browserEphemeral.unsavedChanges).toBe(true)
    })
  })

  describe('creating the participant', () => {
    it('creates the row at consent and sends the first save by itself', async () => {
      vi.useFakeTimers()
      fetchMock.mockImplementation(async (url, opts) => (opts?.method === 'POST' ? { id: PID, rev: 0 } : saveRoute(url, opts)))
      const store = useSmileStore()
      store.private.recruitmentInfo = { prolific_id: 'abc' }
      await store.setKnown()

      expect(store.cookieState.participantId).toBe(PID)
      expect(store.isDataLoaded).toBe(true)
      expect(readSnapshot().participantId).toBe(PID)
      expect(readSnapshot().data).toBeTruthy()

      await vi.advanceTimersByTimeAsync(1100)
      expect(dataPatches()).toHaveLength(1)
      expect(sentBody(0).private).toEqual({ recruitmentInfo: { prolific_id: 'abc' } })
      expect(store.browserEphemeral.savedRev).toBe(store.browserEphemeral.rev)
    })

    it('when the request fails the participant goes on, and the row is made with the first save that gets through', async () => {
      vi.useFakeTimers()
      let down = true
      const posts = []
      fetchMock.mockImplementation(async (url, opts) => {
        if (down) throw new Error('fetch failed')
        if (opts?.method === 'POST') {
          posts.push(JSON.parse(opts.body))
          return { id: PID, rev: 0 }
        }
        return saveRoute(url, opts)
      })
      const store = useSmileStore()
      await store.setKnown()

      // No row yet, but the record is theirs: it is recorded to and kept locally
      expect(store.cookieState.participantId).toBeNull()
      expect(store.isDataLoaded).toBe(true)
      store.data.studyData.push({ trial: 1 })
      store.requestSnapshot()
      await vi.advanceTimersByTimeAsync(1100)
      expect(readSnapshot()).toMatchObject({ participantId: null, data: { studyData: [{ trial: 1 }] } })
      expect(store.browserEphemeral.sync.status).toBe('error')

      // The server comes back: the loop's next try creates the row, then saves
      down = false
      await vi.advanceTimersByTimeAsync(5000)
      expect(posts).toHaveLength(1)
      expect(posts[0].data.studyData).toEqual([{ trial: 1 }])
      expect(store.cookieState.participantId).toBe(PID)
      expect(dataPatches()).toHaveLength(1)
      expect(store.browserEphemeral.savedRev).toBe(store.browserEphemeral.rev)
      expect(readSnapshot().participantId).toBe(PID)
    })

    it('a reload before the row exists goes on from the local copy', async () => {
      vi.useFakeTimers()
      fetchMock.mockImplementation(async () => {
        throw new Error('fetch failed')
      })
      const first = useSmileStore()
      await first.setKnown()
      first.data.studyData.push({ trial: 1 })
      first.captureSnapshot()
      first.stopSnapshots()

      setActivePinia(createPinia())
      fetchMock.mockImplementation(async (url, opts) => (opts?.method === 'POST' ? { id: PID, rev: 0 } : saveRoute(url, opts)))
      const store = useSmileStore()
      store.cookieState.knownUser = true
      store.restoreLocal()
      await store.loadData()
      expect(store.isDataLoaded).toBe(true)
      expect(store.data.studyData).toEqual([{ trial: 1 }])

      await vi.advanceTimersByTimeAsync(1100)
      expect(store.cookieState.participantId).toBe(PID)
      expect(sentBody().data.studyData).toEqual([{ trial: 1 }])
    })

    it('two calls at once make one row', async () => {
      let posts = 0
      fetchMock.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') posts += 1
        return { id: PID }
      })
      const store = useSmileStore()
      await Promise.all([store.createParticipant(), store.createParticipant()])
      expect(posts).toBe(1)
    })
  })

  describe('restoring the position when the page starts', () => {
    it('puts back the stepper states, conditions, counters and the View', () => {
      writeSnapshot(storedSnapshot())
      const store = useSmileStore()
      store.cookieState.participantId = PID
      store.cookieState.lastRoute = 'consent' // the cookie is behind
      store.restoreLocal()

      expect(store.localState.viewSteppers.stroop.data.stepperState.currentIndex).toBe(4)
      expect(store.localState.conditions).toEqual({ color: 'red' })
      expect(store.localState.totalWrites).toBe(3)
      expect(store.cookieState.lastRoute).toBe('stroop')
      expect(store.browserEphemeral.rev).toBe(5)
      // The record waits for loadData()
      expect(store.data.pageData_stroop).toBeUndefined()
    })

    it('ignores a snapshot that belongs to another participant', () => {
      writeSnapshot(storedSnapshot({ participantId: 'someone-else' }))
      const store = useSmileStore()
      store.cookieState.participantId = PID
      store.restoreLocal()
      expect(store.localState.viewSteppers).toEqual({})
      expect(store.cookieState.lastRoute).toBe('landing')
    })

    it('ignores a participant\'s snapshot when the cookie has no participant', () => {
      writeSnapshot(storedSnapshot())
      const store = useSmileStore()
      store.restoreLocal()
      expect(store.localState.viewSteppers).toEqual({})
      expect(store.localState.conditions).toEqual({})
    })

    it('restores the position from the format before the snapshot', () => {
      writeSnapshot({ viewSteppers: { stroop: stepperState(2) }, conditions: { color: 'blue' }, totalWrites: 8, routes: [{ name: 'x' }] })
      const store = useSmileStore()
      store.cookieState.participantId = PID
      store.cookieState.lastRoute = 'stroop'
      store.restoreLocal()
      expect(store.localState.viewSteppers.stroop.data.stepperState.currentIndex).toBe(2)
      expect(store.localState.conditions).toEqual({ color: 'blue' })
      expect(store.localState.totalWrites).toBe(8)
      expect(store.localState.routes).toEqual([])
      expect(store.cookieState.lastRoute).toBe('stroop')
    })

    it.each(['{not json', '[1,2]', 'null', '""', '{"v":1,"resume":"x","local":[],"rev":{}}'])('a damaged snapshot (%s) changes nothing and does not throw', (raw) => {
      writeSnapshot(raw)
      const store = useSmileStore()
      expect(() => store.restoreLocal()).not.toThrow()
      expect(store.localState.viewSteppers).toEqual({})
      expect(store.cookieState.lastRoute).toBe('landing')
    })
  })

  describe('loading', () => {
    const serverData = () => ({ routeOrder: [{ route: 'stroop', timestamp: 1 }], consented: true, studyData: [], browserData: [], conditions: {} })

    function loadingStore({ local, server }) {
      if (local) writeSnapshot(local)
      fetchMock.mockImplementation(async (url, opts) => {
        if (opts?.method) return saveRoute(url, opts)
        if (server instanceof Error) throw server
        return structuredClone(server)
      })
      const store = useSmileStore()
      store.cookieState.knownUser = true
      store.cookieState.participantId = PID
      store.restoreLocal()
      return store
    }

    it('uses the local copy when it is ahead of the server, record and position, then saves it', async () => {
      const store = loadingStore({ local: storedSnapshot({ rev: 5, savedRev: 2 }), server: { data: serverData(), rev: 2, resume: null } })
      await store.loadData()

      expect(store.isDataLoaded).toBe(true)
      expect(store.data.pageData_stroop.visit_0.data).toHaveLength(4)
      expect(store.localState.viewSteppers.stroop.data.stepperState.currentIndex).toBe(4)
      await vi.waitFor(() => expect(dataPatches()).toHaveLength(1))
      const body = sentBody()
      expect(body.data.pageData_stroop.visit_0.data).toHaveLength(4)
      expect(body.rev).toBeGreaterThan(2)
      await vi.waitFor(() => expect(store.browserEphemeral.savedRev).toBe(body.rev))
    })

    it('uses the server copy when it is ahead, record and position together', async () => {
      const store = loadingStore({
        local: storedSnapshot({ rev: 3, savedRev: 3 }),
        server: { data: { ...serverData(), studyData: [{ from: 'server' }] }, rev: 9, resume: { view: 'thanks', viewSteppers: { thanks: stepperState(7) }, conditions: { color: 'green' } } },
      })
      await store.loadData()

      expect(store.data.studyData).toEqual([{ from: 'server' }])
      expect(store.data.pageData_stroop).toBeUndefined()
      expect(store.cookieState.lastRoute).toBe('thanks')
      expect(store.localState.viewSteppers).toEqual({ thanks: stepperState(7) })
      expect(store.localState.conditions).toEqual({ color: 'green' })
      expect(store.browserEphemeral.savedRev).toBe(9)
      expect(dataPatches()).toHaveLength(0)
      // The local copy now holds what was loaded
      expect(readSnapshot().data.studyData).toEqual([{ from: 'server' }])
      expect(readSnapshot().rev).toBeGreaterThanOrEqual(9)
    })

    it('uses the local copy and sends nothing when the revs are equal', async () => {
      const store = loadingStore({ local: storedSnapshot({ rev: 5, savedRev: 5 }), server: { data: serverData(), rev: 5, resume: null } })
      await store.loadData()
      expect(store.data.pageData_stroop.visit_0.data).toHaveLength(4)
      expect(dataPatches()).toHaveLength(0)
    })

    it('resumes from the server copy alone when there is no local copy', async () => {
      const store = loadingStore({ server: { data: { ...serverData(), studyData: [{ t: 1 }] }, rev: 4, resume: { view: 'stroop', viewSteppers: { stroop: stepperState(6) } } } })
      await store.loadData()
      expect(store.isDataLoaded).toBe(true)
      expect(store.data.studyData).toEqual([{ t: 1 }])
      expect(store.cookieState.lastRoute).toBe('stroop')
      expect(store.localState.viewSteppers.stroop.data.stepperState.currentIndex).toBe(6)
    })

    it('ignores a local copy that belongs to another participant', async () => {
      const store = loadingStore({ local: storedSnapshot({ participantId: 'someone-else', rev: 50 }), server: { data: serverData(), rev: 1, resume: null } })
      await store.loadData()
      expect(store.data.pageData_stroop).toBeUndefined()
      expect(store.localState.viewSteppers).toEqual({})
      expect(readSnapshot().participantId).toBe(PID)
    })

    it.each(['{not json', '[1]', '"text"', '{"v":1,"participantId":"p-1","rev":9,"data":"broken"}'])('loads from the server when the local copy is damaged: %s', async (raw) => {
      const store = loadingStore({ local: raw, server: { data: { ...serverData(), studyData: [{ t: 1 }] }, rev: 4, resume: null } })
      await store.loadData()
      expect(store.isDataLoaded).toBe(true)
      expect(store.data.studyData).toEqual([{ t: 1 }])
    })

    it('uses the local copy when the server cannot be reached', async () => {
      const store = loadingStore({ local: storedSnapshot(), server: new Error('network down') })
      await store.loadData()
      expect(store.isDataLoaded).toBe(true)
      expect(store.data.pageData_stroop.visit_0.data).toHaveLength(4)
      expect(store.localState.viewSteppers.stroop.data.stepperState.currentIndex).toBe(4)
      // It is ahead of what the server last confirmed, so a save is tried
      expect(dataPatches()).toHaveLength(1)
    })

    it('with no copy at all it asks the server again, then goes on without loading', async () => {
      const store = loadingStore({ server: new Error('network down') })
      await store.loadData()
      const gets = fetchMock.mock.calls.filter(([, opts]) => !opts?.method)
      expect(gets).toHaveLength(3)
      expect(store.isDataLoaded).toBe(false)
      expect(store.browserEphemeral.loadFailed).toBe(true)

      // What is recorded meanwhile is not written as this participant's record
      store.data.studyData.push({ trial: 'while disconnected' })
      store.captureSnapshot()
      expect(readSnapshot().data).toBeNull()
      await store.saveData()
      expect(dataPatches()).toHaveLength(0)
    })

    it('a second try that reaches the server loads normally', async () => {
      let calls = 0
      fetchMock.mockImplementation(async (url, opts) => {
        if (opts?.method) return saveRoute(url, opts)
        calls += 1
        if (calls === 1) throw new Error('not ready')
        return { data: { ...serverData(), studyData: [{ t: 1 }] }, rev: 2, resume: null }
      })
      const store = useSmileStore()
      store.cookieState.participantId = PID
      await store.loadData()
      expect(store.isDataLoaded).toBe(true)
      expect(store.browserEphemeral.loadFailed).toBe(false)
      expect(store.data.studyData).toEqual([{ t: 1 }])
    })

    it('reloads the page when the record arrives after the page went on without it', async () => {
      const reload = vi.fn()
      vi.stubGlobal('location', { ...window.location, reload })
      const store = loadingStore({ server: new Error('network down') })
      await store.loadData()
      expect(store.browserEphemeral.loadFailed).toBe(true)

      fetchMock.mockImplementation(async () => ({ data: serverData(), rev: 2, resume: null }))
      await store.loadData()
      expect(reload).toHaveBeenCalledTimes(1)
      expect(store.isDataLoaded).toBe(false)
    })

    it.each([[null], ['text'], [[1, 2]], [undefined]])('uses the local copy when the server\'s record is %j', async (data) => {
      const store = loadingStore({ local: storedSnapshot({ rev: 5, savedRev: 5 }), server: { data, rev: 8, resume: null } })
      await store.loadData()
      expect(store.data.pageData_stroop.visit_0.data).toHaveLength(4)
      expect(sentBody().rev).toBeGreaterThan(8)
    })

    it('starts the record again, without failing, when neither copy can be used', async () => {
      const store = loadingStore({ local: '{broken', server: { data: 'text', rev: 3, resume: null } })
      await store.loadData()
      expect(store.isDataLoaded).toBe(true)
      expect(Array.isArray(store.data.studyData)).toBe(true)
      expect(sentBody().rev).toBeGreaterThan(3)
    })

    it('repairs a loaded record so recording can go on', async () => {
      const store = loadingStore({ server: { data: { studyData: 'x', routeOrder: [null, { route: 'a', timestamp: 1 }], browserData: 5, pageData_a: 'text', kept: 1 }, rev: 3, resume: null } })
      await store.loadData()
      expect(store.data.kept).toBe(1)
      expect(() => {
        store.recordData({ trial: 1 })
        store.recordRoute('b')
        store.recordWindowEvent('blur')
      }).not.toThrow()
      expect(store.data.studyData).toEqual([{ trial: 1 }])
      expect(store.data.routeOrder.map(r => r.route)).toEqual(['a', 'b'])
    })

    describe('a participant saved by the code before the snapshot', () => {
      const oldState = { viewSteppers: { stroop: stepperState(2) }, conditions: { color: 'blue' }, totalWrites: 6 }
      const oldBackup = (rev, savedRev) => ({ participantId: PID, rev, savedRev, data: storedSnapshot().data })

      function oldStore(backup, server) {
        localStorage.setItem(legacyDataKey(snapshotKey), JSON.stringify(backup))
        const store = loadingStore({ local: oldState, server })
        store.cookieState.lastRoute = 'stroop'
        return store
      }

      it('keeps unsaved trials and the position, and the server accepts the save', async () => {
        const store = oldStore(oldBackup(4, 1), { data: serverData(), rev: 30, resume: null })
        await store.loadData()

        expect(store.data.pageData_stroop.visit_0.data).toHaveLength(4)
        expect(store.localState.viewSteppers.stroop.data.stepperState.currentIndex).toBe(2)
        expect(store.cookieState.lastRoute).toBe('stroop')
        expect(sentBody().rev).toBeGreaterThan(30)

        // Afterwards there is one value, in the new format
        expect(localStorage.getItem(legacyDataKey(snapshotKey))).toBeNull()
        const stored = readSnapshot()
        expect(stored.v).toBe(SNAPSHOT_VERSION)
        expect(stored.resume.viewSteppers.stroop.data.stepperState.currentIndex).toBe(2)
        expect(stored.data.pageData_stroop.visit_0.data).toHaveLength(4)
      })

      it('uses the server record when the backup had nothing unsaved, with the local position', async () => {
        const store = oldStore(oldBackup(4, 4), { data: { ...serverData(), studyData: [{ from: 'server' }] }, rev: 30, resume: null })
        await store.loadData()
        expect(store.data.studyData).toEqual([{ from: 'server' }])
        expect(store.localState.viewSteppers.stroop.data.stepperState.currentIndex).toBe(2)
        expect(dataPatches()).toHaveLength(0)
      })

      it('loads a server row from before the migration (no rev, no resume)', async () => {
        const store = loadingStore({ local: oldState, server: { data: serverData() } })
        await store.loadData()
        expect(store.isDataLoaded).toBe(true)
        expect(store.localState.conditions).toEqual({ color: 'blue' })
      })
    })

    it('resets to a new user when the server says it no longer has the participant', async () => {
      const store = loadingStore({ local: storedSnapshot(), server: marked(404, 'no-participant') })
      await store.loadData()
      expect(store.cookieState.participantId).toBeNull()
      expect(store.isDataLoaded).toBe(false)
      expect(localStorage.getItem(snapshotKey)).toBeNull()
    })

    it('a 403 or 404 that is not the server\'s own is "no answer": the local copy is used', async () => {
      for (const statusCode of [403, 404]) {
        const store = loadingStore({ local: storedSnapshot(), server: Object.assign(new Error('blocked on the way'), { statusCode }) })
        await store.loadData()
        expect(store.cookieState.participantId).toBe(PID)
        expect(store.isDataLoaded).toBe(true)
        expect(store.data.pageData_stroop.visit_0.data).toHaveLength(4)
        store.stopSnapshots()
        setActivePinia(createPinia())
      }
    })

    it('the token is refused on load: the local copy goes on as a new row', async () => {
      const posts = []
      const store = loadingStore({ local: storedSnapshot(), server: marked(403, 'bad-token') })
      fetchMock.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') {
          posts.push(JSON.parse(opts.body))
          return { id: 'new-row', rev: 0 }
        }
        if (String(url).includes(PID)) throw marked(403, 'bad-token')
        return saveRoute(url, opts)
      })
      await store.loadData()
      expect(store.isDataLoaded).toBe(true)
      expect(store.data.pageData_stroop.visit_0.data).toHaveLength(4)
      expect(store.localState.viewSteppers.stroop.data.stepperState.currentIndex).toBe(4)
      await vi.waitFor(() => expect(store.cookieState.participantId).toBe('new-row'))
      expect(posts[0].data.previousParticipantIds).toEqual([PID])
      expect(posts[0].data.pageData_stroop.visit_0.data).toHaveLength(4)
      await vi.waitFor(() => expect(store.browserEphemeral.savedRev).toBe(store.browserEphemeral.rev))
    })

    it('the token is refused on load and there is no local copy: reset to a new user', async () => {
      const store = loadingStore({ server: marked(403, 'bad-token') })
      await store.loadData()
      expect(store.cookieState.participantId).toBeNull()
      expect(store.isDataLoaded).toBe(false)
    })
  })

  describe('saving when the page closes', () => {
    const keepalivePatches = () => dataPatches().filter(([, opts]) => opts.keepalive)

    it('writes the snapshot and sends a request that can outlive the page', async () => {
      const store = connectedStore()
      store.data.studyData.push({ trial: 'last' })
      store.saveOnClose()

      expect(readSnapshot().data.studyData).toEqual([{ trial: 'last' }])
      await vi.waitFor(() => expect(keepalivePatches()).toHaveLength(1))
      const [url, opts] = keepalivePatches()[0]
      expect(url).toBe(`/api/participants/${PID}`)
      const body = JSON.parse(opts.body)
      expect(body.rev).toBe(store.browserEphemeral.rev)
      expect(body.data.studyData).toEqual([{ trial: 'last' }])
      expect(body.resume).toBeTruthy()
      // The page was only hidden: the answer is recorded
      await vi.waitFor(() => expect(store.browserEphemeral.savedRev).toBe(body.rev))
    })

    it('the closing request carries the private data that changed, in the same body', async () => {
      const store = connectedStore()
      store.private.withdrawData = { reason: 'too long' }
      store.data.withdrawn = true
      store.saveOnClose()
      await vi.waitFor(() => expect(keepalivePatches()).toHaveLength(1))
      const body = JSON.parse(keepalivePatches()[0][1].body)
      expect(body.data.withdrawn).toBe(true)
      expect(body.private).toEqual({ withdrawData: { reason: 'too long' } })
      expect(privatePatches()).toHaveLength(0)
    })

    it('a record too large to send as text when closing goes gzipped in the closing request', async () => {
      vi.stubGlobal('CompressionStream', RealCompressionStream)
      const store = connectedStore()
      for (let i = 0; i < 2000; i++) store.data.studyData.push({ trial: i, stimulus: 'table', response: 'f', rt: 500 + i })
      store.saveOnClose()
      await vi.waitFor(() => expect(keepalivePatches()).toHaveLength(1))
      const [, opts] = keepalivePatches()[0]
      expect(opts.body).toBeInstanceOf(Uint8Array)
      expect(opts.body.length).toBeLessThanOrEqual(60_000)
      expect(opts.headers['Content-Encoding']).toBe('gzip')
      const sent = JSON.parse((await decodeBody(opts.body)).text)
      expect(sent.data.studyData).toHaveLength(2000)
      expect(JSON.stringify(sent).length).toBeGreaterThan(60_000)
    })

    it('does nothing when everything is saved', async () => {
      const store = connectedStore()
      await store.sync()
      store.saveOnClose()
      await Promise.resolve()
      expect(dataPatches()).toHaveLength(1)
    })

    it('does not create the participant\'s row from a closing page (its answer would never be read)', async () => {
      const store = useSmileStore()
      store.cookieState.knownUser = true // consented; the request that makes the row failed
      store.setDataLoaded()
      store.data.studyData.push({ trial: 'last' })
      store.saveOnClose()
      await vi.advanceTimersByTimeAsync(50)
      expect(fetchMock.mock.calls.filter(([, opts]) => opts?.method === 'POST')).toHaveLength(0)
      expect(readSnapshot().data.studyData).toEqual([{ trial: 'last' }])
    })

    it('a record too large for such a request is sent the ordinary way (and the local copy has it)', async () => {
      const store = connectedStore()
      store.data.big = 'x'.repeat(70_000)
      store.saveOnClose()
      expect(readSnapshot().data.big).toHaveLength(70_000)
      await vi.waitFor(() => expect(dataPatches()).toHaveLength(1))
      expect(keepalivePatches()).toHaveLength(0)
    })
  })

  describe('the study open in another tab', () => {
    const refuse409 = () => fetchMock.mockImplementation(async () => {
      throw Object.assign(new Error('conflict'), { statusCode: 409, data: { data: { rev: 99 } } })
    })

    it('a newer tab: this one stops writing the local copy and stops saving', async () => {
      const store = connectedStore()
      store.data.studyData.push({ trial: 1 })
      await store.sync()
      const before = localStorage.getItem(snapshotKey)
      const sent = fetchMock.mock.calls.length

      store.pauseForOtherTab('newer-tab')
      expect(store.browserEphemeral.otherTab).toBe('newer-tab')
      // The newer tab reads and writes the same local copy: it is left as it is
      expect(localStorage.getItem(snapshotKey)).toBe(before)

      store.data.studyData.push({ trial: 'in the paused tab' })
      store.requestSnapshot()
      store.captureSnapshot()
      store.saveOnClose()
      store.networkChanged(true)
      await vi.advanceTimersByTimeAsync(20_000)
      expect(localStorage.getItem(snapshotKey)).toBe(before)
      expect(fetchMock.mock.calls).toHaveLength(sent)
      expect((await store.sync()).ok).toBe(false)
      expect(fetchMock.mock.calls).toHaveLength(sent)
    })

    it('a save refused with 409 pauses this tab and removes the local copy it wrote', async () => {
      const store = connectedStore()
      refuse409()
      store.data.studyData.push({ trial: 1 })
      const result = await store.sync()
      expect(result.ok).toBe(false)
      expect(store.browserEphemeral.otherTab).toBe('conflict')
      expect(store.browserEphemeral.sync.error.kind).toBe('conflict')
      // so that a reload takes the server's copy, not this older one
      expect(localStorage.getItem(snapshotKey)).toBeNull()
      // It held work the server never got: set aside, not deleted
      expect(JSON.parse(localStorage.getItem(conflictCopyKey(snapshotKey))).data.studyData).toEqual([{ trial: 1 }])

      const sent = fetchMock.mock.calls.length
      store.data.studyData.push({ trial: 2 })
      store.requestSnapshot()
      await vi.advanceTimersByTimeAsync(20_000)
      expect(fetchMock.mock.calls).toHaveLength(sent)
      expect(localStorage.getItem(snapshotKey)).toBeNull()
    })

    it('a 409 leaves a local copy that another tab has written since', async () => {
      const store = connectedStore()
      store.data.studyData.push({ trial: 1 })
      store.captureSnapshot()
      const other = JSON.stringify({ ...JSON.parse(localStorage.getItem(snapshotKey)), rev: 50 })
      localStorage.setItem(snapshotKey, other) // the other tab's write
      refuse409()
      await store.sync()
      expect(store.browserEphemeral.otherTab).toBe('conflict')
      expect(localStorage.getItem(snapshotKey)).toBe(other)
    })

    it('the next load notes the set-aside copy in the record, once, and a reset removes it', async () => {
      localStorage.setItem(conflictCopyKey(snapshotKey), JSON.stringify(storedSnapshot({ rev: 7 })))
      const load = async () => {
        setActivePinia(createPinia())
        fetchMock.mockImplementation(async (url, opts) => (opts?.method ? saveRoute(url, opts) : { data: { consented: true, smileWarnings: store?.data.smileWarnings }, rev: 9, resume: null }))
        const next = useSmileStore()
        next.cookieState.knownUser = true
        next.cookieState.participantId = PID
        next.restoreLocal()
        await next.loadData()
        next.stopSnapshots()
        return next
      }
      let store = null
      store = await load()
      expect(store.data.smileWarnings).toHaveLength(1)
      expect(store.data.smileWarnings[0]).toMatchObject({ path: '(save)', count: 1 })
      expect(store.data.smileWarnings[0].issue).toContain('rev 7')
      expect(store.data.smileWarnings[0].issue).toContain('rev 9')
      store = await load()
      expect(store.data.smileWarnings[0].count).toBe(1)

      store.clearLocalSnapshot()
      expect(localStorage.getItem(conflictCopyKey(snapshotKey))).toBeNull()
    })

    it('pausing twice keeps the first reason', () => {
      const store = connectedStore()
      store.pauseForOtherTab('newer-tab')
      store.pauseForOtherTab('conflict')
      expect(store.browserEphemeral.otherTab).toBe('newer-tab')
    })
  })

  describe('clearing', () => {
    it('removes the snapshot when the participant state is reset', () => {
      localStorage.setItem(legacyDataKey(snapshotKey), '{}')
      const store = connectedStore()
      store.captureSnapshot()
      expect(readSnapshot()).not.toBeNull()
      store.clearLocalSnapshot()
      expect(localStorage.getItem(snapshotKey)).toBeNull()
      expect(localStorage.getItem(legacyDataKey(snapshotKey))).toBeNull()
    })
  })
})
