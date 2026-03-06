import { computed, ref } from 'vue'
import { vi } from 'vitest'

// Debug flag for controlling console output in tests
export const DEBUG = false

// Mock Firebase-related methods
vi.mock('@/core/stores/firestore-db', () => {
  if (DEBUG) console.log('Mocking firestore-db...')
  return {
    createDoc: vi.fn().mockResolvedValue({ id: 'test-doc-id' }),
    createPrivateDoc: vi.fn().mockResolvedValue({ id: 'test-private-doc-id' }),
    updateSubjectDataRecord: vi.fn().mockResolvedValue(true),
    updatePrivateSubjectDataRecord: vi.fn().mockResolvedValue(true),
    loadDoc: vi.fn().mockResolvedValue({ data: () => ({ test: 'data' }) }),
    fsnow: vi.fn().mockReturnValue(new Date().toISOString()),
  }
})

// Mock log store
vi.mock('@/core/stores/log', () => {
  if (DEBUG) console.log('Mocking log store...')
  const mockLogFn =
    (type) =>
    (...args) => {
      // Always call the appropriate console method
      switch (type) {
        case 'error':
          if (DEBUG) {
            console.error(...args)
          }
          break
        case 'warn':
          if (DEBUG) {
            console.warn(...args)
          }
          break
        default:
          if (DEBUG) {
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
vi.mock('axios', () => {
  if (DEBUG) console.log('Mocking axios...')
  return {
    default: {
      get: vi.fn().mockResolvedValue({ data: { ip: '127.0.0.1' } }),
    },
  }
})

// Mock randomization functions
vi.mock('@/core/utils/randomization', () => {
  if (DEBUG) console.log('Mocking randomization...')
  return {
    randomInt: vi.fn(),
    shuffle: vi.fn(),
    sampleWithReplacement: vi.fn((arr) => arr[0]),
    sampleWithoutReplacement: vi.fn(),
    fakerDistributions: {},
  }
})

// Mock meta.env
// vi.mock('@/core/config', () => {
//   if (DEBUG) console.log('Mocking config...')
//   return {
//     default: {
//       mode: 'development',
//       localStorageKey: 'smile_test',
//       windowsizerAggressive: false,
//       windowsizerRequest: { width: 800, height: 600 },
//       maxWrites: 100,
//       minWriteInterval: 1000,
//       devLocalStorageKey: 'smile_dev_test',
//     },
//   }
// })

// Setup global browser APIs
export function setupBrowserEnvironment() {
  // Mock localStorage
  // Object.defineProperty(window, 'localStorage', {
  //   value: {
  //     getItem: vi.fn((key) => {
  //       if (key === 'smile_seed') return 'test-seed'
  //       return null
  //     }),
  //     setItem: vi.fn(),
  //     removeItem: vi.fn(),
  //     clear: vi.fn(),
  //   },
  //   writable: true,
  // })

  // Mock window.location
  Object.defineProperty(window, 'location', {
    value: {
      href: 'http://localhost:3000',
      search: '',
      pathname: '/',
      hash: '',
    },
    writable: true,
  })

  // Mock import.meta.env
  import.meta.env = {
    VITE_DEPLOY_BASE_PATH: '/test/',
  }

  // Mock import.meta.url
  import.meta.url = 'http://localhost:3000/src/core/composables/useAPI.js'
}

// Export mock implementations for direct access if needed
// export const mockImplementations = {
//   useAPI: vi.mocked(require('@/core/composables/useAPI').default),
//   smilestore: vi.mocked(require('@/core/stores/smilestore').default),
//   // Add other mocked modules as needed
// }
