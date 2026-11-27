import { describe, it, expect, vi, afterEach } from 'vitest'
import { nextTick } from 'vue'
import LocalDevBanner from '../../src/runtime/components/builtins/LocalDevBanner.vue'
import { setFlags, resetFlags } from '../setup/flags'
import { createStore, createFakeApi, mountComponent } from './mount'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))

/**
 * Mounts the banner.
 * @returns {{ wrapper: object, store: object }} The wrapper and the store
 */
function mountBanner() {
  const { pinia, store } = createStore()
  fake.api = createFakeApi(store, { resetLocalState: vi.fn() })
  return { wrapper: mountComponent(LocalDevBanner, { pinia }), store }
}

describe('LocalDevBanner', () => {
  const originalLocation = window.location
  afterEach(() => {
    resetFlags()
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true })
  })

  it('shows nothing outside the dev server', () => {
    expect(mountBanner().wrapper.find('.sd-local-pill').exists()).toBe(false)
  })

  it('shows the local tag with its two buttons on the dev server', () => {
    setFlags({ dev: true })
    const { wrapper } = mountBanner()
    expect(wrapper.find('.sd-local-pill-tag').text()).toBe('local')
    expect(wrapper.find('button').text()).toBe('Zap')
    expect(wrapper.find('a').text()).toBe('Developer mode')
    expect(wrapper.find('a').attributes('href')).toBe('/dev/')
  })

  it('zap resets the local state', async () => {
    setFlags({ dev: true })
    const { wrapper } = mountBanner()
    await wrapper.find('button').trigger('click')
    expect(fake.api.resetLocalState).toHaveBeenCalledTimes(1)
  })

  it('the developer mode link picks developer mode before it loads /dev/', async () => {
    setFlags({ dev: true })
    Object.defineProperty(window, 'location', { value: { href: 'http://localhost/' }, writable: true, configurable: true })
    const { wrapper, store } = mountBanner()
    store.dev.mainView = 'presentation'
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    wrapper.find('a').element.dispatchEvent(click)
    // The link's own navigation is stopped, and the view is set first
    expect(click.defaultPrevented).toBe(true)
    expect(store.dev.mainView).toBe('devmode')
    expect(window.location.href).toBe('http://localhost/')
    await nextTick()
    expect(window.location.href).toBe('/dev/')
  })
})
