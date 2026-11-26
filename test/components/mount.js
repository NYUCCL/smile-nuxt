/**
 * Shared helpers for component tests.
 *
 * In a Nuxt app the module's components (ui, forms, layouts, builtins) are
 * registered globally by file name, and views get the study through
 * useAPI() / useViewAPI(). Here:
 *
 * - `mountComponent` mounts a component with every module component
 *   registered under its file name, as the module does
 *   (addComponentsDir with pathPrefix: false), and with a testing Pinia.
 * - `createStore` makes the real smilestore on a testing Pinia. Its actions
 *   are spies that do nothing, so a test sets state and checks calls.
 * - `createFakeApi` makes a stand-in for the object useAPI() / useViewAPI()
 *   return: the store, a config, and spies for every method the built-in
 *   views call. A test file points the composables at it:
 *
 *     const fake = vi.hoisted(() => ({ api: null }))
 *     vi.mock('../../src/runtime/composables/useViewAPI', async original => ({ ...(await original()), default: () => fake.api }))
 *
 *   (The other exports are kept: this file imports every built-in, and
 *   useViewAPI extends the SmileAPI class that useAPI exports.)
 *
 * - `setupViewAPI` is for views that use the stepper (quiz, surveys): it
 *   gives the real useViewAPI() on a real store, for a view with a given
 *   name, with navigation between views and saving replaced by spies. A
 *   test then checks what the real store holds (the recorded data).
 */
import { reactive } from 'vue'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { vi } from 'vitest'
import { setActivePinia } from 'pinia'
import { useNuxtApp, useRoute } from '#imports'
import useSmileStore from '../../src/runtime/stores/smilestore'
import useViewAPI from '../../src/runtime/composables/useViewAPI'

// Every module component, by file name
const modules = import.meta.glob([
  '../../src/runtime/components/ui/**/*.vue',
  '../../src/runtime/components/forms/**/*.vue',
  '../../src/runtime/components/layouts/**/*.vue',
  '../../src/runtime/components/builtins/**/*.vue',
], { eager: true })

export const moduleComponents = Object.fromEntries(
  Object.entries(modules).map(([path, mod]) => [path.split('/').pop().replace(/\.vue$/, ''), mod.default]),
)

/**
 * The real smilestore on a testing Pinia (actions are spies that do nothing).
 * @param {(store: object) => void} [setup] - Sets the state the test needs
 * @returns {{ pinia: object, store: object }} The Pinia and its store
 */
export function createStore(setup) {
  const pinia = createTestingPinia({ stubActions: true, createSpy: vi.fn })
  const store = useSmileStore(pinia)
  if (setup) setup(store)
  return { pinia, store }
}

/**
 * A stand-in for the API object the composables return.
 * @param {object} store - The store from createStore
 * @param {object} [overrides] - Members to add or replace
 * @returns {object} The fake API (reactive, so a test can change it after mounting)
 */
export function createFakeApi(store, overrides = {}) {
  const log = { debug: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }
  return reactive({
    store,
    config: { anonymousMode: false, responsiveUI: true, labURL: 'https://lab.example', brandLogoFn: 'logo.png', mode: 'development' },
    log,
    syncStatus: { status: 'saved', error: null },
    persist: reactive({}),
    sync: vi.fn(async () => ({ ok: true })),
    goNextView: vi.fn(),
    goToView: vi.fn(),
    goNextStep: vi.fn(),
    goPrevStep: vi.fn(),
    goFirstStep: vi.fn(),
    hasNextStep: vi.fn(() => false),
    recordPageData: vi.fn(),
    recordForm: vi.fn(),
    recordProperty: vi.fn(),
    setCompletionCode: vi.fn(),
    computeCompletionCode: vi.fn(() => 'CODE-123'),
    getRecruitmentService: vi.fn(() => 'web'),
    getPublicUrl: vi.fn(name => `/public/${name}`),
    getCoreStaticUrl: vi.fn(name => `/static/${name}`),
    setAutofill: vi.fn(),
    removeAutofill: vi.fn(),
    ...overrides,
  })
}

/**
 * Mounts a component as it runs in an app: module components registered
 * globally, the given Pinia installed.
 * @param {object} component - The component
 * @param {object} [options] - `pinia` (from createStore), `stubs`, and any mount option
 * @returns {object} The wrapper
 */
export function mountComponent(component, options = {}) {
  const { pinia, stubs = {}, global = {}, ...rest } = options
  return mount(component, {
    ...rest,
    global: {
      plugins: [pinia ?? createStore().pinia],
      components: moduleComponents,
      stubs,
      ...global,
    },
  })
}

/**
 * The real view API for one view, as the app's page would have it.
 * Navigation between views and saving are spies; everything else is real
 * (the stepper, the recorded data, the store's actions).
 * @param {string} [viewName] - The view's name in the timeline
 * @param {object} [config] - Config values to set on the store
 * @returns {{ pinia: object, store: object, api: object }} The Pinia, its store and the view API
 */
export function setupViewAPI(viewName = 'testview', config = {}) {
  const view = { name: viewName, path: `/${viewName}`, meta: {} }
  vi.mocked(useRoute).mockReturnValue({ path: view.path, name: viewName, query: {}, params: {} })
  vi.mocked(useNuxtApp).mockReturnValue({
    $timeline: { getViewForPath: () => view, getRouteByName: () => view },
  })
  const pinia = createTestingPinia({ stubActions: false, createSpy: vi.fn })
  setActivePinia(pinia)
  const store = useSmileStore(pinia)
  store.config = {
    ...store.config,
    responsiveUI: true,
    anonymousMode: false,
    windowsizerRequest: { width: 800, height: 600 },
    ...config,
  }
  useViewAPI._reset()
  const api = useViewAPI()
  for (const name of ['goNextView', 'goPrevView', 'goToView']) {
    vi.spyOn(api, name).mockImplementation(() => {})
  }
  vi.spyOn(api, 'sync').mockImplementation(async () => ({ ok: true }))
  return { pinia, store, api }
}
