/**
 * Presentation mode's top bar and its buttons (logout, theme, QR code,
 * home), and the presentation view shown inside the dev tools
 * (SmileDevPresentationView).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reactive, markRaw } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { Moon, Sun, SunMoon } from 'lucide-vue-next'
import { useRoute, useNuxtApp, navigateTo } from '#imports'
import LogoutButton from '../../src/runtime/components/dev/presentation/LogoutButton.vue'
import DarkModeButton from '../../src/runtime/components/dev/presentation/DarkModeButton.vue'
import QRCodeButton from '../../src/runtime/components/dev/presentation/QRCodeButton.vue'
import PresentationModeResetButton from '../../src/runtime/components/dev/presentation/PresentationModeResetButton.vue'
import PresentationNavBar from '../../src/runtime/components/dev/presentation/PresentationNavBar.vue'
import DevModeLabel from '../../src/runtime/components/dev/navbar/DevModeLabel.vue'
import SmileDevPresentationView from '../../src/runtime/components/dev/SmileDevPresentationView.vue'
import { setFlags, resetFlags } from '../setup/flags'
import { devApi, setupDev, mountComponent, openStubs } from './mountDev'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))
fake.api = devApi

let route
let location
beforeEach(() => {
  route = reactive({ path: '/presentation/task', name: 'presentation-slug', query: {}, params: {} })
  vi.mocked(useRoute).mockReturnValue(route)
  vi.mocked(navigateTo).mockClear()
  // The buttons read window.location.pathname and set window.location.href
  location = { pathname: '/dev/task', origin: 'http://localhost:3000', href: 'http://localhost:3000/dev/task' }
  vi.stubGlobal('location', location)
  vi.stubGlobal('$fetch', vi.fn(async () => ({ authenticated: true })))
})
afterEach(() => {
  vi.unstubAllGlobals()
  resetFlags()
})

/**
 * Mounts a component on a new store.
 * @param {object} component - The component
 * @param {object} [options] - `setup`, `api` (see setupDev) and mount options
 * @returns {{ wrapper: object, store: object, api: object }} The wrapper, the store and the fake API
 */
function mountDev(component, { setup, api: overrides, stubs = {}, ...rest } = {}) {
  const { pinia, store, api } = setupDev({ setup, api: overrides })
  const wrapper = mountComponent(component, { pinia, stubs: { ...openStubs, ...stubs }, ...rest })
  return { wrapper, store, api }
}
const tooltips = wrapper => wrapper.findAll('[data-testid="tooltip"]').map(t => t.text())

describe('LogoutButton', () => {
  it('asks for the dev session in the dev tools and shows the button to a signed-in user', async () => {
    const { wrapper } = mountDev(LogoutButton)
    expect(wrapper.find('button').exists()).toBe(false)
    await flushPromises()
    expect($fetch).toHaveBeenCalledWith('/api/auth/session', { query: { scope: 'dev' } })
    expect(wrapper.find('button').exists()).toBe(true)
    expect(tooltips(wrapper)).toEqual(['Logout'])
  })

  it('asks for the presentation session under /presentation', async () => {
    location.pathname = '/presentation/task'
    mountDev(LogoutButton)
    await flushPromises()
    expect($fetch).toHaveBeenCalledWith('/api/auth/session', { query: { scope: 'presentation' } })
  })

  it.each([
    ['is not signed in', async () => ({ authenticated: false })],
    ['gets no answer', async () => undefined],
    ['cannot be checked', async () => {
      throw new Error('network')
    }],
  ])('shows nothing when the user %s', async (_name, answer) => {
    vi.mocked($fetch).mockImplementation(answer)
    const { wrapper } = mountDev(LogoutButton)
    await flushPromises()
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('logs out on the server, then goes to the login page', async () => {
    const { wrapper } = mountDev(LogoutButton)
    await flushPromises()
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect($fetch).toHaveBeenLastCalledWith('/api/auth/logout', { method: 'POST' })
    expect(location.href).toBe('/dev-login')
  })

  it('goes to the login page even when the logout request fails', async () => {
    const { wrapper } = mountDev(LogoutButton)
    await flushPromises()
    vi.mocked($fetch).mockRejectedValue(new Error('network'))
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(location.href).toBe('/dev-login')
  })
})

describe('DarkModeButton', () => {
  it('goes system → light → dark → system for the dev tools\' theme', async () => {
    const { wrapper, store } = mountDev(DarkModeButton)
    expect(wrapper.findComponent(Sun).exists()).toBe(true)
    expect(tooltips(wrapper)).toEqual(['Switch to Light Mode'])

    await wrapper.find('button').trigger('click')
    expect(store.dev.globalColorMode).toBe('light')
    expect(wrapper.findComponent(Moon).exists()).toBe(true)
    expect(tooltips(wrapper)).toEqual(['Switch to Dark Mode'])

    await wrapper.find('button').trigger('click')
    expect(store.dev.globalColorMode).toBe('dark')
    expect(wrapper.findComponent(SunMoon).exists()).toBe(true)
    expect(tooltips(wrapper)[0]).toMatch(/^Switch to System \((?:light|dark)\)$/)

    await wrapper.find('button').trigger('click')
    expect(store.dev.globalColorMode).toBe('auto')
    expect(store.dev.experimentColorMode).toBeNull()
  })
})

describe('QRCodeButton', () => {
  const image = wrapper => wrapper.find('img[alt="QR Code"]').attributes('src')

  it('shows and offers for download the QR code of the deployed study', () => {
    const { pinia, api } = setupDev()
    api.config.deployURL = 'https://exp.example/lab/study/?a=1'
    const wrapper = mountComponent(QRCodeButton, { pinia, stubs: openStubs })
    const url = '/api/qr?url=https%3A%2F%2Fexp.example%2Flab%2Fstudy%2F%3Fa%3D1'
    expect(image(wrapper)).toBe(url)
    const link = wrapper.find('a[download]')
    expect(link.attributes('href')).toBe(url)
    expect(link.attributes('download')).toBe('qr.svg')
    expect(link.text()).toBe('Download QR')
  })

  it('uses the page\'s own origin in the browser when there is no deploy URL', () => {
    setFlags({ client: true })
    const { wrapper } = mountDev(QRCodeButton)
    expect(image(wrapper)).toBe('/api/qr?url=http%3A%2F%2Flocalhost%3A3000')
  })

  it('has an empty URL on the server when there is no deploy URL', () => {
    const { wrapper } = mountDev(QRCodeButton)
    expect(image(wrapper)).toBe('/api/qr?url=')
  })
})

describe('PresentationModeResetButton', () => {
  it('goes to the presentation home in presentation mode', async () => {
    const { wrapper, store } = mountDev(PresentationModeResetButton, { setup: (s) => {
      s.dev.mainView = 'presentation'
    } })
    expect(tooltips(wrapper)).toEqual(['Return to presentation home'])
    await wrapper.find('button').trigger('click')
    expect(navigateTo).toHaveBeenCalledWith('/presentation/')
    expect(store.dev.mainView).toBe('presentation')
  })

  it('inside the dev tools, goes back to developer mode without leaving the page', async () => {
    route.path = '/dev/task'
    const { wrapper, store } = mountDev(PresentationModeResetButton, { setup: (s) => {
      s.dev.mainView = 'presentation'
    } })
    await wrapper.find('button').trigger('click')
    expect(store.dev.mainView).toBe('devmode')
    expect(navigateTo).not.toHaveBeenCalled()
  })
})

describe('PresentationNavBar', () => {
  it('is labelled presentation mode and has the theme, QR code, home and view buttons', async () => {
    const { wrapper } = mountDev(PresentationNavBar)
    await flushPromises()
    expect(wrapper.findComponent(DevModeLabel).props()).toMatchObject({ label: 'Presentation mode', short: 'Present' })
    expect(wrapper.findComponent(DarkModeButton).exists()).toBe(true)
    expect(wrapper.findComponent(QRCodeButton).exists()).toBe(true)
    expect(wrapper.findComponent(PresentationModeResetButton).exists()).toBe(true)
    expect(wrapper.findComponent(LogoutButton).find('button').exists()).toBe(true)
    // The view buttons, without the dev tools' pin
    expect(tooltips(wrapper)).toContain('No autofill available')
    expect(tooltips(wrapper)).not.toContain('Pin current route (Ctrl + P)')
  })

  it('has no theme button when hideDarkMode is set', () => {
    const { wrapper } = mountDev(PresentationNavBar, { props: { hideDarkMode: true } })
    expect(wrapper.findComponent(DarkModeButton).exists()).toBe(false)
    expect(wrapper.findComponent(QRCodeButton).exists()).toBe(true)
  })
})

describe('SmileDevPresentationView', () => {
  const Home = markRaw({ name: 'MyHome', props: ['title'], template: '<div data-testid="my-home">{{ title }}</div>' })
  const builtinHome = { PresentationModeView: { template: '<div data-testid="builtin-home" />' } }

  beforeEach(() => {
    vi.mocked(useNuxtApp).mockReturnValue({ $timeline: { getViewForPath: vi.fn(() => null) } })
  })

  it('shows the study\'s own presentation home with its props', async () => {
    const { wrapper } = mountDev(SmileDevPresentationView, { setup: (s) => {
      s.config = { ...s.config, global_app_components: { presentation_home: Home, presentation_home_props: { title: 'A study of memory' } } }
    } })
    await flushPromises()
    expect(wrapper.find('[data-testid="my-home"]').text()).toBe('A study of memory')
    expect(wrapper.find('.loading-container').exists()).toBe(false)
  })

  it('shows the built-in presentation home when the study has none', async () => {
    const { wrapper } = mountDev(SmileDevPresentationView, { stubs: builtinHome })
    await flushPromises()
    expect(wrapper.find('[data-testid="builtin-home"]').exists()).toBe(true)
  })

  it('has the presentation bar without its theme button (the rail has one)', async () => {
    const { wrapper } = mountDev(SmileDevPresentationView, { stubs: builtinHome })
    await flushPromises()
    const bar = wrapper.findComponent(PresentationNavBar)
    expect(bar.props('hideDarkMode')).toBe(true)
    expect(bar.findComponent(DarkModeButton).exists()).toBe(false)
  })

  it('says "Loading..." until it is mounted', async () => {
    // What the server renders: the mounted hook has not run
    const { renderToString } = await import('vue/server-renderer')
    const { createSSRApp } = await import('vue')
    const { pinia } = setupDev()
    const app = createSSRApp(SmileDevPresentationView)
    app.use(pinia)
    app.component('PresentationNavBar', { template: '<nav />' })
    const html = await renderToString(app)
    expect(html).toContain('Loading...')
    expect(html).not.toContain('builtin-home')
  })
})
