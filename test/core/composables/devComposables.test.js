/**
 * @fileoverview The small dev tools composables: the palette
 * (useDevPalette.js), the dev scope class for portaled content
 * (useDevScope.js), and the window size check (useWindowSizer.js).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h, reactive, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useHead } from '#imports'
import { DEV_PALETTES, normalizeDevPalette, useDevPalette, applyDevPalette } from '../../../src/runtime/composables/useDevPalette.js'
import { DEV_SCOPE, provideDevScope, useDevScopeClass } from '../../../src/runtime/composables/useDevScope.js'
import useWindowSizer, { statusBarHeight } from '../../../src/runtime/composables/useWindowSizer.js'

let api

vi.mock('#imports', () => ({ useHead: vi.fn() }))
vi.mock('../../../src/runtime/composables/useAPI', () => ({ default: () => api }))

describe('dev palette', () => {
  beforeEach(() => {
    vi.mocked(useHead).mockClear()
    api = { store: reactive({ dev: { devPalette: 'default' } }) }
  })

  it('the default palette is first, and every palette has a value and a label', () => {
    expect(DEV_PALETTES[0].value).toBe('default')
    for (const palette of DEV_PALETTES) {
      expect(typeof palette.value).toBe('string')
      expect(typeof palette.label).toBe('string')
    }
    expect(new Set(DEV_PALETTES.map(p => p.value)).size).toBe(DEV_PALETTES.length)
  })

  it('normalizeDevPalette keeps a palette that exists', () => {
    for (const { value } of DEV_PALETTES) expect(normalizeDevPalette(value)).toBe(value)
  })

  it('normalizeDevPalette turns anything else into the default', () => {
    for (const value of ['dracula', '', undefined, null, 3, 'NORD', {}]) {
      expect(normalizeDevPalette(value)).toBe('default')
    }
  })

  it('useDevPalette reads the dev setting', () => {
    api.store.dev.devPalette = 'nord'
    expect(useDevPalette().value).toBe('nord')
  })

  it('useDevPalette reads a stored value that no longer exists as the default', () => {
    api.store.dev.devPalette = 'removed-palette'
    expect(useDevPalette().value).toBe('default')
    api.store.dev.devPalette = undefined
    expect(useDevPalette().value).toBe('default')
  })

  it('useDevPalette writes the dev setting, and only palettes that exist', () => {
    const palette = useDevPalette()
    palette.value = 'solarized'
    expect(api.store.dev.devPalette).toBe('solarized')
    palette.value = 'not-a-palette'
    expect(api.store.dev.devPalette).toBe('default')
  })

  it('applyDevPalette puts the palette on <html> as data-sd-palette, live', () => {
    api.store.dev.devPalette = 'github'
    const palette = applyDevPalette()
    expect(useHead).toHaveBeenCalledTimes(1)
    const attrs = vi.mocked(useHead).mock.calls[0][0].htmlAttrs
    expect(attrs['data-sd-palette']).toBe(palette)
    expect(attrs['data-sd-palette'].value).toBe('github')
    api.store.dev.devPalette = 'london'
    expect(attrs['data-sd-palette'].value).toBe('london')
  })
})

describe('dev scope', () => {
  const Child = defineComponent({
    setup() {
      return { cls: useDevScopeClass() }
    },
    render() {
      return h('span', { class: this.cls })
    },
  })
  const parent = provideArgs => defineComponent({
    setup() {
      if (provideArgs) provideDevScope(...provideArgs)
    },
    render() {
      return h(Child)
    },
  })

  it('is "sd-root" under a component that marked its subtree', () => {
    expect(mount(parent([])).find('span').classes()).toEqual(['sd-root'])
  })

  it('is empty outside the dev tools', () => {
    expect(mount(parent(null)).find('span').classes()).toEqual([])
  })

  it('is empty under a subtree marked false (the experiment preview inside the dev tools)', () => {
    expect(mount(parent([false])).find('span').classes()).toEqual([])
  })

  it('uses a symbol as the injection key', () => {
    expect(typeof DEV_SCOPE).toBe('symbol')
  })
})

describe('window sizer', () => {
  let wrapper

  const Host = options => defineComponent({
    setup() {
      return useWindowSizer(options)
    },
    render() {
      return h('div', String(this.showAggressiveOverlay))
    },
  })

  function setWindow(width, height) {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(width)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(height)
  }

  beforeEach(() => {
    statusBarHeight.value = 0
    api = {
      store: reactive({
        dev: { deviceWidth: 400, deviceHeight: 300 },
        browserEphemeral: { tooSmall: null },
      }),
      // Too small below 800 x 600
      isBrowserTooSmall: vi.fn((width, height) => width < 800 || height < 600),
    }
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
    statusBarHeight.value = 0
  })

  it('checks the browser window and writes the result to the store', () => {
    setWindow(1024, 768)
    wrapper = mount(Host())
    expect(wrapper.text()).toBe('false')
    expect(api.isBrowserTooSmall).toHaveBeenLastCalledWith(1024, 768)
    expect(api.store.browserEphemeral.tooSmall).toBe(false)
  })

  it('reports a window that is too small', () => {
    setWindow(640, 768)
    wrapper = mount(Host())
    expect(wrapper.text()).toBe('true')
    expect(api.store.browserEphemeral.tooSmall).toBe(true)
  })

  it('updates when the window is resized', async () => {
    setWindow(1024, 768)
    wrapper = mount(Host())
    expect(wrapper.text()).toBe('false')
    setWindow(500, 768)
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(wrapper.text()).toBe('true')
    expect(api.store.browserEphemeral.tooSmall).toBe(true)
  })

  it('subtracts the status bar\'s height from the height available', async () => {
    setWindow(1024, 620)
    wrapper = mount(Host())
    expect(wrapper.text()).toBe('false')
    statusBarHeight.value = 40
    await nextTick()
    expect(api.isBrowserTooSmall).toHaveBeenLastCalledWith(1024, 580)
    expect(wrapper.text()).toBe('true')
  })

  it('with useDeviceContainer, checks the dev tools\' device size instead of the window', async () => {
    setWindow(1920, 1080)
    wrapper = mount(Host({ useDeviceContainer: true }))
    expect(api.isBrowserTooSmall).toHaveBeenLastCalledWith(400, 300)
    expect(wrapper.text()).toBe('true')
    api.store.dev.deviceWidth = 1024
    api.store.dev.deviceHeight = 768
    await nextTick()
    expect(api.isBrowserTooSmall).toHaveBeenLastCalledWith(1024, 768)
    expect(wrapper.text()).toBe('false')
  })

  it('stops listening for resizes when the component is unmounted', () => {
    setWindow(1024, 768)
    const remove = vi.spyOn(window, 'removeEventListener')
    wrapper = mount(Host())
    wrapper.unmount()
    wrapper = null
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
    const calls = api.isBrowserTooSmall.mock.calls.length
    setWindow(100, 100)
    window.dispatchEvent(new Event('resize'))
    expect(api.isBrowserTooSmall.mock.calls.length).toBe(calls)
  })
})
