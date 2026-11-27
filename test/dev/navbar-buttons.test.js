/**
 * The dev tools' nav bar buttons: the experiment's color mode, full screen,
 * reload, zap, the panel toggles, the step buttons, the mode label and the
 * shortcut notification.
 */
import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { Moon, Sun, SunMoon, Maximize, Minimize, SquareMinus, BugPlay } from 'lucide-vue-next'
import ColorModeButton from '../../src/runtime/components/dev/navbar/ColorModeButton.vue'
import FullScreenButton from '../../src/runtime/components/dev/navbar/FullScreenButton.vue'
import ReloadButton from '../../src/runtime/components/dev/navbar/ReloadButton.vue'
import ResetButton from '../../src/runtime/components/dev/navbar/ResetButton.vue'
import PanelButtonGroup from '../../src/runtime/components/dev/navbar/PanelButtonGroup.vue'
import StepInfoButtonGroup from '../../src/runtime/components/dev/navbar/StepInfoButtonGroup.vue'
import DevModeLabel from '../../src/runtime/components/dev/navbar/DevModeLabel.vue'
import KeyCommandNotification from '../../src/runtime/components/dev/navbar/KeyCommandNotification.vue'
import { devApi, setupDev, mountComponent, openStubs } from './mountDev'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))
vi.mock('../../src/runtime/composables/useViewAPI', async original => ({ ...(await original()), default: () => fake.api }))
fake.api = devApi

/**
 * Mounts a component on a new store.
 * @param {object} component - The component
 * @param {object} [options] - `setup`, `api` (see setupDev) and mount options
 * @returns {{ wrapper: object, store: object, api: object }} The wrapper, the store and the fake API
 */
function mountDev(component, { setup, api: overrides, ...rest } = {}) {
  const { pinia, store, api } = setupDev({ setup, api: overrides })
  const wrapper = mountComponent(component, { pinia, stubs: openStubs, ...rest })
  return { wrapper, store, api }
}
const tooltips = wrapper => wrapper.findAll('[data-testid="tooltip"]').map(t => t.text())

describe('ColorModeButton', () => {
  it('follows the experiment\'s own setting until a mode is picked', () => {
    const { wrapper } = mountDev(ColorModeButton, { setup: (s) => {
      s.config = { ...s.config, colorMode: 'dark' }
    } })
    expect(wrapper.findComponent(SunMoon).exists()).toBe(true)
    expect(tooltips(wrapper)[0]).toMatch(/^Switch to System \((?:light|dark)\)$/)
  })

  it('goes light → dark → system → light, one step a click', async () => {
    const { wrapper, store } = mountDev(ColorModeButton, { setup: (s) => {
      s.dev.experimentColorMode = 'light'
    } })
    expect(wrapper.findComponent(Moon).exists()).toBe(true)
    expect(tooltips(wrapper)).toEqual(['Switch to Dark Mode'])

    await wrapper.find('button').trigger('click')
    expect(store.dev.experimentColorMode).toBe('dark')
    expect(wrapper.findComponent(SunMoon).exists()).toBe(true)

    await wrapper.find('button').trigger('click')
    expect(store.dev.experimentColorMode).toBe('auto')
    expect(wrapper.findComponent(Sun).exists()).toBe(true)
    expect(tooltips(wrapper)).toEqual(['Switch to Light Mode'])

    await wrapper.find('button').trigger('click')
    expect(store.dev.experimentColorMode).toBe('light')
  })

  it('leaves the dev tools\' own mode alone', async () => {
    const { wrapper, store } = mountDev(ColorModeButton, { setup: (s) => {
      s.dev.experimentColorMode = 'light'
      s.dev.globalColorMode = 'auto'
    } })
    await wrapper.find('button').trigger('click')
    expect(store.dev.globalColorMode).toBe('auto')
  })
})

describe('FullScreenButton', () => {
  it('offers full screen while the device preview shows, and turns it on', async () => {
    const { wrapper, store } = mountDev(FullScreenButton)
    expect(wrapper.findComponent(Maximize).exists()).toBe(true)
    expect(tooltips(wrapper)).toEqual(['Fullscreen'])
    await wrapper.find('button').trigger('click')
    expect(store.dev.isFullscreen).toBe(true)
    expect(wrapper.findComponent(Minimize).exists()).toBe(true)
    expect(tooltips(wrapper)).toEqual(['Responsive Mode'])
  })

  it('goes back to the device preview from full screen', async () => {
    const { wrapper, store } = mountDev(FullScreenButton, { setup: (s) => {
      s.dev.isFullscreen = true
    } })
    await wrapper.find('button').trigger('click')
    expect(store.dev.isFullscreen).toBe(false)
  })
})

describe('ReloadButton and ResetButton', () => {
  it('the reload button reloads the browser and does not zap the state', async () => {
    const { wrapper, api } = mountDev(ReloadButton)
    expect(tooltips(wrapper)).toEqual(['Reload browser (Cmd + R)'])
    await wrapper.find('button').trigger('click')
    expect(api.reloadBrowser).toHaveBeenCalledTimes(1)
    expect(api.resetLocalState).not.toHaveBeenCalled()
  })

  it('the zap button resets the local state', async () => {
    const { wrapper, api } = mountDev(ResetButton)
    expect(tooltips(wrapper)).toEqual(['Zap local state (Ctrl + R)'])
    await wrapper.find('button').trigger('click')
    expect(api.resetLocalState).toHaveBeenCalledTimes(1)
    expect(api.reloadBrowser).not.toHaveBeenCalled()
  })
})

describe('PanelButtonGroup', () => {
  it('the first button shows and hides the console', async () => {
    const { wrapper, store } = mountDev(PanelButtonGroup)
    const [consoleButton] = wrapper.findAll('button')
    expect(tooltips(wrapper)[0]).toBe('Show Console (Ctrl + `)')
    expect(consoleButton.find('svg').attributes('opacity')).toBe('0.4')

    await consoleButton.trigger('click')
    expect(store.dev.showConsoleBar).toBe(true)
    expect(store.dev.showSideBar).toBe(false)
    expect(tooltips(wrapper)[0]).toBe('Hide Console (Ctrl + `)')
    expect(consoleButton.find('svg').attributes('opacity')).toBe('1')

    await consoleButton.trigger('click')
    expect(store.dev.showConsoleBar).toBe(false)
  })

  it('the second button shows and hides the sidebar', async () => {
    const { wrapper, store } = mountDev(PanelButtonGroup)
    const sideButton = wrapper.findAll('button')[1]
    expect(tooltips(wrapper)[1]).toBe('Show Sidebar (Ctrl + 1)')

    await sideButton.trigger('click')
    expect(store.dev.showSideBar).toBe(true)
    expect(store.dev.showConsoleBar).toBe(false)
    expect(tooltips(wrapper)[1]).toBe('Hide Sidebar (Ctrl + 1)')
    expect(sideButton.find('svg').attributes('opacity')).toBe('1')

    await sideButton.trigger('click')
    expect(store.dev.showSideBar).toBe(false)
  })
})

describe('StepInfoButtonGroup', () => {
  /**
   * Mounts the step buttons for a view.
   * @param {object} [stepper] - `provides` (the view has a stepper), `prev`, `next`, `steps`, `path`
   * @returns {{ wrapper: object, api: object, buttons: object[] }} The wrapper, the fake API and the three buttons
   */
  function mountSteps({ provides = true, prev = true, next = true, steps = true, path = '2/5' } = {}) {
    const result = mountDev(StepInfoButtonGroup, {
      setup: (s) => {
        s.dev.viewProvidesStepper = provides
      },
      api: {
        hasPrevStep: vi.fn(() => prev),
        hasNextStep: vi.fn(() => next),
        hasSteps: vi.fn(() => steps),
        pathString: path,
      },
    })
    return { ...result, buttons: result.wrapper.findAll('button') }
  }
  const disabled = buttons => buttons.map(b => b.attributes('disabled') !== undefined)

  it('shows the current path between the back and forward buttons', () => {
    const { buttons } = mountSteps()
    expect(buttons).toHaveLength(3)
    expect(buttons[1].text()).toBe('2/5')
    expect(disabled(buttons)).toEqual([false, false, false])
  })

  it('steps back and forward', async () => {
    const { buttons, api } = mountSteps()
    await buttons[0].trigger('click')
    expect(api.goPrevStep).toHaveBeenCalledTimes(1)
    expect(api.goNextStep).not.toHaveBeenCalled()
    await buttons[2].trigger('click')
    expect(api.goNextStep).toHaveBeenCalledTimes(1)
  })

  it('disables back on the first step and forward on the last', () => {
    expect(disabled(mountSteps({ prev: false }).buttons)).toEqual([true, false, false])
    expect(disabled(mountSteps({ next: false }).buttons)).toEqual([false, false, true])
  })

  it('disables all three when the view has no stepper, and shows an icon for the path', async () => {
    const { wrapper, buttons, api } = mountSteps({ provides: false, path: '' })
    expect(disabled(buttons)).toEqual([true, true, true])
    expect(wrapper.findComponent(SquareMinus).exists()).toBe(true)
    expect(wrapper.find('.counter').exists()).toBe(false)
    await buttons[2].trigger('click')
    expect(api.goNextStep).not.toHaveBeenCalled()
  })

  it('disables the path when the stepper has no steps', () => {
    expect(disabled(mountSteps({ steps: false, prev: false, next: false }).buttons)).toEqual([true, true, true])
  })
})

describe('DevModeLabel', () => {
  it('shows the mode\'s icon, its long and short name and the smile version', () => {
    const { pinia, api } = setupDev()
    api.config.smileVersion = '0.9.1'
    const wrapper = mountComponent(DevModeLabel, { pinia, props: { icon: BugPlay, label: 'Developer mode', short: 'Dev' } })
    expect(wrapper.findComponent(BugPlay).exists()).toBe(true)
    expect(wrapper.text()).toContain('Developer mode')
    expect(wrapper.text()).toContain('Dev')
    expect(wrapper.text()).toContain('0.9.1')
  })
})

describe('KeyCommandNotification', () => {
  const props = { command: 'Ctrl + A', action: 'No autofill available', show: true }

  it('shows the key and what happened', () => {
    const wrapper = mountComponent(KeyCommandNotification, { props })
    expect(wrapper.find('kbd').text()).toBe('Ctrl + A')
    expect(wrapper.find('.action-text').text()).toBe('No autofill available')
    expect(wrapper.find('.error-notification').exists()).toBe(false)
  })

  it('marks an error', () => {
    const wrapper = mountComponent(KeyCommandNotification, { props: { ...props, type: 'error' } })
    expect(wrapper.find('.notification').classes()).toContain('error-notification')
    expect(wrapper.find('kbd').classes()).toContain('error-key')
    expect(wrapper.find('.action-text').classes()).toContain('error-text')
  })

  it('is not in the page while show is false, and comes back when it is true', async () => {
    const wrapper = mountComponent(KeyCommandNotification, { props: { ...props, show: false } })
    expect(wrapper.find('.notification').exists()).toBe(false)
    await wrapper.setProps({ show: true })
    await nextTick()
    expect(wrapper.find('.notification').exists()).toBe(true)
  })
})
