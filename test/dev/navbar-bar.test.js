/**
 * The developer mode nav bar (SmileDevNavBar): which buttons it shows and
 * its keyboard shortcuts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reactive } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useRoute } from '#imports'
import SmileDevNavBar from '../../src/runtime/components/dev/navbar/SmileDevNavBar.vue'
import ColorModeButton from '../../src/runtime/components/dev/navbar/ColorModeButton.vue'
import FullScreenButton from '../../src/runtime/components/dev/navbar/FullScreenButton.vue'
import KeyCommandNotification from '../../src/runtime/components/dev/navbar/KeyCommandNotification.vue'
import DevModeLabel from '../../src/runtime/components/dev/navbar/DevModeLabel.vue'
import LogoutButton from '../../src/runtime/components/dev/presentation/LogoutButton.vue'
import { setFlags, resetFlags } from '../setup/flags'
import { devApi, setupDev, mountComponent, openStubs, pressKey } from './mountDev'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))
vi.mock('../../src/runtime/composables/useViewAPI', async original => ({ ...(await original()), default: () => fake.api }))
fake.api = devApi

let wrapper
beforeEach(() => {
  vi.mocked(useRoute).mockReturnValue(reactive({ path: '/dev/task', name: 'dev-slug', query: {}, params: {} }))
  vi.stubGlobal('$fetch', vi.fn(async () => ({ authenticated: false })))
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.unstubAllGlobals()
  vi.useRealTimers()
  resetFlags()
})

/**
 * Mounts the nav bar.
 * @param {object} [options] - `setup` and `api` (see setupDev)
 * @returns {{ store: object, api: object }} The store and the fake API
 */
function mountBar({ setup, api: overrides } = {}) {
  const { pinia, store, api } = setupDev({
    setup,
    api: { hasPrevStep: vi.fn(() => false), hasSteps: vi.fn(() => false), ...overrides },
  })
  wrapper = mountComponent(SmileDevNavBar, { pinia, stubs: openStubs, attachTo: document.body })
  return { store, api }
}
const notification = () => wrapper.findComponent(KeyCommandNotification)

describe('SmileDevNavBar', () => {
  it('is labelled developer mode, with the smile version', () => {
    const { api } = mountBar()
    api.config.smileVersion = '1.2.3'
    const label = wrapper.findComponent(DevModeLabel)
    expect(label.props()).toMatchObject({ label: 'Developer mode', short: 'Dev' })
  })

  it('has no "local" tag on a deployed build, and has it on the local dev server', () => {
    mountBar()
    expect(wrapper.find('.sd-local-chip').exists()).toBe(false)
    wrapper.unmount()
    setFlags({ dev: true })
    mountBar()
    expect(wrapper.find('.sd-local-chip').text()).toBe('local')
  })

  it('shows the full screen button on a view, and the color mode button only in full screen', () => {
    mountBar()
    expect(wrapper.findComponent(FullScreenButton).exists()).toBe(true)
    expect(wrapper.findComponent(ColorModeButton).exists()).toBe(false)
    wrapper.unmount()
    mountBar({ setup: (s) => {
      s.dev.isFullscreen = true
    } })
    expect(wrapper.findComponent(ColorModeButton).exists()).toBe(true)
  })

  it('shows neither on the recruitment chooser', () => {
    mountBar({
      setup: (s) => {
        s.dev.isFullscreen = true
      },
      api: { currentRouteName: vi.fn(() => 'recruit') },
    })
    expect(wrapper.findComponent(FullScreenButton).exists()).toBe(false)
    expect(wrapper.findComponent(ColorModeButton).exists()).toBe(false)
  })

  it('shows the logout button only to a signed-in user', async () => {
    mountBar()
    await flushPromises()
    expect(wrapper.findComponent(LogoutButton).find('button').exists()).toBe(false)
    wrapper.unmount()
    vi.mocked($fetch).mockResolvedValue({ authenticated: true })
    mountBar()
    await flushPromises()
    expect(wrapper.findComponent(LogoutButton).find('button').exists()).toBe(true)
  })

  describe('keyboard shortcuts', () => {
    it('the down arrow goes to the next view and the up arrow to the previous one', () => {
      const { api } = mountBar({ api: {
        nextView: vi.fn(() => ({ name: 'thanks' })),
        prevView: vi.fn(() => ({ name: 'consent' })),
      } })
      const down = pressKey('ArrowDown')
      expect(api.goToView).toHaveBeenLastCalledWith('thanks', true)
      expect(down.defaultPrevented).toBe(true)
      pressKey('ArrowUp')
      expect(api.goToView).toHaveBeenLastCalledWith('consent', true)
    })

    it('an arrow at the end of the timeline does nothing and shows no notification', async () => {
      const { api } = mountBar()
      pressKey('ArrowDown')
      await flushPromises()
      expect(api.goToView).not.toHaveBeenCalled()
      expect(notification().props('show')).toBe(false)
    })

    it('ctrl+1 shows and hides the sidebar, ctrl+` the console', () => {
      const { store } = mountBar()
      expect(pressKey('1', { ctrlKey: true }).defaultPrevented).toBe(true)
      expect(store.dev.showSideBar).toBe(true)
      pressKey('1', { ctrlKey: true })
      expect(store.dev.showSideBar).toBe(false)
      pressKey('`', { ctrlKey: true })
      expect(store.dev.showConsoleBar).toBe(true)
    })

    it('ctrl+2 and ctrl+3 go to the next tab of the open sidebar and console', () => {
      const { store } = mountBar({ setup: (s) => {
        s.dev.showSideBar = true
        s.dev.showConsoleBar = true
      } })
      pressKey('2', { ctrlKey: true })
      expect(store.dev.sideBarTab).toBe('randomization')
      pressKey('3', { ctrlKey: true })
      expect(store.dev.consoleBarTab).toBe('log')
    })

    it('ctrl+r zaps the local state, ctrl+a autofills, ctrl+p pins the route', () => {
      const { store, api } = mountBar({ api: { hasAutofill: vi.fn(() => true) } })
      pressKey('r', { ctrlKey: true })
      expect(api.resetLocalState).toHaveBeenCalledTimes(1)
      pressKey('a', { ctrlKey: true })
      expect(api.autofill).toHaveBeenCalledTimes(1)
      pressKey('p', { ctrlKey: true })
      expect(store.dev.pinnedRoute).toBe('task')
    })

    it('a shortcut that worked shows no notification', async () => {
      mountBar()
      pressKey('1', { ctrlKey: true })
      await flushPromises()
      expect(notification().props('show')).toBe(false)
    })

    it('a shortcut that failed shows its key and the reason for 1.5 seconds', async () => {
      vi.useFakeTimers()
      mountBar()
      pressKey('a', { ctrlKey: true })
      await flushPromises()
      expect(notification().props()).toMatchObject({ show: true, command: 'Ctrl + A', type: 'error' })
      expect(notification().find('kbd').text()).toBe('Ctrl + A')
      expect(notification().find('.action-text').text()).not.toBe('')

      await vi.advanceTimersByTimeAsync(1400)
      expect(notification().props('show')).toBe(true)
      await vi.advanceTimersByTimeAsync(200)
      expect(notification().props('show')).toBe(false)
    })

    it('ctrl+2 with the sidebar hidden says so', async () => {
      mountBar()
      pressKey('2', { ctrlKey: true })
      await flushPromises()
      expect(notification().props()).toMatchObject({ show: true, command: 'Ctrl + 2', action: 'Sidebar is hidden' })
    })

    it('the same keys without ctrl, and other ctrl keys, do nothing', async () => {
      const { store, api } = mountBar()
      const plain = pressKey('1')
      const other = pressKey('x', { ctrlKey: true })
      pressKey('r')
      await flushPromises()
      expect(plain.defaultPrevented).toBe(false)
      expect(other.defaultPrevented).toBe(false)
      expect(store.dev.showSideBar).toBe(false)
      expect(api.resetLocalState).not.toHaveBeenCalled()
    })

    it('stop when the nav bar is removed', () => {
      const { store } = mountBar()
      wrapper.unmount()
      wrapper = null
      pressKey('1', { ctrlKey: true })
      expect(store.dev.showSideBar).toBe(false)
    })
  })
})
