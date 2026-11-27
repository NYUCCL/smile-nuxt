/**
 * The device preview around the experiment in developer mode
 * (ResponsiveDeviceContainer) and the dev tools' number field
 * (DevNumberInput).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { Moon, Sun, SunMoon } from 'lucide-vue-next'
import ResponsiveDeviceContainer from '../../src/runtime/components/dev/ResponsiveDeviceContainer.vue'
import DevNumberInput from '../../src/runtime/components/dev/DevNumberInput.vue'
import { devApi, setupDev, mountComponent, openStubs } from './mountDev'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))
fake.api = devApi

// The measured size of the full screen area, set by a test (happy-dom does no layout)
const size = await vi.hoisted(async () => {
  const { ref } = await import('vue')
  return { width: ref(0), height: ref(0) }
})
vi.mock('@vueuse/core', async original => ({ ...(await original()), useElementSize: () => size }))

describe('ResponsiveDeviceContainer', () => {
  let wrapper
  beforeEach(() => {
    size.width.value = 0
    size.height.value = 0
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
  })

  /**
   * Mounts the container around a stand-in for the experiment.
   * @param {object} [options] - `setup` and `api` (see setupDev)
   * @returns {{ store: object, api: object }} The store and the fake API
   */
  function mountContainer({ setup, api: overrides } = {}) {
    const { pinia, store, api } = setupDev({ setup, api: overrides })
    wrapper = mountComponent(ResponsiveDeviceContainer, {
      pinia,
      stubs: openStubs,
      slots: { default: '<div data-testid="experiment">the experiment</div>' },
      attachTo: document.body,
    })
    return { store, api }
  }
  // The three buttons with a tooltip (the device picker's own button is not one)
  const controls = () => wrapper.findAll('.device-controls button[data-slot="tooltip-trigger"]')
  const tooltips = () => wrapper.findAll('[data-testid="tooltip"]').map(t => t.text())
  const controlFor = text => controls()[tooltips().findIndex(t => t.startsWith(text))]

  /**
   * Drags a resize handle.
   * @param {string} side - left, right or bottom
   * @param {number} dx - Pixels moved to the right
   * @param {number} dy - Pixels moved down
   * @param {boolean} [release] - Whether to let go of the mouse at the end
   */
  async function drag(side, dx, dy, release = true) {
    await wrapper.find(`.resize-handle-${side}`).trigger('mousedown', { clientX: 100, clientY: 100 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 + dx, clientY: 100 + dy }))
    if (release) document.dispatchEvent(new MouseEvent('mouseup'))
    await nextTick()
  }

  describe('the device preview', () => {
    it('shows the experiment in a frame of the device\'s size', () => {
      mountContainer()
      expect(wrapper.find('.device-container [data-testid="experiment"]').exists()).toBe(true)
      expect(wrapper.find('.device-dimensions').text()).toBe('1024 x 768')
      const style = wrapper.find('.device-container-wrapper').attributes('style')
      expect(style).toContain('--device-width: 1024px')
      expect(style).toContain('--device-height: 768px')
    })

    it('takes the size from the selected device when the store has none', () => {
      const { store } = mountContainer({ setup: (s) => {
        s.dev.selectedDevice = 'iphone'
        s.dev.deviceWidth = 0
        s.dev.deviceHeight = 0
      } })
      expect([store.dev.deviceWidth, store.dev.deviceHeight]).toEqual([393, 852])
    })

    it('falls back to 800 x 600 when the store has no size and the device is not a preset', () => {
      const { store } = mountContainer({ setup: (s) => {
        s.dev.selectedDevice = 'custom'
        s.dev.deviceWidth = null
        s.dev.deviceHeight = null
      } })
      expect([store.dev.deviceWidth, store.dev.deviceHeight]).toEqual([800, 600])
    })

    it('the rotate button swaps width and height and is marked while rotated', async () => {
      const { store } = mountContainer()
      const rotate = controlFor('Rotate device')
      await rotate.trigger('click')
      expect(wrapper.find('.device-dimensions').text()).toBe('768 x 1024')
      expect(store.dev.isRotated).toBe(true)
      expect(store.dev.selectedDevice).toBe('desktop2')
      expect(rotate.find('svg').classes()).toContain('text-sd-link')
      await rotate.trigger('click')
      expect(wrapper.find('.device-dimensions').text()).toBe('1024 x 768')
      expect(store.dev.isRotated).toBe(false)
    })

    it('the device picker sets the size', async () => {
      const { store } = mountContainer()
      wrapper.findComponent({ name: 'Select' }).vm.$emit('update:modelValue', 'ipad-11')
      await nextTick()
      expect(store.dev.selectedDevice).toBe('ipad-11')
      expect(wrapper.find('.device-dimensions').text()).toBe('1180 x 820')
    })

    it('the color mode button goes light → dark → system for the experiment', async () => {
      const { store } = mountContainer({ setup: (s) => {
        s.dev.experimentColorMode = 'light'
      } })
      const button = controlFor('Switch to')
      expect(button.findComponent(Moon).exists()).toBe(true)
      expect(wrapper.find('.device-wrapper').classes()).toContain('light')

      await button.trigger('click')
      expect(store.dev.experimentColorMode).toBe('dark')
      expect(button.findComponent(SunMoon).exists()).toBe(true)
      expect(tooltips().some(t => /^Switch to System \((?:light|dark)\)$/.test(t))).toBe(true)
      expect(wrapper.find('.device-wrapper').classes()).toContain('dark')

      await button.trigger('click')
      expect(store.dev.experimentColorMode).toBe('auto')
      expect(button.findComponent(Sun).exists()).toBe(true)
      expect(tooltips()).toContain('Switch to Light Mode')
      expect(store.dev.globalColorMode).toBe('auto')
    })

    it('the full screen button removes the frame and the controls', async () => {
      const { store } = mountContainer()
      await controlFor('Fullscreen Mode').trigger('click')
      expect(store.dev.isFullscreen).toBe(true)
      expect(wrapper.find('.device-controls').exists()).toBe(false)
      expect(wrapper.find('.fullscreen-container [data-testid="experiment"]').exists()).toBe(true)
    })
  })

  describe('resizing', () => {
    it('dragging the right handle widens the frame and makes the device custom', async () => {
      const { store } = mountContainer()
      await drag('right', 76, 30)
      expect([store.dev.deviceWidth, store.dev.deviceHeight]).toEqual([1100, 768])
      expect(store.dev.selectedDevice).toBe('custom')
    })

    it('dragging the left handle to the left widens the frame', async () => {
      const { store } = mountContainer()
      await drag('left', -50, 0)
      expect(store.dev.deviceWidth).toBe(1074)
    })

    it('dragging the bottom handle changes the height only', async () => {
      const { store } = mountContainer()
      await drag('bottom', 40, 32)
      expect([store.dev.deviceWidth, store.dev.deviceHeight]).toEqual([1024, 800])
    })

    it('the frame is never narrower than 200 or shorter than 400', async () => {
      const { store } = mountContainer()
      await drag('right', -5000, 0)
      expect(store.dev.deviceWidth).toBe(200)
      await drag('left', 5000, 0)
      expect(store.dev.deviceWidth).toBe(200)
      await drag('bottom', 0, -5000)
      expect(store.dev.deviceHeight).toBe(400)
    })

    it('the device is custom during a drag, and a preset again when the size at release is one', async () => {
      const { store } = mountContainer({ setup: (s) => {
        s.dev.deviceWidth = 1000
      } })
      await drag('right', 24, 0, false)
      expect(store.dev.selectedDevice).toBe('custom')
      document.dispatchEvent(new MouseEvent('mouseup'))
      expect(store.dev.selectedDevice).toBe('desktop2')
    })

    it('a size that is a preset turned on its side selects that preset', async () => {
      const { store } = mountContainer({ setup: (s) => {
        s.dev.deviceWidth = 800
        s.dev.deviceHeight = 393
      } })
      await drag('right', 52, 0)
      expect([store.dev.deviceWidth, store.dev.deviceHeight]).toEqual([852, 393])
      expect(store.dev.selectedDevice).toBe('iphone')
    })

    it('moving the mouse after the release, or without a drag, changes nothing', async () => {
      const { store } = mountContainer()
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 900, clientY: 900 }))
      await drag('right', 10, 0)
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 900, clientY: 900 }))
      expect([store.dev.deviceWidth, store.dev.deviceHeight]).toEqual([1034, 768])
    })
  })

  describe('full screen', () => {
    const fullscreen = (s) => {
      s.dev.isFullscreen = true
    }

    it('shows the experiment with no frame, in the experiment\'s color mode', () => {
      mountContainer({ setup: (s) => {
        fullscreen(s)
        s.dev.experimentColorMode = 'dark'
        s.dev.globalColorMode = 'light'
      } })
      const container = wrapper.find('.fullscreen-container')
      expect(container.find('[data-testid="experiment"]').exists()).toBe(true)
      expect(container.classes()).toContain('dark')
      expect(wrapper.find('.resize-handle').exists()).toBe(false)
    })

    it('stores the measured size of the area as the device\'s size', async () => {
      const { store } = mountContainer({ setup: fullscreen })
      size.width.value = 1311.6
      size.height.value = 702.2
      await nextTick()
      expect([store.dev.deviceWidth, store.dev.deviceHeight]).toEqual([1312, 702])
    })

    it('ignores a measured size of zero', async () => {
      const { store } = mountContainer({ setup: fullscreen })
      size.width.value = 500
      await nextTick()
      expect([store.dev.deviceWidth, store.dev.deviceHeight]).toEqual([1024, 768])
    })

    it('does not store the measured size while the device preview shows', async () => {
      const { store } = mountContainer()
      size.width.value = 1300
      size.height.value = 700
      await nextTick()
      expect([store.dev.deviceWidth, store.dev.deviceHeight]).toEqual([1024, 768])
    })
  })

  describe('pages that are not views of the experiment', () => {
    it.each(['recruit', 'landing', undefined])('shows no frame on %s', (name) => {
      mountContainer({ api: { currentRouteName: vi.fn(() => name), currentViewName: vi.fn(() => name) } })
      expect(wrapper.find('.fullscreen-container [data-testid="experiment"]').exists()).toBe(true)
      expect(wrapper.find('.device-controls').exists()).toBe(false)
    })

    it('the recruitment chooser wears the dev tools\' mode, not the experiment\'s', () => {
      mountContainer({
        setup: (s) => {
          s.dev.experimentColorMode = 'dark'
          s.dev.globalColorMode = 'light'
        },
        api: { currentRouteName: vi.fn(() => 'recruit'), currentViewName: vi.fn(() => 'recruit') },
      })
      expect(wrapper.find('.fullscreen-container').classes()).toContain('light')
      expect(wrapper.find('.fullscreen-container').classes()).not.toContain('dark')
    })
  })
})

describe('DevNumberInput', () => {
  /**
   * Mounts the field with a v-model.
   * @param {object} [props] - modelValue, step, min, label
   * @returns {object} The wrapper
   */
  function mountInput(props = {}) {
    const wrapper = mountComponent(DevNumberInput, {
      props: { 'modelValue': 5, 'onUpdate:modelValue': value => wrapper.setProps({ modelValue: value }), ...props },
    })
    return wrapper
  }
  const up = wrapper => wrapper.findAll('button')[0]
  const down = wrapper => wrapper.findAll('button')[1]
  const last = wrapper => wrapper.emitted('update:modelValue').at(-1)[0]

  it('shows the value', () => {
    expect(mountInput({ modelValue: 12 }).find('input').element.value).toBe('12')
  })

  it('the up and down buttons add and take away one step', async () => {
    const wrapper = mountInput({ step: 5 })
    await up(wrapper).trigger('click')
    expect(last(wrapper)).toBe(10)
    await down(wrapper).trigger('click')
    await down(wrapper).trigger('click')
    expect(last(wrapper)).toBe(0)
  })

  it('does not go below the minimum', async () => {
    const wrapper = mountInput({ modelValue: 3, step: 2, min: 2 })
    await down(wrapper).trigger('click')
    expect(last(wrapper)).toBe(2)
    await down(wrapper).trigger('click')
    expect(last(wrapper)).toBe(2)
  })

  it('counts an empty or non-numeric value as zero', async () => {
    const wrapper = mountInput({ modelValue: '' })
    await up(wrapper).trigger('click')
    expect(last(wrapper)).toBe(1)
    const text = mountInput({ modelValue: 'abc', min: -10 })
    await down(text).trigger('click')
    expect(last(text)).toBe(-1)
  })

  it('a typed value is emitted as a number', async () => {
    const wrapper = mountInput()
    await wrapper.find('input').setValue('42')
    expect(last(wrapper)).toBe(42)
  })

  it('passes step and min to the field', () => {
    const input = mountInput({ step: 10, min: 20 }).find('input')
    expect(input.attributes('step')).toBe('10')
    expect(input.attributes('min')).toBe('20')
  })

  it('names the field and its buttons after the label', () => {
    const wrapper = mountInput({ label: 'trials' })
    expect(wrapper.find('input').attributes('aria-label')).toBe('trials')
    expect(up(wrapper).attributes('aria-label')).toBe('Increase trials')
    expect(down(wrapper).attributes('aria-label')).toBe('Decrease trials')
  })

  it('without a label, the field has no name and the buttons say Increase and Decrease', () => {
    const wrapper = mountInput()
    expect(wrapper.find('input').attributes('aria-label')).toBeUndefined()
    expect(up(wrapper).attributes('aria-label')).toBe('Increase')
    expect(down(wrapper).attributes('aria-label')).toBe('Decrease')
  })
})
