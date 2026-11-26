import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import ReconnectingNotice from '../../src/runtime/components/builtins/ReconnectingNotice.vue'
import { createStore, mountComponent } from './mount'

/**
 * Mounts the notice.
 * @param {boolean} loadFailed - The store's loadFailed
 * @param {object} [props] - The notice's props
 * @returns {{ wrapper: object, store: object }} The wrapper and the store
 */
function mountWith(loadFailed, props = {}) {
  const { pinia, store } = createStore((s) => {
    s.browserEphemeral.loadFailed = loadFailed
  })
  return { wrapper: mountComponent(ReconnectingNotice, { pinia, props }), store }
}

const notice = wrapper => wrapper.find('[data-testid="reconnecting-notice"]')

describe('ReconnectingNotice', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows nothing when the record loaded', () => {
    const { wrapper, store } = mountWith(false)
    expect(notice(wrapper).exists()).toBe(false)
    vi.advanceTimersByTime(10000)
    expect(store.loadData).not.toHaveBeenCalled()
  })

  it('covers the window when the record could not be loaded', () => {
    const { wrapper } = mountWith(true)
    expect(notice(wrapper).exists()).toBe(true)
    expect(notice(wrapper).attributes('role')).toBe('alertdialog')
    expect(notice(wrapper).classes()).toContain('fixed')
    expect(wrapper.find('h2').text()).toBe('Reconnecting')
    expect(wrapper.text()).toContain('We couldn\'t load your progress')
  })

  it('fills its container instead of the window with the inline prop (dev tools)', () => {
    const { wrapper } = mountWith(true, { inline: true })
    expect(notice(wrapper).classes()).not.toContain('fixed')
    expect(notice(wrapper).classes()).toContain('h-full')
  })

  it('tries the load again every 3 seconds', async () => {
    const { store } = mountWith(true)
    vi.advanceTimersByTime(2999)
    expect(store.loadData).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(store.loadData).toHaveBeenCalledTimes(1)
    await flushPromises()
    vi.advanceTimersByTime(3000)
    expect(store.loadData).toHaveBeenCalledTimes(2)
  })

  it('tries the load again when the browser comes back online', () => {
    const { store } = mountWith(true)
    window.dispatchEvent(new Event('online'))
    expect(store.loadData).toHaveBeenCalledTimes(1)
  })

  it('tries the load again when the button is pressed', async () => {
    const { wrapper, store } = mountWith(true)
    await wrapper.find('[data-testid="reconnecting-retry"]').trigger('click')
    expect(store.loadData).toHaveBeenCalledTimes(1)
  })

  it('does not start a second load while one is running', async () => {
    const { wrapper, store } = mountWith(true)
    let finish
    store.loadData.mockReturnValue(new Promise((resolve) => {
      finish = resolve
    }))
    await wrapper.find('[data-testid="reconnecting-retry"]').trigger('click')
    vi.advanceTimersByTime(9000)
    window.dispatchEvent(new Event('online'))
    expect(store.loadData).toHaveBeenCalledTimes(1)
    // When it ends, the next try goes ahead
    finish()
    await flushPromises()
    vi.advanceTimersByTime(3000)
    expect(store.loadData).toHaveBeenCalledTimes(2)
  })

  it('keeps trying after a load that throws', async () => {
    const { wrapper, store } = mountWith(true)
    store.loadData.mockRejectedValueOnce(new Error('network'))
    // The click handler's rejection is the component's to report; here only
    // that the next try is not blocked
    wrapper.vm.$.appContext.config.errorHandler = () => {}
    await wrapper.find('[data-testid="reconnecting-retry"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="reconnecting-retry"]').trigger('click')
    expect(store.loadData).toHaveBeenCalledTimes(2)
  })

  it('goes away and stops trying once the record has loaded', async () => {
    const { wrapper, store } = mountWith(true)
    store.browserEphemeral.loadFailed = false
    await nextTick()
    expect(notice(wrapper).exists()).toBe(false)
    vi.advanceTimersByTime(10000)
    window.dispatchEvent(new Event('online'))
    expect(store.loadData).not.toHaveBeenCalled()
  })

  it('starts trying when a load fails after it was mounted', async () => {
    const { wrapper, store } = mountWith(false)
    store.browserEphemeral.loadFailed = true
    await nextTick()
    expect(notice(wrapper).exists()).toBe(true)
    vi.advanceTimersByTime(3000)
    expect(store.loadData).toHaveBeenCalledTimes(1)
  })

  it('stops trying when it is removed', () => {
    const { wrapper, store } = mountWith(true)
    wrapper.unmount()
    vi.advanceTimersByTime(10000)
    window.dispatchEvent(new Event('online'))
    expect(store.loadData).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
