import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import useSmileStore, { snapshotKey, LOAD_RETRY_DELAYS } from '../../../src/runtime/stores/smilestore'
import useLog from '../../../src/runtime/stores/log'
import { Stepper } from '../../../src/runtime/core/stepper/Stepper'
import { legacyDataKey, SNAPSHOT_VERSION } from '../../../src/runtime/core/sync/snapshot.js'
import appconfig from '../../../src/runtime/core/config.js'
import { BAD_VALUES } from '../../fixtures/bad-values.js'

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

describe('the store\'s local snapshot', () => {
  let fetchMock
  const savedInterval = appconfig.minWriteInterval
  const savedMaxWrites = appconfig.maxWrites
  const savedDelays = [...LOAD_RETRY_DELAYS]

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    fetchMock = vi.fn(async () => ({}))
    vi.stubGlobal('$fetch', fetchMock)
    appconfig.minWriteInterval = 2000
    appconfig.maxWrites = 1000
    LOAD_RETRY_DELAYS.splice(0, LOAD_RETRY_DELAYS.length, 1, 1)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    appconfig.minWriteInterval = savedInterval
    appconfig.maxWrites = savedMaxWrites
    LOAD_RETRY_DELAYS.splice(0, LOAD_RETRY_DELAYS.length, ...savedDelays)
  })

  const dataPatches = () => fetchMock.mock.calls.filter(([url, opts]) =>
    opts?.method === 'PATCH' && !String(url).endsWith('/private'))
  const privatePatches = () => fetchMock.mock.calls.filter(([url, opts]) =>
    opts?.method === 'PATCH' && String(url).endsWith('/private'))
  const sentBody = (n = 0) => JSON.parse(dataPatches()[n][1].body)

  describe('writing', () => {
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
      const store = connectedStore()
      store.captureSnapshot()
      const storage = stubStorage()
      // Each write takes 30 ms of the main thread
      storage.setItem.mockImplementation(() => vi.advanceTimersByTime(30))

      store.data.studyData.push({ sample: 1 })
      store.requestSnapshot()
      vi.advanceTimersByTime(10)
      expect(storage.setItem).toHaveBeenCalledTimes(1)

      // The next one waits about ten times as long as that write took
      store.data.studyData.push({ sample: 2 })
      store.requestSnapshot()
      vi.advanceTimersByTime(250)
      expect(storage.setItem).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(100)
      expect(storage.setItem).toHaveBeenCalledTimes(2)

      // However slow, a change is written within 2 s
      storage.setItem.mockImplementation(() => vi.advanceTimersByTime(5000))
      store.data.studyData.push({ sample: 3 })
      store.requestSnapshot()
      vi.advanceTimersByTime(400)
      expect(storage.setItem).toHaveBeenCalledTimes(3)
      storage.setItem.mockImplementation(() => {})
      store.data.studyData.push({ sample: 4 })
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

      // The same record again goes with the same rev (the server takes it as a resend)
      await store.saveData(true)
      expect(sentBody(2).rev).toBe(second.rev)
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

    it('sends the private data with every save, whether or not its row was created', async () => {
      const store = connectedStore()
      expect(store.localState.privateDataId).toBeNull()
      await store.saveData()
      expect(privatePatches()).toHaveLength(1)
    })

    it('a failed private save does not undo the record\'s save', async () => {
      const store = connectedStore()
      fetchMock.mockImplementation(async (url) => {
        if (String(url).endsWith('/private')) throw new Error('private failed')
        return {}
      })
      store.data.studyData.push({ trial: 1 })
      await expect(store.saveData()).resolves.toBeUndefined()
      expect(store.browserEphemeral.savedRev).toBe(store.browserEphemeral.rev)
    })

    it.each([409, 400, 413, 500])('a save refused with %i does not throw and stays unsaved', async (statusCode) => {
      const store = connectedStore()
      fetchMock.mockImplementation(async () => {
        throw Object.assign(new Error('refused'), { statusCode, data: { data: { rev: 99 } } })
      })
      store.data.studyData.push({ trial: 1 })
      await expect(store.saveData()).resolves.toBeUndefined()
      expect(store.browserEphemeral.savedRev).toBe(0)
      expect(store.browserEphemeral.unsavedChanges).toBe(true)
      expect(readSnapshot().data.studyData).toHaveLength(1)
      expect(privatePatches()).toHaveLength(0)
    })

    it('defers a save that comes too soon instead of dropping it', async () => {
      vi.useFakeTimers()
      const store = connectedStore()
      store.localState.lastWrite = Date.now()
      store.data.studyData.push({ trial: 1 })

      await store.saveData()
      expect(dataPatches()).toHaveLength(0)

      await vi.advanceTimersByTimeAsync(2000)
      expect(dataPatches()).toHaveLength(1)
    })

    it('schedules only one deferred save for several early calls', async () => {
      vi.useFakeTimers()
      const store = connectedStore()
      store.localState.lastWrite = Date.now()
      await store.saveData()
      await store.saveData()
      await store.saveData()

      await vi.advanceTimersByTimeAsync(2000)
      expect(dataPatches()).toHaveLength(1)
    })
  })

  describe('creating the participant', () => {
    it('connects and writes the snapshot even when the private record could not be created', async () => {
      fetchMock.mockImplementation(async (url, opts) => {
        if (String(url).endsWith('/private')) throw new Error('lost')
        if (opts?.method === 'POST') return { id: PID, rev: 0 }
        return {}
      })
      const store = useSmileStore()
      await store.setKnown()

      expect(store.cookieState.participantId).toBe(PID)
      expect(store.isDataLoaded).toBe(true)
      expect(readSnapshot().participantId).toBe(PID)
      expect(readSnapshot().data).toBeTruthy()

      // The next save sends the private data anyway
      await store.saveData()
      expect(privatePatches()).toHaveLength(1)
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
        if (opts?.method) return {}
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
      expect(dataPatches()).toHaveLength(1)
      const body = sentBody()
      expect(body.data.pageData_stroop.visit_0.data).toHaveLength(4)
      expect(body.rev).toBeGreaterThan(2)
      expect(store.browserEphemeral.savedRev).toBe(body.rev)
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
        if (opts?.method) return {}
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

    it('resets to a new user when the server no longer has the participant', async () => {
      const store = loadingStore({ local: storedSnapshot(), server: Object.assign(new Error('gone'), { statusCode: 404 }) })
      await store.loadData()
      expect(store.cookieState.participantId).toBeNull()
      expect(store.isDataLoaded).toBe(false)
    })
  })

  describe('saving when the page closes', () => {
    let browserFetch

    beforeEach(() => {
      browserFetch = vi.fn(async () => ({ ok: true }))
      vi.stubGlobal('fetch', browserFetch)
    })

    it('writes the snapshot and sends a keepalive PATCH when there are unsaved changes', () => {
      const store = connectedStore()
      store.data.studyData.push({ trial: 'last' })
      store.saveOnClose()

      expect(readSnapshot().data.studyData).toEqual([{ trial: 'last' }])
      expect(browserFetch).toHaveBeenCalledTimes(1)
      const [url, opts] = browserFetch.mock.calls[0]
      expect(url).toBe(`/api/participants/${PID}`)
      expect(opts).toMatchObject({ method: 'PATCH', keepalive: true })
      const body = JSON.parse(opts.body)
      expect(body.rev).toBe(store.browserEphemeral.rev)
      expect(body.data.studyData).toEqual([{ trial: 'last' }])
      expect(body.resume).toBeTruthy()
    })

    it('does nothing when everything is saved', async () => {
      const store = connectedStore()
      await store.saveData()
      store.saveOnClose()
      expect(browserFetch).not.toHaveBeenCalled()
    })

    it('skips payloads over the keepalive size limit (the local copy has them)', () => {
      const store = connectedStore()
      store.data.big = 'x'.repeat(70_000)
      store.saveOnClose()
      expect(browserFetch).not.toHaveBeenCalled()
      expect(readSnapshot().data.big).toHaveLength(70_000)
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
