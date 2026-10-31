import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import useSmileStore, { dataBackupKey } from '../../../src/runtime/stores/smilestore'
import appconfig from '../../../src/runtime/core/config.js'

/**
 * #42: participant data recorded since the last save must survive a reload.
 * The store mirrors store.data to a local backup, prefers a newer backup over
 * the DB copy on load, defers (rather than drops) throttled saves, and sends a
 * best-effort keepalive save when the page closes.
 */

const PID = 'p-1'

function readBackup() {
  const raw = localStorage.getItem(dataBackupKey)
  return raw ? JSON.parse(raw) : null
}

function writeBackup(record) {
  localStorage.setItem(dataBackupKey, JSON.stringify(record))
}

/** A store connected to participant PID, as after consent or a successful load. */
function connectedStore() {
  const store = useSmileStore()
  store.cookieState.participantId = PID
  store.setDataLoaded()
  return store
}

describe('smilestore local data backup (#42)', () => {
  let fetchMock
  const savedInterval = appconfig.minWriteInterval
  const savedMaxWrites = appconfig.maxWrites

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    fetchMock = vi.fn(async () => ({}))
    vi.stubGlobal('$fetch', fetchMock)
    appconfig.minWriteInterval = 2000
    appconfig.maxWrites = 1000
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    appconfig.minWriteInterval = savedInterval
    appconfig.maxWrites = savedMaxWrites
  })

  const dataPatches = () => fetchMock.mock.calls.filter(([url, opts]) =>
    opts?.method === 'PATCH' && !String(url).endsWith('/private'))

  describe('writing the backup', () => {
    it('backs up store.data locally when it changes', () => {
      const store = connectedStore()
      store.data.pageData_stroop = { visit_0: { data: [{ id: 'a' }] } }
      store.noteDataChanged({ replaced: false })

      const backup = readBackup()
      expect(backup.participantId).toBe(PID)
      expect(backup.rev).toBeGreaterThan(backup.savedRev)
      expect(backup.data.pageData_stroop.visit_0.data).toEqual([{ id: 'a' }])
    })

    it('does not back up before the participant has a record', () => {
      const store = useSmileStore()
      store.noteDataChanged({ replaced: false })
      expect(readBackup()).toBeNull()
    })

    it('a replaced (freshly loaded) data object is not marked unsaved', () => {
      const store = connectedStore()
      store.noteDataChanged({ replaced: true })
      const backup = readBackup()
      expect(backup.rev).toBe(backup.savedRev)
    })
  })

  describe('saving', () => {
    it('marks the backup saved after a successful save', async () => {
      const store = connectedStore()
      store.noteDataChanged({ replaced: false })
      await store.saveData()

      const backup = readBackup()
      expect(dataPatches()).toHaveLength(1)
      expect(backup.savedRev).toBe(backup.rev)
    })

    it('keeps changes made while a save is in flight marked unsaved', async () => {
      const store = connectedStore()
      store.noteDataChanged({ replaced: false })
      fetchMock.mockImplementationOnce(async () => {
        store.noteDataChanged({ replaced: false }) // a trial recorded mid-request
        return {}
      })
      await store.saveData()

      const backup = readBackup()
      expect(backup.rev).toBeGreaterThan(backup.savedRev)
    })

    it('defers a save that comes too soon instead of dropping it', async () => {
      vi.useFakeTimers()
      const store = connectedStore()
      store.localState.lastWrite = Date.now()
      store.noteDataChanged({ replaced: false })

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

  describe('loading', () => {
    const dbData = { routeOrder: [{ route: 'stroop' }], consented: true }
    const localData = {
      routeOrder: [{ route: 'stroop' }],
      consented: true,
      pageData_stroop: { visit_0: { data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] } },
    }

    function loadingStore(backup) {
      if (backup) writeBackup(backup)
      fetchMock.mockImplementation(async (url, opts) => (opts?.method ? {} : { data: structuredClone(dbData) }))
      const store = useSmileStore()
      store.cookieState.knownUser = true
      store.cookieState.participantId = PID
      return store
    }

    it('restores a newer local backup instead of the DB copy, then saves it', async () => {
      const store = loadingStore({ participantId: PID, rev: 5, savedRev: 2, data: localData })
      await store.loadData()

      expect(store.data.pageData_stroop.visit_0.data).toHaveLength(4)
      expect(store.isDataLoaded).toBe(true)
      const patches = dataPatches()
      expect(patches).toHaveLength(1)
      expect(patches[0][1].body.data.pageData_stroop.visit_0.data).toHaveLength(4)
    })

    it('uses the DB copy when the backup has nothing unsaved', async () => {
      const store = loadingStore({ participantId: PID, rev: 5, savedRev: 5, data: localData })
      await store.loadData()

      expect(store.data.pageData_stroop).toBeUndefined()
      expect(dataPatches()).toHaveLength(0)
    })

    it('ignores a backup that belongs to another participant', async () => {
      const store = loadingStore({ participantId: 'someone-else', rev: 5, savedRev: 0, data: localData })
      await store.loadData()

      expect(store.data.pageData_stroop).toBeUndefined()
    })

    it('uses the DB copy when there is no backup', async () => {
      const store = loadingStore(null)
      await store.loadData()
      // setDataLoaded() also merges local conditions/randomizedRoutes into data
      expect(store.data).toMatchObject(dbData)
      expect(store.data.pageData_stroop).toBeUndefined()
    })
  })

  describe('saving when the page closes', () => {
    let browserFetch

    beforeEach(() => {
      browserFetch = vi.fn(async () => ({ ok: true }))
      vi.stubGlobal('fetch', browserFetch)
    })

    it('sends a keepalive PATCH when there are unsaved changes', () => {
      const store = connectedStore()
      store.noteDataChanged({ replaced: false })
      store.saveOnClose()

      expect(browserFetch).toHaveBeenCalledTimes(1)
      const [url, opts] = browserFetch.mock.calls[0]
      expect(url).toBe(`/api/participants/${PID}`)
      expect(opts).toMatchObject({ method: 'PATCH', keepalive: true })
      expect(JSON.parse(opts.body).data).toBeTruthy()
    })

    it('does nothing when everything is saved', () => {
      const store = connectedStore()
      store.saveOnClose()
      expect(browserFetch).not.toHaveBeenCalled()
    })

    it('skips payloads over the keepalive size limit (the backup covers them)', () => {
      const store = connectedStore()
      store.data.big = 'x'.repeat(70_000)
      store.noteDataChanged({ replaced: false })
      store.saveOnClose()
      expect(browserFetch).not.toHaveBeenCalled()
    })
  })

  describe('clearing', () => {
    it('removes the backup when the participant state is reset', () => {
      const store = connectedStore()
      store.noteDataChanged({ replaced: false })
      expect(readBackup()).not.toBeNull()
      store.clearDataBackup()
      expect(readBackup()).toBeNull()
    })
  })
})
