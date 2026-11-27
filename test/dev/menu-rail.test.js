/**
 * The dev tools' app menu (SmileDevAppMenu): the rail on the left with the
 * modes, the command palette button, the theme button and the settings.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Moon, Sun, SunMoon } from 'lucide-vue-next'
import SmileDevAppMenu from '../../src/runtime/components/dev/menu/SmileDevAppMenu.vue'
import DevConfigPanel from '../../src/runtime/components/dev/menu/DevConfigPanel.vue'
import { paletteRequests } from '../../src/runtime/components/dev/palette/bus.js'
import { setFlags, resetFlags } from '../setup/flags'
import { devApi, setupDev, mountComponent, openStubs } from './mountDev'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))
fake.api = devApi

afterEach(resetFlags)

/**
 * Mounts the rail inside a SidebarProvider, as the dev layout does.
 * @param {(store: object) => void} [setup] - Sets store state
 * @param {object} [menu] - The menu component (default: the one imported above)
 * @returns {{ wrapper: object, store: object }} The wrapper and the store
 */
function mountRail(setup, menu = SmileDevAppMenu) {
  const { pinia, store } = setupDev({ setup })
  const host = { components: { Menu: menu }, template: '<SidebarProvider><Menu /></SidebarProvider>' }
  const wrapper = mountComponent(host, { pinia, stubs: openStubs })
  return { wrapper, store }
}
const mode = (wrapper, label) => wrapper.find(`button[aria-label="${label}"]`)
const tooltips = wrapper => wrapper.findAll('[data-testid="tooltip"]').map(t => t.text())

describe('SmileDevAppMenu', () => {
  it('lists the participant view, then the modes of a deployed build', () => {
    const { wrapper } = mountRail()
    expect(tooltips(wrapper).slice(0, 4)).toEqual([
      'Participant view (leaves the dev tools)',
      'Developer mode',
      'Presentation mode',
      'Build & deploy settings',
    ])
  })

  it('the participant view is a link to the study\'s root', () => {
    const { wrapper } = mountRail()
    expect(wrapper.find('a[href="/"]').exists()).toBe(true)
  })

  it('marks the current mode', () => {
    const { wrapper } = mountRail((s) => {
      s.dev.mainView = 'presentation'
    })
    expect(mode(wrapper, 'Presentation mode').classes()).toContain('bg-sd-selected')
    expect(mode(wrapper, 'Developer mode').classes()).not.toContain('bg-sd-selected')
  })

  it('a click on a mode opens it', async () => {
    const { wrapper, store } = mountRail()
    await mode(wrapper, 'Presentation mode').trigger('click')
    expect(store.dev.mainView).toBe('presentation')
    expect(mode(wrapper, 'Presentation mode').classes()).toContain('bg-sd-selected')
    await mode(wrapper, 'Build & deploy settings').trigger('click')
    expect(store.dev.mainView).toBe('config')
  })

  it('a click on the open mode goes back to developer mode', async () => {
    const { wrapper, store } = mountRail((s) => {
      s.dev.mainView = 'config'
    })
    await mode(wrapper, 'Build & deploy settings').trigger('click')
    expect(store.dev.mainView).toBe('devmode')
  })

  it('a click on developer mode while it is open stays there', async () => {
    const { wrapper, store } = mountRail()
    await mode(wrapper, 'Developer mode').trigger('click')
    expect(store.dev.mainView).toBe('devmode')
  })

  it('the theme button goes system → light → dark → system for the dev tools only', async () => {
    const { wrapper, store } = mountRail()
    const theme = mode(wrapper, 'Dev tools theme')
    expect(theme.findComponent(Sun).exists()).toBe(true)
    expect(tooltips(wrapper).some(t => /^Dev tools: system \((?:light|dark)\)\. Switch to light$/.test(t))).toBe(true)

    await theme.trigger('click')
    expect(store.dev.globalColorMode).toBe('light')
    expect(theme.findComponent(Moon).exists()).toBe(true)
    expect(tooltips(wrapper)).toContain('Dev tools: light. Switch to dark')

    await theme.trigger('click')
    expect(store.dev.globalColorMode).toBe('dark')
    expect(theme.findComponent(SunMoon).exists()).toBe(true)
    expect(tooltips(wrapper).some(t => t.startsWith('Dev tools: dark. Switch to system'))).toBe(true)

    await theme.trigger('click')
    expect(store.dev.globalColorMode).toBe('auto')
    expect(store.dev.experimentColorMode).toBeNull()
  })

  it('the settings button holds the settings panel', () => {
    const { wrapper } = mountRail()
    expect(tooltips(wrapper)).toContain('Settings')
    expect(wrapper.find('[data-testid="popover"]').findComponent(DevConfigPanel).exists()).toBe(true)
  })

  it('has no command palette button on a deployed build', () => {
    const { wrapper } = mountRail()
    expect(wrapper.find('[data-testid="open-command-palette"]').exists()).toBe(false)
  })

  it('on the local dev server, the command palette button asks for the palette', async () => {
    setFlags({ dev: true })
    const { wrapper } = mountRail()
    const before = paletteRequests.value
    await wrapper.find('[data-testid="open-command-palette"]').trigger('click')
    expect(paletteRequests.value).toBe(before + 1)
  })

  // The list of modes is made when menu/devModes.js is first imported, so
  // the flag is set and the modules are imported again
  it('on the local dev server, Docs is a mode between presentation and the build settings', async () => {
    setFlags({ dev: true })
    vi.resetModules()
    const { DEV_MODES } = await import('../../src/runtime/components/dev/menu/devModes')
    expect(DEV_MODES.map(m => m.view)).toEqual(['devmode', 'presentation', 'docs', 'config'])
    expect(DEV_MODES.find(m => m.view === 'docs')).toMatchObject({ label: 'Docs', command: 'docs' })
  })
})
