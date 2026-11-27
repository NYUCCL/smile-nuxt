/**
 * @fileoverview The three layouts: what the participant layout puts around
 * a view, what presentation mode shows while loading and for an unknown
 * address, and which of the dev tools' views the development layout shows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { h, nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useHead } from '#imports'
import ExperimentLayout from '../../src/runtime/layouts/experiment.vue'
import PresentationLayout from '../../src/runtime/layouts/presentation.vue'
import DevelopmentLayout from '../../src/runtime/layouts/development.vue'
import { setFlags, resetFlags } from '../setup/flags'
import { createStore, createFakeApi, mountComponent } from '../components/mount'
import { ClientOnly, marker, stub } from './stubs'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))
// The stub of Nuxt's auto-imports has no useHead
vi.mock('#imports', async original => ({
  ...(await original()),
  useHead: vi.fn(),
  useNuxtApp: vi.fn(() => ({ $timeline: null })),
  useRoute: vi.fn(() => ({ path: '/', name: 'index', query: {}, params: {} })),
}))
vi.mock('vue-sonner', async () => ({ Toaster: (await import('./stubs')).marker('toaster') }))

// The dev tools' own parts have their own tests; here each is a marked box
vi.mock('../../src/runtime/components/dev/palette/DevCommandPalette.vue', async () => (await import('./stubs')).markerModule('palette', ['context']))
vi.mock('../../src/runtime/components/dev/presentation/PresentationNavBar.vue', async () => (await import('./stubs')).markerModule('presentation-navbar'))
vi.mock('../../src/runtime/components/dev/menu/SmileDevAppMenu.vue', async () => (await import('./stubs')).markerModule('app-menu'))
vi.mock('../../src/runtime/components/dev/navbar/SmileDevNavBar.vue', async () => (await import('./stubs')).markerModule('dev-navbar'))
vi.mock('../../src/runtime/components/dev/console/SmileDevConsole.vue', async () => (await import('./stubs')).markerModule('dev-console'))
vi.mock('../../src/runtime/components/dev/sidebar/SmileDevSideBar.vue', async () => (await import('./stubs')).markerModule('dev-sidebar'))
vi.mock('../../src/runtime/components/dev/ResponsiveDeviceContainer.vue', async () => (await import('./stubs')).markerModule('device'))
vi.mock('../../src/runtime/components/dev/SmileDevPresentationView.vue', async () => (await import('./stubs')).markerModule('presentation-view'))
vi.mock('../../src/runtime/components/dev/buildconfig/BuildConfigView.vue', async () => (await import('./stubs')).markerModule('build-config'))
vi.mock('../../src/runtime/components/dev/docs/SmileDevDocsView.vue', async () => (await import('./stubs')).markerModule('docs-view'))

const stubs = {
  ClientOnly,
  OtherTabNotice: marker('other-tab', ['inline']),
  ReconnectingNotice: marker('reconnecting', ['inline']),
  LocalDevBanner: marker('local-banner'),
  ExperimentStatusBar: marker('status-bar'),
  WindowSizerView: marker('window-sizer', ['triggered']),
}

let tooSmall

/**
 * Mounts a layout around a page.
 * @param {object} layout - The layout
 * @param {object} [options] - What to start from
 * @param {(store: object) => void} [options.setup] - Sets the store's state
 * @param {string} [options.routeName] - The view's name; undefined for an address the timeline does not have
 * @returns {{ wrapper: object, store: object }} The wrapper and the store
 */
function mountLayout(layout, options = {}) {
  const { setup } = options
  const routeName = 'routeName' in options ? options.routeName : 'task'
  const { pinia, store } = createStore(setup)
  fake.api = createFakeApi(store, {
    route: { path: '/some/address' },
    currentRouteName: vi.fn(() => routeName),
    isBrowserTooSmall: vi.fn(() => tooSmall),
  })
  const wrapper = mountComponent(layout, {
    pinia,
    stubs,
    slots: { default: () => h('div', { id: 'page' }, 'THE PAGE') },
  })
  return { wrapper, store }
}

beforeEach(() => {
  tooSmall = false
  vi.mocked(useHead).mockClear()
})
afterEach(resetFlags)

describe('experiment layout', () => {
  it('shows the page with the notices, the local banner and the status bar', () => {
    const { wrapper } = mountLayout(ExperimentLayout)
    expect(wrapper.find('#page').text()).toBe('THE PAGE')
    for (const name of ['other-tab', 'reconnecting', 'local-banner', 'status-bar']) {
      expect(stub(wrapper, name).exists(), name).toBe(true)
    }
    expect(stub(wrapper, 'window-sizer').exists()).toBe(false)
  })

  it('covers the page with the window sizer when the window is too small', () => {
    tooSmall = true
    const { wrapper, store } = mountLayout(ExperimentLayout)
    expect(stub(wrapper, 'window-sizer').attributes('data-triggered')).toBe('true')
    expect(store.browserEphemeral.tooSmall).toBe(true)
    // The page and the status bar stay in place underneath
    expect(wrapper.find('#page').exists()).toBe(true)
    expect(stub(wrapper, 'status-bar').exists()).toBe(true)
  })

  it('checks the size of the browser window', () => {
    mountLayout(ExperimentLayout)
    expect(fake.api.isBrowserTooSmall).toHaveBeenCalledWith(window.innerWidth, window.innerHeight)
  })

  it.each(['light', 'dark'])('puts the study\'s %s color mode on <html>, and follows a change', (mode) => {
    const { store } = mountLayout(ExperimentLayout, {
      setup: (s) => {
        s.config = { ...s.config, colorMode: mode }
      },
    })
    const attrs = vi.mocked(useHead).mock.calls[0][0].htmlAttrs
    expect(attrs.class.value).toBe(mode)
    const other = mode === 'light' ? 'dark' : 'light'
    store.config.colorMode = other
    expect(attrs.class.value).toBe(other)
  })

  it('has no command palette outside the dev server', async () => {
    const { wrapper } = mountLayout(ExperimentLayout)
    await flushPromises()
    expect(stub(wrapper, 'palette').exists()).toBe(false)
  })

  it('has the command palette, for the participant view, on the dev server', async () => {
    setFlags({ dev: true })
    const { wrapper } = mountLayout(ExperimentLayout)
    await flushPromises()
    expect(stub(wrapper, 'palette').attributes('data-context')).toBe('participant')
  })
})

describe('presentation layout', () => {
  it('shows a loading message until it has mounted, then the page under the bar', async () => {
    const { wrapper } = mountLayout(PresentationLayout)
    expect(wrapper.text()).toContain('Loading...')
    expect(wrapper.find('#page').exists()).toBe(false)
    await nextTick()
    expect(wrapper.text()).not.toContain('Loading...')
    expect(wrapper.find('#page').exists()).toBe(true)
    expect(stub(wrapper, 'presentation-navbar').exists()).toBe(true)
  })

  it('says the route was not found for an address the timeline does not have', async () => {
    const { wrapper } = mountLayout(PresentationLayout, { routeName: undefined })
    await nextTick()
    expect(wrapper.find('.not-found-title').text()).toBe('Route Not Found')
    expect(wrapper.find('.not-found-message code').text()).toBe('/some/address')
    expect(wrapper.find('#page').exists()).toBe(false)
    // The bar stays, to get out
    expect(stub(wrapper, 'presentation-navbar').exists()).toBe(true)
  })

  it('puts the dev tools\' palette on <html>', () => {
    mountLayout(PresentationLayout, {
      setup: (s) => {
        s.dev.devPalette = 'github'
      },
    })
    expect(vi.mocked(useHead).mock.calls[0][0].htmlAttrs['data-sd-palette'].value).toBe('github')
  })
})

describe('development layout', () => {
  /**
   * Mounts the development layout and waits until it has mounted.
   * @param {object} [options] - As for mountLayout
   * @returns {Promise<{ wrapper: object, store: object }>} The wrapper and the store
   */
  async function mountDev(options) {
    const mounted = mountLayout(DevelopmentLayout, options)
    await flushPromises()
    return mounted
  }

  it('always has the rail and the toasts', async () => {
    const { wrapper } = await mountDev()
    expect(stub(wrapper, 'app-menu').exists()).toBe(true)
    expect(stub(wrapper, 'toaster').exists()).toBe(true)
  })

  it('puts the dev tools\' palette on <html>', async () => {
    await mountDev({
      setup: (s) => {
        s.dev.devPalette = 'github'
      },
    })
    expect(vi.mocked(useHead).mock.calls[0][0].htmlAttrs['data-sd-palette'].value).toBe('github')
  })

  describe('developer mode', () => {
    it('shows a loading message until it has mounted', () => {
      const { wrapper } = mountLayout(DevelopmentLayout)
      expect(wrapper.text()).toContain('Loading...')
      expect(wrapper.find('#page').exists()).toBe(false)
    })

    it('shows the toolbar and the page inside the device container', async () => {
      const { wrapper } = await mountDev()
      expect(stub(wrapper, 'dev-navbar').exists()).toBe(true)
      expect(stub(wrapper, 'device').find('#page').exists()).toBe(true)
      for (const name of ['presentation-view', 'build-config', 'docs-view']) {
        expect(stub(wrapper, name).exists(), name).toBe(false)
      }
    })

    it('says the route was not found for an address the timeline does not have, and keeps the toolbar', async () => {
      const { wrapper } = await mountDev({ routeName: undefined })
      expect(wrapper.find('.not-found-title').text()).toBe('Route Not Found')
      expect(wrapper.find('.not-found-message code').text()).toBe('/some/address')
      expect(stub(wrapper, 'device').exists()).toBe(false)
      expect(stub(wrapper, 'dev-navbar').exists()).toBe(true)
    })

    it('shows the other-tab notice in place of the page', async () => {
      const { wrapper } = await mountDev({
        setup: (s) => {
          s.browserEphemeral.otherTab = true
          s.browserEphemeral.loadFailed = true
        },
      })
      expect(stub(wrapper, 'device').find('[data-stub="other-tab"]').attributes('data-inline')).toBe('true')
      expect(stub(wrapper, 'reconnecting').exists()).toBe(false)
      expect(wrapper.find('#page').exists()).toBe(false)
    })

    it('shows the reconnecting notice in place of the page when loading the data failed', async () => {
      const { wrapper } = await mountDev({
        setup: (s) => {
          s.browserEphemeral.loadFailed = true
        },
      })
      expect(stub(wrapper, 'reconnecting').attributes('data-inline')).toBe('true')
      expect(wrapper.find('#page').exists()).toBe(false)
    })

    it('shows the window sizer in place of the page when the device is too small', async () => {
      tooSmall = true
      const { wrapper, store } = await mountDev({
        setup: (s) => {
          s.dev.deviceWidth = 390
          s.dev.deviceHeight = 844
        },
      })
      expect(stub(wrapper, 'window-sizer').attributes('data-triggered')).toBe('true')
      expect(wrapper.find('#page').exists()).toBe(false)
      // Measured against the device in the preview, not the browser window
      expect(fake.api.isBrowserTooSmall).toHaveBeenCalledWith(390, 844)
      expect(store.browserEphemeral.tooSmall).toBe(true)
    })

    it('shows the console and the sidebar only while they are turned on', async () => {
      const { wrapper, store } = await mountDev({
        setup: (s) => {
          s.dev.showConsoleBar = false
          s.dev.showSideBar = false
        },
      })
      expect(stub(wrapper, 'dev-console').exists()).toBe(false)
      expect(stub(wrapper, 'dev-sidebar').exists()).toBe(false)
      store.dev.showConsoleBar = true
      await nextTick()
      expect(stub(wrapper, 'dev-console').exists()).toBe(true)
      expect(stub(wrapper, 'dev-sidebar').exists()).toBe(false)
      store.dev.showSideBar = true
      await nextTick()
      expect(stub(wrapper, 'dev-sidebar').exists()).toBe(true)
    })
  })

  describe('the other views', () => {
    it('presentation shows the presentation view and none of developer mode', async () => {
      const { wrapper } = await mountDev({
        setup: (s) => {
          s.dev.mainView = 'presentation'
        },
      })
      expect(stub(wrapper, 'presentation-view').exists()).toBe(true)
      expect(stub(wrapper, 'dev-navbar').exists()).toBe(false)
      expect(wrapper.find('#page').exists()).toBe(false)
      expect(stub(wrapper, 'app-menu').exists()).toBe(true)
    })

    it('config shows the build settings', async () => {
      const { wrapper } = await mountDev({
        setup: (s) => {
          s.dev.mainView = 'config'
        },
      })
      expect(stub(wrapper, 'build-config').exists()).toBe(true)
      expect(stub(wrapper, 'dev-navbar').exists()).toBe(false)
    })

    it('docs shows the docs on the dev server', async () => {
      setFlags({ dev: true })
      const { wrapper } = await mountDev({
        setup: (s) => {
          s.dev.mainView = 'docs'
        },
      })
      expect(stub(wrapper, 'docs-view').exists()).toBe(true)
      expect(stub(wrapper, 'dev-navbar').exists()).toBe(false)
    })

    it('docs opens developer mode in a build, which has no docs', async () => {
      const { wrapper } = await mountDev({
        setup: (s) => {
          s.dev.mainView = 'docs'
        },
      })
      expect(stub(wrapper, 'docs-view').exists()).toBe(false)
      expect(stub(wrapper, 'dev-navbar').exists()).toBe(true)
      expect(wrapper.find('#page').exists()).toBe(true)
    })

    it('the dashboard is hidden for now: its saved view opens developer mode', async () => {
      const { wrapper } = await mountDev({
        setup: (s) => {
          s.dev.mainView = 'dashboard'
        },
      })
      expect(stub(wrapper, 'dev-navbar').exists()).toBe(true)
    })

    it('changing the view swaps what is shown', async () => {
      const { wrapper, store } = await mountDev()
      store.dev.mainView = 'config'
      await nextTick()
      expect(stub(wrapper, 'build-config').exists()).toBe(true)
      store.dev.mainView = 'devmode'
      await nextTick()
      expect(stub(wrapper, 'build-config').exists()).toBe(false)
      expect(wrapper.find('#page').exists()).toBe(true)
    })
  })

  describe('the command palette', () => {
    it('is there, for the dev tools, on the dev server', async () => {
      setFlags({ dev: true })
      const { wrapper } = await mountDev()
      expect(stub(wrapper, 'palette').attributes('data-context')).toBe('dev')
    })

    it('is not there in a build', async () => {
      const { wrapper } = await mountDev()
      expect(stub(wrapper, 'palette').exists()).toBe(false)
    })
  })
})
