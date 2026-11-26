/**
 * @fileoverview Defensive branches of the save path that the main tests
 * don't reach: values that throw while toPlainJSON reads them, a sync loop
 * whose callbacks throw or whose body can't be built, a closing page with a
 * large record, and the store's handling of a snapshot write that throws.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { toPlainJSON, safeStringify } from '../../../src/runtime/utils/plainJSON.js'
import { createSyncLoop } from '../../../src/runtime/core/sync/loop.js'
import useSmileStore from '../../../src/runtime/stores/smilestore'
import useLog from '../../../src/runtime/stores/log'

describe('toPlainJSON: values that throw while they are read', () => {
  const throwing = (traps) => {
    const handler = {}
    for (const trap of traps) {
      handler[trap] = () => {
        throw new Error(`${trap} refused`)
      }
    }
    return new Proxy({}, handler)
  }

  it('never throws, whichever read fails', () => {
    for (const traps of [['get'], ['getPrototypeOf'], ['ownKeys'], ['has'], ['get', 'getPrototypeOf', 'ownKeys', 'has', 'getOwnPropertyDescriptor']]) {
      const warnings = []
      let out
      expect(() => {
        out = toPlainJSON({ ok: 1, bad: throwing(traps) }, { warn: w => warnings.push(w) })
      }, traps.join()).not.toThrow()
      expect(out.ok).toBe(1)
      expect(() => JSON.stringify(out)).not.toThrow()
      // A proxy that only refuses `in` reads as an empty object: nothing to note
      if (traps.join() !== 'has') expect(warnings.length, traps.join()).toBeGreaterThan(0)
    }
  })

  it('keeps the other elements of a list when one element throws', () => {
    const list = [1, 2, 3]
    Object.defineProperty(list, 1, {
      get() {
        throw new Error('no element')
      },
    })
    const warnings = []
    const out = toPlainJSON({ list }, { warn: w => warnings.push(w) })
    expect(out.list).toEqual([1, '[Error: no element]', 3])
    expect(warnings).toEqual([{ path: 'list[1]', issue: 'threw while reading: no element' }])
  })

  it('names what was thrown when it is not an Error, or can\'t be turned into text', () => {
    const warnings = []
    const unprintable = {
      toString() {
        throw new Error('no text')
      },
    }
    const out = toPlainJSON({
      get a() {
        throw 'a string'
      },
      get b() {
        throw unprintable
      },
    }, { warn: w => warnings.push(w) })
    expect(out).toEqual({ a: '[Error: a string]', b: '[Error: unknown error]' })
  })

  it('stores a component by name, and as "anonymous" when its name can\'t be read', () => {
    const named = { name: 'Card', render() {} }
    const scriptSetup = { __name: 'FromFile', setup() {} }
    const hostile = {
      render() {},
      get name() {
        throw new Error('no name')
      },
    }
    const out = toPlainJSON({ named, scriptSetup, hostile })
    expect(JSON.stringify(out.named)).toContain('Card')
    expect(JSON.stringify(out.scriptSetup)).toContain('FromFile')
    expect(JSON.stringify(out.hostile)).toContain('anonymous')
  })

  it('replaces lone surrogates where String.prototype.isWellFormed is missing', () => {
    const isWellFormed = String.prototype.isWellFormed
    // As in a browser from before 2023
    delete String.prototype.isWellFormed
    try {
      expect(toPlainJSON('a\uD800b')).toBe('a�b')
      expect(toPlainJSON('a\uDC00')).toBe('a�')
      expect(toPlainJSON('ok 😀')).toBe('ok 😀')
    }
    finally {
      String.prototype.isWellFormed = isWellFormed
    }
  })

  it('a warn callback that throws does not stop the cleaning', () => {
    expect(toPlainJSON({ big: 1n }, {
      warn: () => {
        throw new Error('callback broke')
      },
    })).toBeDefined()
  })

  it('safeStringify gives "null" when even the cleaned copy can\'t be written', () => {
    const stringify = vi.spyOn(JSON, 'stringify').mockImplementation(() => {
      throw new Error('no JSON today')
    })
    const result = safeStringify({ a: 1 })
    stringify.mockRestore()
    expect(result).toEqual({ text: 'null', cleaned: true })
  })

  it('safeStringify uses the cleaned copy for a value JSON.stringify refuses', () => {
    expect(safeStringify({ big: 1n }).cleaned).toBe(true)
    expect(safeStringify(undefined)).toEqual({ text: 'null', cleaned: true })
    expect(safeStringify({ a: 1 })).toEqual({ text: '{"a":1}', cleaned: false })
  })
})

describe('the sync loop: callbacks that throw, and a closing page', () => {
  /** A loop with one unsaved change, and a server that accepts everything. */
  function setup(overrides = {}) {
    const world = { rev: 1, savedRev: 0, sent: [], warnings: [], statuses: [], body: () => 'x'.repeat(10) }
    world.loop = createSyncLoop({
      take: () => ({ rev: world.rev, savedRev: world.savedRev, body: () => world.body() }),
      send: async (body, info) => {
        world.sent.push({ body, ...info })
        return { status: 200 }
      },
      onConfirmed: (rev) => {
        world.savedRev = Math.max(world.savedRev, rev)
      },
      onStatus: s => world.statuses.push(s),
      warn: m => world.warnings.push(m),
      random: () => 1,
      ...overrides,
    })
    return world
  }
  const tick = ms => vi.advanceTimersByTimeAsync(ms)

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('a body that can\'t be built is a warning, not a failed send, and the next change is sent', async () => {
    const world = setup()
    world.body = () => {
      throw new Error('cannot serialize')
    }
    world.loop.changed()
    await tick(2000)
    expect(world.sent).toEqual([])
    expect(world.warnings).toEqual(['could not build the save: Error: cannot serialize'])

    world.body = () => 'fine'
    world.rev = 2
    world.loop.changed()
    await tick(2000)
    expect(world.sent.map(s => s.rev)).toEqual([2])
    expect(world.savedRev).toBe(2)
  })

  it('sync() reports a body that can\'t be built, without throwing', async () => {
    const world = setup()
    world.body = () => {
      throw new Error('cannot serialize')
    }
    expect(await world.loop.sync()).toEqual({ ok: false, rev: 1, error: 'Error: cannot serialize' })
  })

  it('a count of sends that can\'t be read is treated as zero', async () => {
    const world = setup({
      sent: () => {
        throw new Error('no count')
      },
    })
    world.loop.changed()
    await tick(2000)
    expect(world.sent).toHaveLength(1)
  })

  it('onSend, onStatus and onLimit throwing do not stop a save', async () => {
    const boom = () => {
      throw new Error('callback broke')
    }
    let count = 0
    const world = setup({ onSend: boom, onStatus: boom })
    world.loop.changed()
    await tick(2000)
    expect(world.savedRev).toBe(1)

    const limited = setup({
      sent: () => count,
      onSend: () => {
        count += 1
      },
      onLimit: boom,
      options: { maxSends: 1 },
    })
    limited.loop.changed()
    await tick(2000)
    expect(limited.sent).toHaveLength(1)
    limited.rev = 2
    expect(() => limited.loop.changed()).not.toThrow()
    await tick(5000)
    expect(limited.sent).toHaveLength(1)
    expect(limited.statuses.at(-1).error.kind).toBe('limit')
  })

  it('a change made while the last allowed save was in flight is kept and reported as over the limit', async () => {
    let count = 0
    let release
    const world = setup({
      sent: () => count,
      onSend: () => { count += 1 },
      options: { maxSends: 1 },
      send: async (body, info) => {
        world.sent.push(info)
        await new Promise((resolve) => {
          release = resolve
        })
        return { status: 200 }
      },
    })
    world.loop.changed()
    await tick(1500)
    expect(world.sent).toHaveLength(1)
    world.rev = 2 // changed while rev 1 is on its way
    release()
    await tick(10)
    expect(world.savedRev).toBe(1)
    expect(world.statuses.at(-1).error.kind).toBe('limit')
    await tick(10_000)
    expect(world.sent).toHaveLength(1)
  })

  describe('when the page is hidden', () => {
    it('sends nothing when the body can\'t be built', async () => {
      const world = setup()
      world.body = () => {
        throw new Error('cannot serialize')
      }
      expect(() => world.loop.hidden()).not.toThrow()
      await tick(100)
      expect(world.sent).toEqual([])
    })

    it('a small record goes with keepalive', async () => {
      const world = setup()
      world.loop.hidden()
      await tick(10)
      expect(world.sent).toEqual([{ body: 'x'.repeat(10), rev: 1, keepalive: true }])
      expect(world.savedRev).toBe(1)
    })

    it('a record too large for keepalive, with no compression, goes as an ordinary save', async () => {
      const world = setup({ options: { keepaliveBytes: 50 } })
      world.body = () => 'y'.repeat(200)
      world.loop.hidden()
      await tick(10)
      expect(world.sent).toHaveLength(1)
      expect(world.sent[0].keepalive).toBeFalsy()
      expect(world.savedRev).toBe(1)
    })

    it('a record that fits once gzipped goes gzipped with keepalive', async () => {
      const zipped = new Uint8Array(20)
      const world = setup({ options: { keepaliveBytes: 50 }, compress: async () => zipped })
      world.body = () => 'y'.repeat(200)
      world.loop.hidden()
      await tick(10)
      expect(world.sent).toEqual([{ body: zipped, rev: 1, keepalive: true }])
    })

    it('a record still too large gzipped, or one that can\'t be gzipped, goes as an ordinary save', async () => {
      const big = setup({ options: { keepaliveBytes: 50 }, compress: async () => new Uint8Array(80) })
      big.body = () => 'y'.repeat(200)
      big.loop.hidden()
      await tick(10)
      expect(big.sent).toHaveLength(1)
      expect(big.sent[0].keepalive).toBeFalsy()
      expect(typeof big.sent[0].body).toBe('string')

      const failing = setup({
        options: { keepaliveBytes: 50 },
        compress: async () => {
          throw new Error('no gzip')
        },
      })
      failing.body = () => 'y'.repeat(200)
      failing.loop.hidden()
      await tick(10)
      expect(failing.sent).toHaveLength(1)
      expect(failing.sent[0].keepalive).toBeFalsy()
    })

    it('a record over the size limit is not sent at all from a closing page', async () => {
      const world = setup({ options: { keepaliveBytes: 50, maxBytes: 100 } })
      world.body = () => 'y'.repeat(200)
      world.loop.hidden()
      await tick(10)
      expect(world.sent).toEqual([])
    })

    it('sends nothing when everything is saved', async () => {
      const world = setup()
      world.savedRev = 1
      world.loop.hidden()
      await tick(10)
      expect(world.sent).toEqual([])
    })
  })
})

describe('the store: network changes and a snapshot write that throws', () => {
  let store

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    localStorage.clear()
    vi.stubGlobal('$fetch', vi.fn(async (url, opts) => {
      const body = typeof opts?.body === 'string' ? JSON.parse(opts.body) : {}
      return { success: true, rev: body.rev }
    }))
    vi.stubGlobal('CompressionStream', undefined)
    store = useSmileStore()
    useLog().warn.mockClear()
  })

  afterEach(() => {
    store.stopSnapshots()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('networkChanged does nothing before the participant\'s record is loaded', () => {
    expect(() => {
      store.networkChanged(false)
      store.networkChanged(true)
    }).not.toThrow()
    expect($fetch).not.toHaveBeenCalled()
  })

  it('going offline with a change waiting shows "offline"; coming back sends it', async () => {
    store.cookieState.participantId = 'p-1'
    store.setDataLoaded()
    store.recordData({ trial: 1 })
    store.captureSnapshot()
    expect(store.browserEphemeral.sync.status).toBe('pending')
    store.networkChanged(false)
    expect(store.browserEphemeral.sync.status).toBe('offline')
    store.networkChanged(true)
    await vi.advanceTimersByTimeAsync(50)
    expect($fetch).toHaveBeenCalled()
    expect(store.browserEphemeral.sync.status).toBe('saved')
  })

  it('a snapshot write that throws is logged, and the next request still writes', async () => {
    const capture = vi.spyOn(store, 'captureSnapshot').mockImplementationOnce(() => {
      throw new Error('storage broke')
    })
    store.requestSnapshot()
    await vi.advanceTimersByTimeAsync(5000)
    expect(useLog().warn).toHaveBeenCalledWith('SMILESTORE: could not write the local copy: Error: storage broke')
    store.requestSnapshot()
    await vi.advanceTimersByTimeAsync(5000)
    expect(capture).toHaveBeenCalledTimes(2)
  })

  it('requestSnapshot waits once for a run of changes', async () => {
    const capture = vi.spyOn(store, 'captureSnapshot')
    store.requestSnapshot()
    store.requestSnapshot()
    store.requestSnapshot()
    await vi.advanceTimersByTimeAsync(5000)
    expect(capture).toHaveBeenCalledTimes(1)
  })
})
