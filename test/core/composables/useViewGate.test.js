/**
 * useViewGate: a view with a `preload` list is held back until its files are
 * in memory (#30). The preloader is a real one on a fake network, so the test
 * decides when each file arrives.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import useViewGate from '../../../src/runtime/composables/useViewGate.js'
import { _resetPreload } from '../../../src/runtime/composables/usePreload.js'
import { createPreloader } from '../../../src/runtime/core/preload/preloader.js'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../../src/runtime/composables/useAPI', () => ({ default: () => fake.api }))

const flush = async () => {
  for (let i = 0; i < 30; i += 1) await Promise.resolve()
}

let pending // url -> { resolve } of the fetch in flight
let preloader
let scope
let clock

/** Answers a fetch in flight. */
function arrive(url, { status = 200 } = {}) {
  pending.get(url)({
    ok: status === 200,
    status,
    headers: { get: () => 'video/mp4' },
    body: null,
    blob: async () => new Blob(['12345']),
  })
  pending.delete(url)
}

/** The gate of a view, in a scope the test stops. */
function gateOf(view) {
  const viewConfig = ref(view)
  let gate
  scope = effectScope()
  scope.run(() => {
    gate = useViewGate(viewConfig)
  })
  return { gate, viewConfig }
}

beforeEach(() => {
  pending = new Map()
  clock = 0
  preloader = createPreloader({
    fetch: url => new Promise(resolve => pending.set(url, resolve)),
    createObjectURL: () => 'blob:test',
    revokeObjectURL: () => {},
    now: () => clock,
    wait: () => Promise.resolve(),
    retries: 0,
  })
  _resetPreload({ preloader, publicFiles: null })
  fake.api = {
    log: { error: vi.fn(), warn: vi.fn() },
    recordWindowEvent: vi.fn(),
    conditions: { set: 'b' },
  }
})
afterEach(() => {
  scope?.stop()
  _resetPreload()
})

describe('a view with nothing to preload', () => {
  it('is ready at once', () => {
    const { gate } = gateOf({ name: 'consent', component: {} })
    expect(gate).toMatchObject({ status: 'ready', view: 'consent', urls: [], failed: [] })
    expect(fake.api.recordWindowEvent).not.toHaveBeenCalled()
  })

  it('is ready before the timeline is there, and for an unknown address', () => {
    expect(gateOf(undefined).gate).toMatchObject({ status: 'ready', view: null })
    scope.stop()
    expect(gateOf(null).gate).toMatchObject({ status: 'ready', view: null })
  })
})

describe('a view with files to preload', () => {
  it('is closed in the same tick, and opens when every file is in memory', async () => {
    const { gate } = gateOf({ name: 'task', preload: ['a.mp4', 'b.mp4'] })
    expect(gate).toMatchObject({ status: 'loading', view: 'task', urls: ['/test/a.mp4', '/test/b.mp4'] })
    arrive('/test/a.mp4')
    await flush()
    expect(gate.status).toBe('loading')
    clock = 420
    arrive('/test/b.mp4')
    await flush()
    expect(gate.status).toBe('ready')
  })

  it('records how long the participant waited', async () => {
    const { gate } = gateOf({ name: 'task', preload: ['a.mp4'] })
    clock = 1500
    arrive('/test/a.mp4')
    await flush()
    expect(gate.status).toBe('ready')
    expect(fake.api.recordWindowEvent).toHaveBeenCalledWith('preload', { view: 'task', files: 1, bytes: 5, waited_ms: 1500, failed: [] })
  })

  it('is ready at once, with nothing recorded, when its files are already in memory', async () => {
    const loading = preloader.loadAll(['/test/a.mp4'])
    arrive('/test/a.mp4')
    await loading
    const { gate } = gateOf({ name: 'task', preload: ['a.mp4'] })
    expect(gate).toMatchObject({ status: 'ready', view: 'task', urls: ['/test/a.mp4'] })
    expect(fake.api.recordWindowEvent).not.toHaveBeenCalled()
  })

  it('asks for its files before the ones waiting in the background', () => {
    const one = createPreloader({ fetch: url => new Promise(resolve => pending.set(url, resolve)), concurrency: 1, createObjectURL: () => 'blob:x' })
    _resetPreload({ preloader: one })
    one.loadAll(['/test/bg1.mp4', '/test/bg2.mp4'])
    gateOf({ name: 'task', preload: ['now.mp4'] })
    arrive('/test/bg1.mp4')
    return flush().then(() => expect([...pending.keys()]).toEqual(['/test/now.mp4']))
  })

  it('takes a list that depends on the participant\'s condition', async () => {
    const { gate } = gateOf({ name: 'task', preload: api => [`set-${api.conditions.set}/1.mp4`] })
    expect(gate.urls).toEqual(['/test/set-b/1.mp4'])
    arrive('/test/set-b/1.mp4')
    await flush()
    expect(gate.status).toBe('ready')
  })

  it('waits for the list of public files when the list has a pattern', async () => {
    const { gate } = gateOf({ name: 'task', preload: ['video/*.mp4'] })
    expect(gate).toMatchObject({ status: 'loading', urls: [] })
    await vi.waitFor(() => expect(gate.urls).toEqual(['/test/video/intro.mp4']))
    arrive('/test/video/intro.mp4')
    await flush()
    expect(gate.status).toBe('ready')
  })

  it('a pattern is worked out at once when the list of public files is loaded', () => {
    _resetPreload({ preloader, publicFiles: ['video/intro.mp4'] })
    expect(gateOf({ name: 'task', preload: ['video/*.mp4'] }).gate.urls).toEqual(['/test/video/intro.mp4'])
  })
})

describe('a file that cannot be loaded', () => {
  it('keeps the view closed, and is logged and recorded', async () => {
    const { gate } = gateOf({ name: 'task', preload: ['a.mp4', 'gone.mp4'] })
    arrive('/test/a.mp4')
    arrive('/test/gone.mp4', { status: 404 })
    await flush()
    expect(gate.status).toBe('failed')
    expect(gate.failed).toEqual([{ url: '/test/gone.mp4', error: 'the server answered 404' }])
    expect(fake.api.log.error).toHaveBeenCalledWith('PRELOAD: /test/gone.mp4 could not be loaded: the server answered 404')
    expect(fake.api.recordWindowEvent).toHaveBeenCalledWith('preload', expect.objectContaining({ view: 'task', files: 2, failed: ['/test/gone.mp4'] }))
  })

  it('is tried again by retry(), and the view opens when it arrives', async () => {
    const { gate } = gateOf({ name: 'task', preload: ['gone.mp4'] })
    arrive('/test/gone.mp4', { status: 404 })
    await flush()
    expect(gate.status).toBe('failed')
    gate.retry()
    expect(gate).toMatchObject({ status: 'loading', failed: [] })
    arrive('/test/gone.mp4')
    await flush()
    expect(gate.status).toBe('ready')
  })

  it('a list that cannot be worked out keeps the view closed too', () => {
    const { gate } = gateOf({ name: 'task', preload: () => {
      throw new Error('no condition yet')
    } })
    expect(gate.status).toBe('failed')
    expect(gate.failed).toEqual([{ url: '(the preload list)', error: 'no condition yet' }])
    expect(fake.api.log.error).toHaveBeenCalledWith('PRELOAD: the preload list of view \'task\' could not be worked out: no condition yet')
  })

  it('a list that throws something that is not an error is reported as text', () => {
    const { gate } = gateOf({ name: 'task', preload: () => {
      throw 'plain text'
    } })
    expect(gate.failed[0].error).toBe('plain text')
  })
})

describe('going to another view', () => {
  it('closes for the new view in the same tick', async () => {
    const { gate, viewConfig } = gateOf({ name: 'consent' })
    expect(gate.status).toBe('ready')
    viewConfig.value = { name: 'task', preload: ['a.mp4'] }
    // No await: the view's component must not render in between
    expect(gate).toMatchObject({ status: 'loading', view: 'task' })
    arrive('/test/a.mp4')
    await flush()
    expect(gate.status).toBe('ready')
    viewConfig.value = { name: 'debrief' }
    expect(gate).toMatchObject({ status: 'ready', view: 'debrief', urls: [] })
  })

  it('a view left while its files were loading does not open the next one', async () => {
    const { gate, viewConfig } = gateOf({ name: 'one', preload: ['a.mp4'] })
    viewConfig.value = { name: 'two', preload: ['b.mp4'] }
    arrive('/test/a.mp4')
    await flush()
    expect(gate).toMatchObject({ status: 'loading', view: 'two' })
    expect(fake.api.recordWindowEvent).not.toHaveBeenCalled()
    arrive('/test/b.mp4')
    await flush()
    expect(gate.status).toBe('ready')
    expect(fake.api.recordWindowEvent).toHaveBeenCalledTimes(1)
  })

  it('a view left while the list of public files was loading is forgotten', async () => {
    const { gate, viewConfig } = gateOf({ name: 'one', preload: ['video/*.mp4'] })
    viewConfig.value = { name: 'two' }
    await nextTick()
    await flush()
    expect(gate).toMatchObject({ status: 'ready', view: 'two', urls: [] })
    expect(pending.size).toBe(0)
  })

  it('the same view object replaced by an equal one is not checked again', async () => {
    const { gate, viewConfig } = gateOf({ name: 'task', preload: ['a.mp4'] })
    arrive('/test/a.mp4')
    await flush()
    viewConfig.value = { name: 'task', preload: ['a.mp4'] }
    expect(gate.status).toBe('ready')
    expect(fake.api.recordWindowEvent).toHaveBeenCalledTimes(1)
  })
})
