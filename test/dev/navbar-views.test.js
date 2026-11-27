/**
 * The nav bar's view buttons (autofill, previous / next view, pin, the
 * current route) and the route menu they open.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reactive, nextTick } from 'vue'
import { ArrowDown, Diamond, Pin, PinOff, Presentation } from 'lucide-vue-next'
import { useRoute, navigateTo } from '#imports'
import ViewInfoButtonGroup from '../../src/runtime/components/dev/navbar/ViewInfoButtonGroup.vue'
import RouteJumper from '../../src/runtime/components/dev/navbar/RouteJumper.vue'
import useLog from '../../src/runtime/stores/log'
import { devApi, setupDev, mountComponent, openStubs } from './mountDev'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))
fake.api = devApi

// The timeline of a small study: three views in sequence, one outside it,
// and the landing redirect
const SEQUENCE = [
  { name: 'landing', redirect: '/consent', meta: { sequential: true } },
  { name: 'consent', meta: { sequential: true, level: 0 } },
  { name: 'task', meta: { sequential: true, level: 2 } },
  { name: 'thanks', meta: { sequential: true } },
]
const ROUTES = [
  ...SEQUENCE,
  { name: 'withdraw', meta: {} },
  { name: 'presentation_home', meta: {} },
  { name: 'old', redirect: '/task', meta: {} },
]

let route
beforeEach(() => {
  route = reactive({ path: '/dev/task', name: 'dev-slug', query: {}, params: {} })
  vi.mocked(useRoute).mockReturnValue(route)
  vi.mocked(navigateTo).mockClear()
  vi.mocked(useLog().warn).mockClear()
})

/**
 * Mounts a component on a new store holding the timeline above.
 * @param {object} component - The component
 * @param {object} [options] - `setup` and `api` (see setupDev)
 * @returns {{ wrapper: object, store: object, api: object }} The wrapper, the store and the fake API
 */
function mountDev(component, { setup, api: overrides } = {}) {
  const { pinia, store, api } = setupDev({
    setup: (s) => {
      s.localState.seqtimeline = SEQUENCE
      s.localState.routes = ROUTES
      if (setup) setup(s)
    },
    api: overrides,
  })
  const wrapper = mountComponent(component, { pinia, stubs: openStubs })
  return { wrapper, store, api }
}

describe('ViewInfoButtonGroup', () => {
  // The group's own buttons, in order: autofill, previous, next, pin, route
  const buttons = wrapper => wrapper.findAll('button')
  const isDisabled = button => button.attributes('disabled') !== undefined
  const tooltips = wrapper => wrapper.findAll('[data-testid="tooltip"]').map(t => t.text())

  it('disables autofill when the view has none', async () => {
    const { wrapper, api } = mountDev(ViewInfoButtonGroup)
    expect(isDisabled(buttons(wrapper)[0])).toBe(true)
    expect(tooltips(wrapper)).toContain('No autofill available')
    await buttons(wrapper)[0].trigger('click')
    expect(api.autofill).not.toHaveBeenCalled()
  })

  it('autofills the view when it has an autofill', async () => {
    const { wrapper, api } = mountDev(ViewInfoButtonGroup, { api: { hasAutofill: vi.fn(() => true) } })
    expect(isDisabled(buttons(wrapper)[0])).toBe(false)
    expect(tooltips(wrapper)).toContain('Autofill (Ctrl + A)')
    await buttons(wrapper)[0].trigger('click')
    expect(api.autofill).toHaveBeenCalledTimes(1)
  })

  it('disables previous and next at the ends of the timeline', () => {
    const { wrapper } = mountDev(ViewInfoButtonGroup)
    expect(isDisabled(buttons(wrapper)[1])).toBe(true)
    expect(isDisabled(buttons(wrapper)[2])).toBe(true)
    expect(tooltips(wrapper)).not.toContain('Previous View (Up Arrow)')
    expect(tooltips(wrapper)).not.toContain('Next View (Down Arrow)')
  })

  it('goes to the previous view named in the route\'s meta', async () => {
    const { wrapper, api } = mountDev(ViewInfoButtonGroup, {
      api: { hasPrevView: vi.fn(() => true), route: { path: '/dev/task', meta: { prev: 'consent' } } },
    })
    expect(tooltips(wrapper)).toContain('Previous View (Up Arrow)')
    await buttons(wrapper)[1].trigger('click')
    expect(api.goToView).toHaveBeenCalledWith('consent')
  })

  it('goes to the next view', async () => {
    const { wrapper, api } = mountDev(ViewInfoButtonGroup, { api: { hasNextView: vi.fn(() => true) } })
    expect(tooltips(wrapper)).toContain('Next View (Down Arrow)')
    await buttons(wrapper)[2].trigger('click')
    expect(api.goNextView).toHaveBeenCalledTimes(1)
  })

  it('disables previous and next while a route is pinned', async () => {
    const { wrapper, api } = mountDev(ViewInfoButtonGroup, {
      setup: (s) => {
        s.dev.pinnedRoute = 'task'
      },
      api: { hasPrevView: vi.fn(() => true), hasNextView: vi.fn(() => true) },
    })
    expect(isDisabled(buttons(wrapper)[1])).toBe(true)
    expect(isDisabled(buttons(wrapper)[2])).toBe(true)
    await buttons(wrapper)[2].trigger('click')
    expect(api.goNextView).not.toHaveBeenCalled()
  })

  it('pins the current route, marks the pin and the route, and closes the route menu', async () => {
    const { wrapper, store } = mountDev(ViewInfoButtonGroup, { setup: (s) => {
      s.dev.routePanelVisible = true
    } })
    const pin = buttons(wrapper)[3]
    expect(wrapper.findComponent(Pin).exists()).toBe(true)
    expect(pin.classes()).not.toContain('pinned')

    await pin.trigger('click')
    expect(store.dev.pinnedRoute).toBe('task')
    expect(store.dev.routePanelVisible).toBe(false)
    expect(wrapper.findComponent(PinOff).exists()).toBe(true)
    expect(pin.classes()).toContain('pinned')
    expect(buttons(wrapper)[4].classes()).toContain('pinned')
  })

  it('unpins a pinned route', async () => {
    const { wrapper, store } = mountDev(ViewInfoButtonGroup, { setup: (s) => {
      s.dev.pinnedRoute = 'consent'
    } })
    await buttons(wrapper)[3].trigger('click')
    expect(store.dev.pinnedRoute).toBeNull()
    expect(buttons(wrapper)[4].classes()).not.toContain('pinned')
  })

  it.each(['/presentation/task', '/presentation', '/task'])('has no pin button outside the dev tools (%s)', (path) => {
    route.path = path
    const { wrapper } = mountDev(ViewInfoButtonGroup)
    expect(wrapper.findComponent(Pin).exists()).toBe(false)
    expect(tooltips(wrapper)).not.toContain('Pin current route (Ctrl + P)')
  })

  it('has the pin button at the dev tools\' root', () => {
    route.path = '/dev'
    const { wrapper } = mountDev(ViewInfoButtonGroup)
    expect(wrapper.findComponent(Pin).exists()).toBe(true)
  })

  it('shows the current route\'s name, with an arrow for a view in the sequence', () => {
    const { wrapper } = mountDev(ViewInfoButtonGroup, {
      api: { _resolveTimelineRoute: vi.fn(() => ({ name: 'task', meta: { sequential: true } })) },
    })
    const current = buttons(wrapper)[4]
    expect(current.text()).toBe('/task')
    expect(current.findComponent(ArrowDown).exists()).toBe(true)
  })

  it('shows a diamond for a view outside the sequence, and when the path is no view', () => {
    const outside = mountDev(ViewInfoButtonGroup, { api: { currentRouteName: vi.fn(() => 'withdraw') } })
    expect(buttons(outside.wrapper)[4].text()).toBe('/withdraw')
    expect(buttons(outside.wrapper)[4].findComponent(Diamond).exists()).toBe(true)

    const none = mountDev(ViewInfoButtonGroup, { api: { _resolveTimelineRoute: vi.fn(() => null) } })
    expect(buttons(none.wrapper)[4].findComponent(Diamond).exists()).toBe(true)
  })

  it('shows the presentation icon on the presentation home', () => {
    const { wrapper } = mountDev(ViewInfoButtonGroup, { api: { currentRouteName: vi.fn(() => 'presentation_home') } })
    expect(buttons(wrapper)[4].findComponent(Presentation).exists()).toBe(true)
  })

  // The menu does not open in happy-dom: the menu's open event is emitted by hand
  it('opens and closes the route menu', async () => {
    const { wrapper, store } = mountDev(ViewInfoButtonGroup)
    const menu = wrapper.findComponent({ name: 'DropdownMenu' })
    menu.vm.$emit('update:open', true)
    expect(store.dev.routePanelVisible).toBe(true)
    menu.vm.$emit('update:open', false)
    expect(store.dev.routePanelVisible).toBe(false)
  })

  it('does not open the route menu while a route is pinned', () => {
    const { wrapper, store } = mountDev(ViewInfoButtonGroup, { setup: (s) => {
      s.dev.pinnedRoute = 'task'
    } })
    wrapper.findComponent({ name: 'DropdownMenu' }).vm.$emit('update:open', true)
    expect(store.dev.routePanelVisible).toBe(false)
  })
})

describe('RouteJumper', () => {
  // The menu's content and items are replaced by plain elements (openStubs)
  const items = wrapper => wrapper.findAll('[data-testid="menu-item"]')
  const names = wrapper => items(wrapper).map(i => i.text())

  it('lists home, the sequence, then the other routes, without redirects', () => {
    const { wrapper } = mountDev(RouteJumper)
    expect(names(wrapper)).toEqual(['/recruit', '/consent', '/task', '/thanks', '/withdraw', '/presentation_home'])
  })

  it('marks the current route', () => {
    const { wrapper } = mountDev(RouteJumper)
    const marked = items(wrapper).filter(i => i.classes().includes('bg-accent'))
    expect(marked.map(i => i.text())).toEqual(['/task'])
  })

  it('shows an arrow for views in the sequence, a diamond for the others and the presentation icon for its home', () => {
    const { wrapper } = mountDev(RouteJumper)
    const item = name => items(wrapper).find(i => i.text() === name)
    expect(item('/consent').findComponent(ArrowDown).exists()).toBe(true)
    expect(item('/withdraw').findComponent(Diamond).exists()).toBe(true)
    expect(item('/presentation_home').findComponent(Presentation).exists()).toBe(true)
  })

  it('indents a view by its level', () => {
    const { wrapper } = mountDev(RouteJumper)
    const indents = name => items(wrapper).find(i => i.text() === name).findAll('span[style]').length
    expect(indents('/consent')).toBe(0)
    expect(indents('/task')).toBe(2)
  })

  it('goes to the view pressed, forcing the navigation, and logs it', async () => {
    const { wrapper, api } = mountDev(RouteJumper)
    await items(wrapper)[4].trigger('click')
    expect(api.goToView).toHaveBeenCalledWith('withdraw', true)
    expect(useLog().warn).toHaveBeenCalledWith('DEV MODE: user requested to FORCE navigate to withdraw')
  })

  it('highlights the route under the pointer', async () => {
    const { wrapper } = mountDev(RouteJumper)
    const consent = items(wrapper)[1]
    await consent.trigger('mouseover')
    expect(consent.classes()).toContain('bg-sd-hover')
    await consent.trigger('mouseout')
    expect(consent.classes()).not.toContain('bg-sd-hover')
  })

  it('home is the recruitment chooser in the dev tools', async () => {
    const { wrapper } = mountDev(RouteJumper)
    await items(wrapper)[0].trigger('click')
    expect(navigateTo).toHaveBeenCalledWith('/dev/')
  })

  it.each(['/presentation/task', '/presentation'])('home is the presentation home in presentation mode (%s)', async (path) => {
    route.path = path
    const { wrapper } = mountDev(RouteJumper)
    expect(items(wrapper)[0].text()).toBe('/home')
    await items(wrapper)[0].trigger('click')
    expect(navigateTo).toHaveBeenCalledWith('/presentation/')
  })

  it('follows the route: home changes when the path moves to presentation mode', async () => {
    const { wrapper } = mountDev(RouteJumper)
    route.path = '/presentation/task'
    route.query = { x: '1' }
    await nextTick()
    expect(items(wrapper)[0].text()).toBe('/home')
  })
})
