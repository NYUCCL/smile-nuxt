import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { h, nextTick } from 'vue'
import { useRoute } from '#imports'
import ExperimentStatusBar from '../../src/runtime/components/builtins/ExperimentStatusBar.vue'
import { statusBarHeight } from '../../src/runtime/composables/useWindowSizer'
import { createStore, createFakeApi, mountComponent } from './mount'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))

// The bar itself has its own tests; here it is a box with a known height
const StatusBar = { render: () => h('div', { id: 'the-bar' }, 'BAR') }

/**
 * Mounts the status bar's wrapper on a route.
 * @param {string} routeName - The view's name in the timeline
 * @param {string} [path] - The address
 * @returns {object} The wrapper
 */
function mountBar(routeName, path = `/${routeName}`) {
  const { pinia, store } = createStore()
  fake.api = createFakeApi(store, { currentRouteName: vi.fn(() => routeName) })
  vi.mocked(useRoute).mockReturnValue({ path, name: routeName, query: {}, params: {} })
  return mountComponent(ExperimentStatusBar, { pinia, stubs: { StatusBar } })
}

describe('ExperimentStatusBar', () => {
  let observers
  let height
  beforeEach(() => {
    statusBarHeight.value = 0
    height = 47.2
    observers = []
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height }))
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) {
        this.callback = callback
        this.observe = vi.fn()
        this.disconnect = vi.fn()
        observers.push(this)
      }
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows the status bar on a view of the study', () => {
    expect(mountBar('consent').find('#the-bar').exists()).toBe(true)
  })

  it.each([
    ['the recruitment page', 'recruit', '/'],
    ['the presentation home page', 'presentation_home', '/home'],
    ['a view in presentation mode', 'consent', '/presentation/consent'],
    ['the presentation address itself', 'welcome', '/presentation'],
  ])('shows no status bar on %s', (_what, routeName, path) => {
    expect(mountBar(routeName, path).find('#the-bar').exists()).toBe(false)
  })

  it('shows the bar on an address that only starts with the word presentation', () => {
    expect(mountBar('presentation_notes', '/presentation_notes').find('#the-bar').exists()).toBe(true)
  })

  it('reports the bar\'s height, rounded up, for the window sizer', async () => {
    mountBar('consent')
    await nextTick()
    expect(statusBarHeight.value).toBe(48)
  })

  it('reports the new height when the bar changes size', async () => {
    mountBar('consent')
    await nextTick()
    expect(observers).toHaveLength(1)
    expect(observers[0].observe).toHaveBeenCalledTimes(1)
    height = 80
    observers[0].callback()
    expect(statusBarHeight.value).toBe(80)
  })

  it('measures nothing on a view with no bar', async () => {
    mountBar('recruit', '/')
    await nextTick()
    expect(observers).toHaveLength(0)
    expect(statusBarHeight.value).toBe(0)
  })

  it('reports no height once the study moves to a view with no bar', async () => {
    const wrapper = mountBar('consent')
    await nextTick()
    expect(statusBarHeight.value).toBe(48)
    fake.api.currentRouteName = vi.fn(() => 'recruit')
    await nextTick()
    await nextTick()
    expect(wrapper.find('#the-bar').exists()).toBe(false)
    expect(observers[0].disconnect).toHaveBeenCalled()
    expect(statusBarHeight.value).toBe(0)
  })

  it('reports no height and stops watching the size once it is gone', async () => {
    const wrapper = mountBar('consent')
    await nextTick()
    wrapper.unmount()
    expect(observers[0].disconnect).toHaveBeenCalled()
    expect(statusBarHeight.value).toBe(0)
  })

  it('measures once where the browser has no ResizeObserver', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    mountBar('consent')
    await nextTick()
    expect(statusBarHeight.value).toBe(48)
    expect(observers).toHaveLength(0)
  })
})
