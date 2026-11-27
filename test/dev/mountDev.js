/**
 * Helpers for the dev tools' component tests (navbar, menu, palette,
 * presentation). Built on test/components/mount.js.
 *
 * The dev tools get the study through useAPI(). A test file points it at
 * `devApi`:
 *
 *     const fake = vi.hoisted(() => ({ api: null }))
 *     vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))
 *     fake.api = devApi
 *
 * `devApi` is one object for the whole file, refilled by `setupDev` for each
 * test. It has to be the same object every time: composables/useColorMode.js
 * calls useAPI() once and keeps what it got, so a new object per test would
 * leave the color mode reading the first test's store.
 */
import { reactive, toRaw } from 'vue'
import { vi } from 'vitest'
import { createStore, createFakeApi } from '../components/mount'

export { mountComponent } from '../components/mount'

/** The object useAPI() returns in a dev tools test file */
export const devApi = reactive({})

/**
 * Makes a new store and refills `devApi` with spies for the methods the dev
 * tools call.
 * @param {object} [options] - What to set
 * @param {(store: object) => void} [options.setup] - Sets store state
 * @param {object} [options.api] - API members to add or replace
 * @returns {{ pinia: object, store: object, api: object }} The Pinia, the store and `devApi`
 */
export function setupDev({ setup, api: overrides = {} } = {}) {
  const { pinia, store } = createStore(setup)
  for (const key of Object.keys(devApi)) delete devApi[key]
  Object.assign(devApi, toRaw(createFakeApi(store, {
    route: { path: '/dev/task', meta: {} },
    currentRouteName: vi.fn(() => 'task'),
    currentViewName: vi.fn(() => 'task'),
    _resolveTimelineRoute: vi.fn(() => ({ name: 'task', meta: {} })),
    reloadBrowser: vi.fn(),
    resetLocalState: vi.fn(),
    connectDB: vi.fn(),
    setKnown: vi.fn(),
    setConsented: vi.fn(),
    hasAutofill: vi.fn(() => false),
    autofill: vi.fn(),
    hasPrevView: vi.fn(() => false),
    hasNextView: vi.fn(() => false),
    nextView: vi.fn(() => null),
    prevView: vi.fn(() => null),
    ...overrides,
  })))
  return { pinia, store, api: devApi }
}

/**
 * Stubs that put content in the page that reka-ui only renders while a
 * tooltip or menu is open (they don't open in happy-dom).
 */
export const openStubs = {
  TooltipContent: { template: '<div data-testid="tooltip"><slot /></div>' },
  DropdownMenuContent: { template: '<div data-testid="menu"><slot /></div>' },
  DropdownMenuItem: { template: '<div data-testid="menu-item"><slot /></div>' },
  PopoverContent: { template: '<div data-testid="popover"><slot /></div>' },
}

/**
 * Sends a key event to the window, as a key press anywhere on the page.
 * @param {string} key - The key
 * @param {object} [init] - Other KeyboardEvent fields (ctrlKey, …) and `type` (default keydown)
 * @returns {KeyboardEvent} The event, after it was dispatched
 */
export function pressKey(key, { type = 'keydown', target = window, ...init } = {}) {
  const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}
