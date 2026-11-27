/**
 * The dev tools' settings panel (DevConfigPanel) and the device picker
 * (ResponsiveDeviceSelect).
 *
 * reka-ui's Select does not open in happy-dom, so a choice is made by
 * emitting update:modelValue on the Select component.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { nextTick } from 'vue'
import DevConfigPanel from '../../src/runtime/components/dev/menu/DevConfigPanel.vue'
import ResponsiveDeviceSelect from '../../src/runtime/components/dev/menu/ResponsiveDeviceSelect.vue'
import { devicePresets } from '../../src/runtime/components/dev/devicePresets.js'
import { initDev } from '../../src/runtime/stores/smilestore'
import { devApi, setupDev, mountComponent } from './mountDev'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))
fake.api = devApi

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/**
 * Mounts a component on a new store.
 * @param {object} component - The component
 * @param {(store: object) => void} [setup] - Sets store state
 * @returns {{ wrapper: object, store: object, api: object }} The wrapper, the store and the fake API
 */
function mountDev(component, setup) {
  const { pinia, store, api } = setupDev({ setup })
  const wrapper = mountComponent(component, { pinia })
  return { wrapper, store, api }
}
const selects = wrapper => wrapper.findAllComponents({ name: 'Select' })

/**
 * Chooses a value in a Select.
 * @param {object} select - The Select's wrapper
 * @param {string} value - The value to choose
 */
async function choose(select, value) {
  select.vm.$emit('update:modelValue', value)
  await nextTick()
}

describe('ResponsiveDeviceSelect', () => {
  it('shows the device in the store', () => {
    const { wrapper } = mountDev(ResponsiveDeviceSelect, (s) => {
      s.dev.selectedDevice = 'iphone-se'
    })
    expect(selects(wrapper)[0].props('modelValue')).toBe('iphone-se')
  })

  it.each(Object.keys(devicePresets))('choosing %s sets its width and height', async (key) => {
    const { wrapper, store } = mountDev(ResponsiveDeviceSelect)
    await choose(selects(wrapper)[0], key)
    expect(store.dev.selectedDevice).toBe(key)
    expect(store.dev.deviceWidth).toBe(devicePresets[key].width)
    expect(store.dev.deviceHeight).toBe(devicePresets[key].height)
  })

  it('choosing a custom size keeps the width and height', async () => {
    const { wrapper, store } = mountDev(ResponsiveDeviceSelect, (s) => {
      s.dev.deviceWidth = 555
      s.dev.deviceHeight = 444
    })
    await choose(selects(wrapper)[0], 'custom')
    expect(store.dev.selectedDevice).toBe('custom')
    expect(store.dev.deviceWidth).toBe(555)
    expect(store.dev.deviceHeight).toBe(444)
  })

  it('a choice is not written to the browser console', async () => {
    const logged = vi.spyOn(console, 'log')
    const { wrapper } = mountDev(ResponsiveDeviceSelect)
    await choose(selects(wrapper)[0], Object.keys(devicePresets)[0])
    await choose(selects(wrapper)[0], 'no-such-device')
    expect(logged).not.toHaveBeenCalled()
  })

  it('a value that is not a preset keeps the width and height', async () => {
    const { wrapper, store } = mountDev(ResponsiveDeviceSelect)
    await choose(selects(wrapper)[0], 'no-such-device')
    expect(store.dev.deviceWidth).toBe(initDev.deviceWidth)
    expect(store.dev.deviceHeight).toBe(initDev.deviceHeight)
  })
})

describe('DevConfigPanel', () => {
  // The panel's selects, in order
  const PALETTE = 0, MODE = 1, SIDE_TAB = 2, CONSOLE_TAB = 3, DEVICE = 4
  const toggle = (wrapper, id) => wrapper.find(`#${id}`)
  const button = (wrapper, text) => wrapper.findAll('button').find(b => b.text() === text)

  it('shows the current palette and sets the one chosen', async () => {
    const { wrapper, store } = mountDev(DevConfigPanel, (s) => {
      s.dev.devPalette = 'nord'
    })
    expect(selects(wrapper)[PALETTE].props('modelValue')).toBe('nord')
    await choose(selects(wrapper)[PALETTE], 'solarized')
    expect(store.dev.devPalette).toBe('solarized')
  })

  it('shows the default palette for a stored palette that no longer exists, and stores the default for an unknown choice', async () => {
    const { wrapper, store } = mountDev(DevConfigPanel, (s) => {
      s.dev.devPalette = 'gone'
    })
    expect(selects(wrapper)[PALETTE].props('modelValue')).toBe('default')
    await choose(selects(wrapper)[PALETTE], 'also-gone')
    expect(store.dev.devPalette).toBe('default')
  })

  it('sets the dev tools\' mode, and leaves the experiment\'s alone', async () => {
    const { wrapper, store } = mountDev(DevConfigPanel)
    expect(selects(wrapper)[MODE].props('modelValue')).toBe('auto')
    await choose(selects(wrapper)[MODE], 'dark')
    expect(store.dev.globalColorMode).toBe('dark')
    expect(store.dev.experimentColorMode).toBeNull()
  })

  it('sets the side panel\'s and the console\'s tab', async () => {
    const { wrapper, store } = mountDev(DevConfigPanel)
    await choose(selects(wrapper)[SIDE_TAB], 'db')
    expect(store.dev.sideBarTab).toBe('db')
    expect(store.dev.consoleBarTab).toBe('browse')
    await choose(selects(wrapper)[CONSOLE_TAB], 'log')
    expect(store.dev.consoleBarTab).toBe('log')
  })

  it('the switches show and hide the side panel and the console, and turn full screen on and off', async () => {
    const { wrapper, store } = mountDev(DevConfigPanel)
    for (const [id, key] of [['sd-show-sidebar', 'showSideBar'], ['sd-show-console', 'showConsoleBar'], ['sd-fullscreen', 'isFullscreen']]) {
      expect(toggle(wrapper, id).attributes('aria-checked')).toBe('false')
      await toggle(wrapper, id).trigger('click')
      expect(store.dev[key], key).toBe(true)
      expect(toggle(wrapper, id).attributes('aria-checked')).toBe('true')
      await toggle(wrapper, id).trigger('click')
      expect(store.dev[key], key).toBe(false)
    }
  })

  it('the device picker sets the preview\'s size', async () => {
    const { wrapper, store } = mountDev(DevConfigPanel)
    await choose(selects(wrapper)[DEVICE], 'iphone')
    expect(store.dev.deviceWidth).toBe(393)
    expect(store.dev.deviceHeight).toBe(852)
  })

  it('rotating swaps width and height, marks the button, and keeps the device', async () => {
    const { wrapper, store } = mountDev(DevConfigPanel)
    const rotate = wrapper.find('button[title="Rotate device"]')
    expect(rotate.find('svg').classes()).not.toContain('text-sd-link')

    await rotate.trigger('click')
    expect([store.dev.deviceWidth, store.dev.deviceHeight]).toEqual([768, 1024])
    expect(store.dev.isRotated).toBe(true)
    expect(store.dev.selectedDevice).toBe('desktop2')
    expect(rotate.find('svg').classes()).toContain('text-sd-link')

    await rotate.trigger('click')
    expect([store.dev.deviceWidth, store.dev.deviceHeight]).toEqual([1024, 768])
    expect(store.dev.isRotated).toBe(false)
  })

  it('rotating a size that is no preset makes the device custom', async () => {
    const { wrapper, store } = mountDev(DevConfigPanel, (s) => {
      s.dev.deviceWidth = 501
      s.dev.deviceHeight = 702
    })
    await wrapper.find('button[title="Rotate device"]').trigger('click')
    expect([store.dev.deviceWidth, store.dev.deviceHeight]).toEqual([702, 501])
    expect(store.dev.selectedDevice).toBe('custom')
  })

  it('reset puts every dev setting back to its default, removes the old stored copy and reloads', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { reload, pathname: '/dev/', href: 'http://localhost/dev/' })
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem')
    const { wrapper, store, api } = mountDev(DevConfigPanel, (s) => {
      Object.assign(s.dev, {
        showSideBar: true, showConsoleBar: true, pinnedRoute: 'task', mainView: 'config', sideBarTab: 'db',
        consoleBarTab: 'log', selectedDevice: 'iphone', deviceWidth: 393, deviceHeight: 852, isRotated: true,
        isFullscreen: true, globalColorMode: 'dark', devPalette: 'nord', experimentColorMode: 'dark',
        docsPage: 'coding/steps.md',
      })
    })
    api.config.devLocalStorageKey = 'smile_test_dev'

    await button(wrapper, 'Reset to defaults').trigger('click')
    expect(store.dev).toMatchObject(initDev)
    expect(removeItem).toHaveBeenCalledWith('smile_test_dev')
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
