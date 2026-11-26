import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import SyncIndicator from '../../src/runtime/components/builtins/SyncIndicator.vue'
import { createStore, mountComponent } from './mount'

/**
 * Mounts the indicator with the store in the given state.
 * @param {object} state - Parts of browserEphemeral to set
 * @returns {{ wrapper: object, store: object }} The wrapper and the store
 */
function mountWith(state) {
  const { pinia, store } = createStore((s) => {
    Object.assign(s.browserEphemeral, { dataLoaded: true, sync: { status: 'saved', error: null }, unsavedChanges: false, otherTab: false }, state)
  })
  return { wrapper: mountComponent(SyncIndicator, { pinia }), store }
}

const indicator = wrapper => wrapper.find('[data-testid="sync-indicator"]')

describe('SyncIndicator', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows nothing before the participant has a record', () => {
    const { wrapper } = mountWith({ dataLoaded: false })
    expect(indicator(wrapper).exists()).toBe(false)
  })

  it('shows nothing while another tab has the participant', () => {
    const { wrapper } = mountWith({ otherTab: 'newer-tab' })
    expect(indicator(wrapper).exists()).toBe(false)
  })

  it('shows "saved" when the server has everything', async () => {
    const { wrapper } = mountWith({})
    // Mounted in a state that isn't active: the hold runs out first
    vi.advanceTimersByTime(800)
    await nextTick()
    expect(indicator(wrapper).attributes('data-state')).toBe('saved')
    expect(indicator(wrapper).attributes('title')).toBe('Your progress is saved')
    expect(indicator(wrapper).attributes('role')).toBe('status')
    expect(wrapper.find('.sr-only').text()).toBe('Your progress is saved')
    expect(wrapper.find('svg').classes()).not.toContain('animate-pulse')
  })

  it.each([
    ['a save on its way', { sync: { status: 'saving', error: null } }],
    ['a change waiting to be sent', { sync: { status: 'pending', error: null } }],
    ['a change the server does not have', { unsavedChanges: true }],
  ])('shows "saving" for %s', (_name, state) => {
    const { wrapper } = mountWith(state)
    expect(indicator(wrapper).attributes('data-state')).toBe('saving')
    expect(wrapper.find('.sr-only').text()).toBe('Saving your progress')
    expect(wrapper.find('svg').classes()).toContain('animate-pulse')
  })

  it('keeps "saving" for 800 ms after a save finishes, then shows "saved"', async () => {
    const { wrapper, store } = mountWith({ sync: { status: 'saving', error: null } })
    store.browserEphemeral.sync = { status: 'saved', error: null }
    await nextTick()
    expect(indicator(wrapper).attributes('data-state')).toBe('saving')
    vi.advanceTimersByTime(799)
    await nextTick()
    expect(indicator(wrapper).attributes('data-state')).toBe('saving')
    vi.advanceTimersByTime(1)
    await nextTick()
    expect(indicator(wrapper).attributes('data-state')).toBe('saved')
  })

  it('starts the 800 ms again when another save begins during the hold', async () => {
    const { wrapper, store } = mountWith({ sync: { status: 'saving', error: null } })
    store.browserEphemeral.sync = { status: 'saved', error: null }
    await nextTick()
    vi.advanceTimersByTime(500)
    store.browserEphemeral.sync = { status: 'saving', error: null }
    await nextTick()
    store.browserEphemeral.sync = { status: 'saved', error: null }
    await nextTick()
    vi.advanceTimersByTime(500)
    await nextTick()
    expect(indicator(wrapper).attributes('data-state')).toBe('saving')
    vi.advanceTimersByTime(300)
    await nextTick()
    expect(indicator(wrapper).attributes('data-state')).toBe('saved')
  })

  it('shows "offline" at once, without the hold', async () => {
    const { wrapper, store } = mountWith({ sync: { status: 'saving', error: null } })
    store.browserEphemeral.sync = { status: 'offline', error: null }
    await nextTick()
    expect(indicator(wrapper).attributes('data-state')).toBe('offline')
    expect(indicator(wrapper).attributes('title')).toContain('No connection')
  })

  it('shows "retrying" when a save failed and will be tried again', () => {
    const { wrapper } = mountWith({ sync: { status: 'error', error: { kind: 'retrying', message: 'x' } } })
    expect(indicator(wrapper).attributes('data-state')).toBe('retrying')
    expect(indicator(wrapper).attributes('title')).toContain('will be tried again')
  })

  it.each(['oversize', 'limit', 'refused'])('shows "stopped" when saving stopped (%s)', (kind) => {
    const { wrapper } = mountWith({ sync: { status: 'error', error: { kind, message: 'x' } } })
    expect(indicator(wrapper).attributes('data-state')).toBe('stopped')
    expect(indicator(wrapper).attributes('title')).toContain('is not being saved')
  })

  it('clears its timer when it is removed', async () => {
    const { wrapper, store } = mountWith({ sync: { status: 'saving', error: null } })
    store.browserEphemeral.sync = { status: 'saved', error: null }
    await nextTick()
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
