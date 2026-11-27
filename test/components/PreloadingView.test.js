/**
 * PreloadingView: what a participant sees in place of a view whose files are
 * still loading, or could not be loaded (#30).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick, reactive } from 'vue'
import PreloadingView from '../../src/runtime/components/builtins/PreloadingView.vue'
import { _resetPreload } from '../../src/runtime/composables/usePreload.js'
import { mountComponent } from './mount'
import { setFlags, resetFlags } from '../setup/flags.js'

let entries
let wrapper

const mountView = (gate, props = {}) => {
  wrapper = mountComponent(PreloadingView, { props: { gate, ...props } })
  return wrapper
}
const makeGate = (over = {}) => reactive({
  status: 'loading',
  view: 'task',
  urls: ['/a.png', '/b.mp4', '/c.mp4', '/d.mp4'],
  failed: [],
  retry: vi.fn(),
  ...over,
})
const box = () => wrapper.find('[data-testid="preloading"]')

beforeEach(() => {
  vi.useFakeTimers()
  entries = reactive(new Map())
  _resetPreload({
    preloader: {
      progress: (urls) => {
        const ready = urls.filter(url => entries.get(url) === 'ready').length
        return { total: urls.length, ready, failed: 0, fraction: urls.length ? ready / urls.length : 1 }
      },
    },
  })
})
afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
  _resetPreload()
  resetFlags()
})

describe('while the files load', () => {
  it('draws nothing for the first moment, so a short wait does not flash', async () => {
    mountView(makeGate())
    expect(box().exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(299)
    expect(box().exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(box().exists()).toBe(true)
    expect(box().attributes('data-status')).toBe('loading')
    expect(box().attributes('role')).toBe('status')
  })

  it('the wait before drawing can be set', async () => {
    mountView(makeGate(), { delay: 0 })
    await vi.advanceTimersByTimeAsync(0)
    expect(box().exists()).toBe(true)
  })

  it('counts the files in memory and follows them as they arrive', async () => {
    entries.set('/a.png', 'ready')
    mountView(makeGate(), { delay: 0 })
    await vi.advanceTimersByTimeAsync(0)
    expect(wrapper.find('[data-testid="preloading-count"]').text()).toBe('1 of 4 files')
    expect(wrapper.find('[data-slot="progress"]').exists()).toBe(true)
    expect(wrapper.find('[data-slot="progress-indicator"]').attributes('style')).toContain('translateX(-75%)')
    entries.set('/b.mp4', 'ready')
    entries.set('/c.mp4', 'ready')
    await nextTick()
    expect(wrapper.find('[data-testid="preloading-count"]').text()).toBe('3 of 4 files')
    expect(wrapper.find('[data-slot="progress-indicator"]').attributes('style')).toContain('translateX(-25%)')
  })

  it('has no retry button and does not retry by itself', async () => {
    const gate = makeGate()
    mountView(gate, { delay: 0 })
    await vi.advanceTimersByTimeAsync(20000)
    expect(wrapper.find('[data-testid="preloading-retry"]').exists()).toBe(false)
    expect(gate.retry).not.toHaveBeenCalled()
  })

  it('leaving before the first moment is over draws nothing later', async () => {
    mountView(makeGate())
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.find('[data-testid="preloading"]').exists()).toBe(false)
  })
})

describe('when files could not be loaded', () => {
  const failedGate = () => makeGate({ status: 'failed', failed: [{ url: '/d.mp4', error: 'the server answered 404' }] })

  it('says so at once, in words for a participant', () => {
    mountView(failedGate())
    expect(box().attributes('data-status')).toBe('failed')
    expect(box().text()).toContain('Some files could not be loaded')
    expect(box().text()).toContain('Please check your internet connection')
    expect(wrapper.find('[data-testid="preloading-count"]').exists()).toBe(false)
  })

  it('does not name the files in a build', () => {
    mountView(failedGate())
    expect(wrapper.find('[data-testid="preloading-failed"]').exists()).toBe(false)
    expect(box().text()).not.toContain('/d.mp4')
  })

  it('names each file and why on the dev server', () => {
    setFlags({ dev: true })
    mountView(failedGate())
    expect(wrapper.find('[data-testid="preloading-failed"]').text()).toBe('/d.mp4: the server answered 404')
  })

  it('the button tries again', async () => {
    const gate = failedGate()
    mountView(gate)
    await wrapper.find('[data-testid="preloading-retry"]').trigger('click')
    expect(gate.retry).toHaveBeenCalledTimes(1)
  })

  it('tries again by itself every few seconds', async () => {
    const gate = failedGate()
    mountView(gate, { retryEvery: 2000 })
    await vi.advanceTimersByTimeAsync(6000)
    expect(gate.retry).toHaveBeenCalledTimes(3)
  })

  it('tries again when the browser comes back online', () => {
    const gate = failedGate()
    mountView(gate)
    window.dispatchEvent(new Event('online'))
    expect(gate.retry).toHaveBeenCalledTimes(1)
  })

  it('stops trying when the load is under way again, and when it leaves', async () => {
    const gate = failedGate()
    mountView(gate, { retryEvery: 1000 })
    gate.status = 'loading'
    await nextTick()
    await vi.advanceTimersByTimeAsync(5000)
    window.dispatchEvent(new Event('online'))
    expect(gate.retry).not.toHaveBeenCalled()
    // Shown already, so the progress is drawn without the first wait
    expect(wrapper.find('[data-testid="preloading-count"]').exists()).toBe(true)

    gate.status = 'failed'
    await nextTick()
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(5000)
    window.dispatchEvent(new Event('online'))
    expect(gate.retry).not.toHaveBeenCalled()
  })

  it('a load that fails later is shown when it fails', async () => {
    const gate = makeGate()
    mountView(gate)
    expect(box().exists()).toBe(false)
    gate.status = 'failed'
    await nextTick()
    expect(box().text()).toContain('Some files could not be loaded')
  })
})
