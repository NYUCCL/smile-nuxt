/**
 * @fileoverview The store-sync plugin (plugins/store-sync.client.js) and the
 * dev-sync plugin: what they write to cookies, when they ask the store for a
 * snapshot, what they do when the page is hidden, and the two-tab wiring.
 * The store is the real one; its network calls are stubbed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import useSmileStore, { initDev, COOKIE_MAX_AGE } from '../../../src/runtime/stores/smilestore'
import useLog from '../../../src/runtime/stores/log'
import appconfig from '../../../src/runtime/core/config.js'
import storeSync from '../../../src/runtime/plugins/store-sync.client.js'
import devSync from '../../../src/runtime/plugins/dev-sync.client.js'

/** A BroadcastChannel stand-in that keeps what was posted. */
class FakeChannel {
  static instances = []
  constructor(name) {
    this.name = name
    this.posted = []
    this.onmessage = null
    FakeChannel.instances.push(this)
  }

  postMessage(message) {
    this.posted.push(message)
  }
}

describe('store-sync plugin', () => {
  let store, nuxtApp, windowHandlers, documentHandlers, cookieWrites

  /** Runs the plugin; listeners are captured instead of added to the window. */
  function start() {
    storeSync(nuxtApp)
  }
  const fire = (handlers, type) => (handlers[type] || []).forEach(fn => fn())

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.stubGlobal('$fetch', vi.fn(async () => ({ success: true })))
    FakeChannel.instances = []
    vi.stubGlobal('BroadcastChannel', FakeChannel)

    windowHandlers = {}
    documentHandlers = {}
    vi.spyOn(window, 'addEventListener').mockImplementation((type, fn) => {
      (windowHandlers[type] ||= []).push(fn)
    })
    vi.spyOn(document, 'addEventListener').mockImplementation((type, fn) => {
      (documentHandlers[type] ||= []).push(fn)
    })
    cookieWrites = []
    vi.spyOn(document, 'cookie', 'set').mockImplementation((value) => {
      cookieWrites.push(value)
    })

    store = useSmileStore()
    nuxtApp = { payload: { pinia: { smilestore: { stale: true }, other: { kept: true } } } }
    useLog().warn.mockClear()
  })

  afterEach(() => {
    store.stopSnapshots()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('at startup', () => {
    it('removes the server-rendered store state from the payload, and nothing else', () => {
      start()
      expect(nuxtApp.payload.pinia).toEqual({ other: { kept: true } })
    })

    it('works when the payload has no pinia state', () => {
      nuxtApp = {}
      expect(() => start()).not.toThrow()
      nuxtApp = { payload: {} }
      expect(() => start()).not.toThrow()
    })

    it('restores the position from the local snapshot', () => {
      const restore = vi.spyOn(store, 'restoreLocal')
      start()
      expect(restore).toHaveBeenCalledTimes(1)
    })

    it('logs a warning and carries on when the snapshot can\'t be read', () => {
      vi.spyOn(store, 'restoreLocal').mockImplementation(() => {
        throw new Error('bad snapshot')
      })
      expect(() => start()).not.toThrow()
      expect(useLog().warn).toHaveBeenCalledWith('SMILESTORE: could not read the local snapshot: Error: bad snapshot')
      // The rest of the plugin still ran
      expect(windowHandlers.pagehide).toHaveLength(1)
    })
  })

  describe('cookie state', () => {
    it('writes every cookie value when one changes', async () => {
      start()
      store.cookieState.lastRoute = 'task'
      await nextTick()
      const prefix = `smile_${appconfig.codeName}_`
      expect(cookieWrites).toHaveLength(Object.keys(store.cookieState).length)
      expect(cookieWrites).toContain(
        `${prefix}lastRoute=${encodeURIComponent('"task"')}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`,
      )
    })

    it('encodes values that are not strings as JSON', async () => {
      start()
      store.cookieState.consented = true
      await nextTick()
      expect(cookieWrites.some(c => c.startsWith(`smile_${appconfig.codeName}_consented=true;`))).toBe(true)
    })

    it('writes nothing when nothing changed', async () => {
      start()
      await nextTick()
      expect(cookieWrites).toEqual([])
    })
  })

  describe('dev state', () => {
    it('puts the defaults back when store.dev is cleared', async () => {
      start()
      store.dev = null
      await nextTick()
      expect(store.dev).toEqual(initDev)
      expect(store.dev).not.toBe(initDev)
    })

    it('leaves a changed dev state alone', async () => {
      start()
      store.dev = { ...initDev, pinnedRoute: 'task' }
      await nextTick()
      expect(store.dev.pinnedRoute).toBe('task')
    })
  })

  describe('the local snapshot', () => {
    it('asks for a snapshot when the record changes', async () => {
      const request = vi.spyOn(store, 'requestSnapshot').mockImplementation(() => {})
      start()
      store.data.answer = 42
      await nextTick()
      expect(request).toHaveBeenCalledTimes(1)
    })

    it('asks when the private data, the position or the saved flags change', async () => {
      const request = vi.spyOn(store, 'requestSnapshot').mockImplementation(() => {})
      start()
      const changes = [
        () => { store.private.note = 'x' },
        () => { store.cookieState.lastRoute = 'task' },
        () => { store.cookieState.participantId = 'p-1' },
        () => { store.browserEphemeral.dataLoaded = true },
        () => { store.browserEphemeral.loadFailed = true },
        () => { store.localState.viewSteppers = { task: { data: {} } } },
        () => { store.localState.conditions = { color: 'red' } },
        () => { store.localState.totalWrites = 3 },
      ]
      for (const [i, change] of changes.entries()) {
        change()
        await nextTick()
        expect(request, `change ${i}`).toHaveBeenCalledTimes(i + 1)
      }
    })

    it('does not ask when something outside the snapshot changes', async () => {
      const request = vi.spyOn(store, 'requestSnapshot').mockImplementation(() => {})
      start()
      store.browserEphemeral.currentViewDone = true
      store.cookieState.consented = true
      await nextTick()
      expect(request).not.toHaveBeenCalled()
    })
  })

  describe('when the page is hidden or closing', () => {
    it('writes the snapshot and sends it on pagehide', () => {
      const capture = vi.spyOn(store, 'captureSnapshot').mockImplementation(() => {})
      const save = vi.spyOn(store, 'saveOnClose').mockImplementation(() => {})
      start()
      fire(windowHandlers, 'pagehide')
      expect(capture).toHaveBeenCalledTimes(1)
      expect(save).toHaveBeenCalledTimes(1)
      expect(capture.mock.invocationCallOrder[0]).toBeLessThan(save.mock.invocationCallOrder[0])
    })

    it('does the same when the page becomes hidden', () => {
      const capture = vi.spyOn(store, 'captureSnapshot').mockImplementation(() => {})
      const save = vi.spyOn(store, 'saveOnClose').mockImplementation(() => {})
      start()
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      fire(documentHandlers, 'visibilitychange')
      expect(capture).toHaveBeenCalledTimes(1)
      expect(save).toHaveBeenCalledTimes(1)
    })

    it('does nothing when the page becomes visible', () => {
      const capture = vi.spyOn(store, 'captureSnapshot').mockImplementation(() => {})
      const save = vi.spyOn(store, 'saveOnClose').mockImplementation(() => {})
      start()
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
      fire(documentHandlers, 'visibilitychange')
      expect(capture).not.toHaveBeenCalled()
      expect(save).not.toHaveBeenCalled()
    })

    it('still sends when writing the snapshot throws', () => {
      vi.spyOn(store, 'captureSnapshot').mockImplementation(() => {
        throw new Error('storage full')
      })
      const save = vi.spyOn(store, 'saveOnClose').mockImplementation(() => {})
      start()
      expect(() => fire(windowHandlers, 'pagehide')).not.toThrow()
      expect(useLog().warn).toHaveBeenCalledWith('SMILESTORE: could not write the local snapshot: Error: storage full')
      expect(save).toHaveBeenCalledTimes(1)
    })

    it('logs a warning when sending throws', () => {
      vi.spyOn(store, 'captureSnapshot').mockImplementation(() => {})
      vi.spyOn(store, 'saveOnClose').mockImplementation(() => {
        throw new Error('no network')
      })
      start()
      expect(() => fire(windowHandlers, 'pagehide')).not.toThrow()
      expect(useLog().warn).toHaveBeenCalledWith('SMILESTORE: could not send the snapshot: Error: no network')
    })
  })

  describe('the network', () => {
    it('tells the store when the browser goes online or offline', () => {
      const changed = vi.spyOn(store, 'networkChanged').mockImplementation(() => {})
      start()
      fire(windowHandlers, 'offline')
      expect(changed).toHaveBeenLastCalledWith(false)
      fire(windowHandlers, 'online')
      expect(changed).toHaveBeenLastCalledWith(true)
      expect(changed).toHaveBeenCalledTimes(2)
    })
  })

  describe('two tabs', () => {
    const channel = () => FakeChannel.instances[0]
    const hello = (startedAt, id = 'other-tab') => ({ data: { type: 'hello', id, startedAt } })

    it('opens a channel named after the study', () => {
      start()
      expect(FakeChannel.instances).toHaveLength(1)
      expect(channel().name).toBe(`smile-tabs-${appconfig.codeName}`)
    })

    it('says hello once the participant\'s record is loaded, not before', async () => {
      start()
      expect(channel().posted).toEqual([])
      store.browserEphemeral.dataLoaded = true
      await nextTick()
      expect(channel().posted).toHaveLength(1)
      expect(channel().posted[0]).toMatchObject({ type: 'hello' })
      expect(typeof channel().posted[0].id).toBe('string')
      expect(typeof channel().posted[0].startedAt).toBe('number')
    })

    it('says hello at once when the record is already loaded', () => {
      store.browserEphemeral.dataLoaded = true
      start()
      expect(channel().posted).toHaveLength(1)
    })

    it('pauses this tab when a newer tab says hello', () => {
      const pause = vi.spyOn(store, 'pauseForOtherTab').mockImplementation(() => {})
      store.browserEphemeral.dataLoaded = true
      start()
      channel().onmessage(hello(Date.now() + 60_000))
      expect(pause).toHaveBeenCalledWith('newer-tab')
    })

    it('answers an older tab instead of pausing', () => {
      const pause = vi.spyOn(store, 'pauseForOtherTab').mockImplementation(() => {})
      store.browserEphemeral.dataLoaded = true
      start()
      channel().onmessage(hello(Date.now() - 60_000))
      expect(pause).not.toHaveBeenCalled()
      expect(channel().posted).toHaveLength(2)
    })

    it('ignores other tabs while this one has no record', () => {
      const pause = vi.spyOn(store, 'pauseForOtherTab').mockImplementation(() => {})
      start()
      channel().onmessage(hello(Date.now() + 60_000))
      expect(pause).not.toHaveBeenCalled()
    })

    it('ignores other tabs once this one is paused', () => {
      const pause = vi.spyOn(store, 'pauseForOtherTab').mockImplementation(() => {})
      store.browserEphemeral.dataLoaded = true
      store.browserEphemeral.otherTab = 'newer-tab'
      start()
      channel().onmessage(hello(Date.now() + 60_000))
      expect(pause).not.toHaveBeenCalled()
    })

    it('runs without BroadcastChannel', async () => {
      vi.stubGlobal('BroadcastChannel', undefined)
      expect(() => start()).not.toThrow()
      store.browserEphemeral.dataLoaded = true
      await nextTick()
      expect(FakeChannel.instances).toEqual([])
    })

    it('runs when opening the channel throws', async () => {
      vi.stubGlobal('BroadcastChannel', class {
        constructor() {
          throw new Error('blocked')
        }
      })
      expect(() => start()).not.toThrow()
      store.browserEphemeral.dataLoaded = true
      await nextTick()
      // The listeners after the channel are still added
      expect(windowHandlers.online).toHaveLength(1)
    })

    it('gives the tab an id when crypto.randomUUID is missing', () => {
      vi.stubGlobal('crypto', {})
      store.browserEphemeral.dataLoaded = true
      start()
      expect(channel().posted[0].id).toMatch(/^\d+$/)
    })
  })
})

describe('dev-sync plugin', () => {
  let store, cookieWrites

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useSmileStore()
    cookieWrites = []
    vi.spyOn(document, 'cookie', 'set').mockImplementation((value) => {
      cookieWrites.push(value)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes the dev state to its cookie when a field changes', async () => {
    devSync()
    store.dev.pinnedRoute = 'task'
    await nextTick()
    expect(cookieWrites).toHaveLength(1)
    const [pair, ...attributes] = cookieWrites[0].split('; ')
    const [name, value] = pair.split('=')
    expect(name).toBe(`smile_${appconfig.codeName}_dev`)
    expect(JSON.parse(decodeURIComponent(value))).toEqual({ ...initDev, pinnedRoute: 'task' })
    expect(attributes).toEqual(['path=/', `max-age=${86400 * 365}`, 'SameSite=Lax'])
  })

  it('writes when the whole dev state is replaced', async () => {
    devSync()
    store.dev = { ...initDev, pinnedRoute: 'quiz' }
    await nextTick()
    expect(cookieWrites).toHaveLength(1)
    expect(decodeURIComponent(cookieWrites[0])).toContain('"pinnedRoute":"quiz"')
  })

  it('writes nothing before a change', async () => {
    devSync()
    await nextTick()
    expect(cookieWrites).toEqual([])
  })
})
