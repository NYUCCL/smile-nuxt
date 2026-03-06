import { vi } from 'vitest'

// Debug flag for controlling console output in tests
export const DEBUG = false

// Mock log store — used by many modules
vi.mock('../../src/runtime/stores/log', () => {
  const mockLogFn =
    (type) =>
    (...args) => {
      if (DEBUG) {
        switch (type) {
          case 'error':
            console.error(...args)
            break
          case 'warn':
            console.warn(...args)
            break
          default:
            console.log(`[${type}]`, ...args)
        }
      }
    }

  return {
    default: vi.fn().mockReturnValue({
      history: [],
      page_history: [],
      addToHistory: vi.fn(),
      clearPageHistory: vi.fn(),
      log: vi.fn(mockLogFn('log')),
      debug: vi.fn(mockLogFn('debug')),
      warn: vi.fn(mockLogFn('warn')),
      error: vi.fn(mockLogFn('error')),
      success: vi.fn(mockLogFn('success')),
    }),
  }
})

// Mock axios for getBrowserFingerprint
vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { ip: '127.0.0.1' } }),
  },
}))

// Mock Nuxt auto-imports used by runtime code
vi.mock('#imports', () => ({
  defineNuxtPlugin: (fn) => fn,
  defineNuxtRouteMiddleware: (fn) => fn,
  useNuxtApp: vi.fn(() => ({ $timeline: null })),
  useRoute: vi.fn(() => ({ path: '/', name: 'index', query: {}, params: {} })),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), getRoutes: vi.fn(() => []) })),
  navigateTo: vi.fn((path, opts) => ({ __navigateTo: true, path, opts })),
  abortNavigation: vi.fn(() => ({ __abortNavigation: true })),
  useCookie: vi.fn((name, opts) => {
    const val = opts?.default?.() ?? null
    return { value: val }
  }),
  useRuntimeConfig: vi.fn(() => ({
    public: {
      smile: { codeName: 'test', projectRef: 'test-project' },
      deployBasePath: '/test/',
    },
  })),
}))

// Setup global browser APIs
export function setupBrowserEnvironment() {
  Object.defineProperty(window, 'location', {
    value: {
      href: 'http://localhost:3000',
      search: '',
      pathname: '/',
      hash: '',
    },
    writable: true,
  })

  import.meta.env.VITE_DEPLOY_BASE_PATH = '/test/'
}
