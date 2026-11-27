import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { animate } from 'motion'
import AdvertisementView from '../../src/runtime/components/builtins/AdvertisementView.vue'
import { createStore, createFakeApi, mountComponent } from './mount'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useViewAPI', async original => ({ ...(await original()), default: () => fake.api }))
// The wiggle: an animation that is finished at once
vi.mock('motion', () => ({ animate: vi.fn(() => ({ finished: Promise.resolve() })) }))

/**
 * Mounts the advertisement view.
 * @param {object} [options] - What to change
 * @param {object} [options.props] - The view's props
 * @param {object} [options.config] - Config values
 * @returns {object} The wrapper
 */
function mountAd({ props, config = {} } = {}) {
  const { pinia, store } = createStore()
  fake.api = createFakeApi(store, { preloadAllImages: vi.fn(), preloadAllVideos: vi.fn() })
  Object.assign(fake.api.config, {
    windowsizerRequest: { width: 800, height: 600 },
    advertisementImageFn: '/img/helpus.png',
    advertisementImageInvertDark: false,
  }, config)
  return mountComponent(AdvertisementView, { pinia, props })
}

describe('AdvertisementView', () => {
  let wrapper
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(animate).mockClear()
  })
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
  })

  it('shows the advertisement image from the config, 320 wide unless told otherwise', () => {
    wrapper = mountAd()
    expect(wrapper.find('img').attributes('src')).toBe('/img/helpus.png')
    expect(wrapper.find('img').attributes('width')).toBe('320')
    expect(wrapper.find('img').classes()).not.toContain('dark-aware-img')
    wrapper.unmount()
    wrapper = mountAd({ props: { imageWidth: 100 }, config: { advertisementImageInvertDark: true } })
    expect(wrapper.find('img').attributes('width')).toBe('100')
    expect(wrapper.find('img').classes()).toContain('dark-aware-img')
  })

  it('the button starts loading the images and videos and goes to the next view', async () => {
    wrapper = mountAd()
    await wrapper.find('#begintask').trigger('click')
    expect(fake.api.preloadAllImages).toHaveBeenCalledTimes(1)
    expect(fake.api.preloadAllVideos).toHaveBeenCalledTimes(1)
    expect(fake.api.goNextView).toHaveBeenCalledTimes(1)
  })

  it('wiggles the button after 3 seconds and then every 15 seconds', async () => {
    wrapper = mountAd()
    await vi.advanceTimersByTimeAsync(2999)
    expect(animate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(animate).toHaveBeenCalledTimes(1)
    expect(vi.mocked(animate).mock.calls[0][0]).toBe(wrapper.find('#begintask').element)
    await vi.advanceTimersByTimeAsync(15000)
    expect(animate).toHaveBeenCalledTimes(2)
  })

  it('stops wiggling once the button has been clicked', async () => {
    wrapper = mountAd()
    await wrapper.find('#begintask').trigger('click')
    await vi.advanceTimersByTimeAsync(20000)
    expect(animate).not.toHaveBeenCalled()
  })

  it('does not wiggle after the view is gone', async () => {
    wrapper = mountAd()
    wrapper.unmount()
    wrapper = null
    await vi.advanceTimersByTimeAsync(20000)
    expect(animate).not.toHaveBeenCalled()
  })
})
