/**
 * The preload plugin: when the app has mounted, the files of every view that
 * lists some are queued in timeline order (#30).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useRuntimeConfig } from '#imports'
import plugin from '../../../src/runtime/plugins/preload.client.js'
import { _resetPreload } from '../../../src/runtime/composables/usePreload.js'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../../src/runtime/composables/useAPI', () => ({ default: () => fake.api }))

let preloader
let hooks

/** Runs the plugin and the app:mounted hook it registered. */
async function start(timeline, smile = {}) {
  vi.mocked(useRuntimeConfig).mockReturnValue({ app: { baseURL: '/' }, public: { smile } })
  hooks = {}
  plugin({ $timeline: timeline, hook: (name, fn) => (hooks[name] = fn) })
  await hooks['app:mounted']?.()
}

const view = (name, preload) => ({ name, preload })

beforeEach(() => {
  preloader = { loadAll: vi.fn(async () => ({ ok: true })) }
  _resetPreload({ preloader })
  fake.api = { log: { warn: vi.fn() }, conditions: {} }
})
afterEach(() => _resetPreload())

describe('the preload plugin', () => {
  it('queues each view\'s files in timeline order, then the views outside the sequence', async () => {
    const consent = view('consent')
    const task = view('task', ['stimuli/*.png', 'clip.mp4'])
    const debrief = view('debrief', 'thanks.png')
    const branch = view('branch', ['branch.png'])
    await start({ seqtimeline: [consent, task, debrief], routes: [branch, consent, task, debrief] })
    expect(preloader.loadAll.mock.calls).toEqual([
      [['/stimuli/a.png', '/stimuli/b.png', '/clip.mp4']],
      [['/thanks.png']],
      [['/branch.png']],
    ])
  })

  it('does not wait for one view\'s files before queueing the next', async () => {
    preloader.loadAll = vi.fn(() => new Promise(() => {})) // never finishes
    await start({ seqtimeline: [view('a', ['a.png']), view('b', ['b.png'])], routes: [] })
    expect(preloader.loadAll).toHaveBeenCalledTimes(2)
  })

  it('passes the API to a list that is a function', async () => {
    fake.api.conditions.set = 'b'
    await start({ seqtimeline: [view('task', api => [`set-${api.conditions.set}.png`])], routes: [] })
    expect(preloader.loadAll).toHaveBeenCalledWith(['/set-b.png'])
  })

  it('skips a list that cannot be worked out yet and carries on', async () => {
    const early = view('early', () => {
      throw new Error('no condition yet')
    })
    await start({ seqtimeline: [early, view('later', ['later.png'])], routes: [] })
    expect(preloader.loadAll.mock.calls).toEqual([[['/later.png']]])
  })

  it('does nothing when no view lists files', async () => {
    await start({ seqtimeline: [view('a'), view('b')], routes: [view('c')] })
    expect(preloader.loadAll).not.toHaveBeenCalled()
  })

  it('does nothing in an app with no timeline', async () => {
    await start(undefined)
    expect(preloader.loadAll).not.toHaveBeenCalled()
  })

  it('is off with preloadAhead: false', async () => {
    await start({ seqtimeline: [view('task', ['a.png'])], routes: [] }, { preloadAhead: false })
    expect(hooks['app:mounted']).toBeUndefined()
    expect(preloader.loadAll).not.toHaveBeenCalled()
  })

  it('is on when the runtime config does not say', async () => {
    vi.mocked(useRuntimeConfig).mockReturnValue({})
    hooks = {}
    plugin({ $timeline: { seqtimeline: [view('task', ['a.png'])], routes: [] }, hook: (name, fn) => (hooks[name] = fn) })
    await hooks['app:mounted']()
    expect(preloader.loadAll).toHaveBeenCalledWith(['/a.png'])
  })
})
