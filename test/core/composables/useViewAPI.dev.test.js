// general testing functions
import { defineComponent, h } from 'vue'
import { setActivePinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import { createTestingPinia } from '@pinia/testing'
import { mount, flushPromises } from '@vue/test-utils'
import { vi, describe, beforeEach, afterEach, it, expect } from 'vitest'

// import shared mocks
import '../../setup/mocks' // Import shared mocks
import { setupBrowserEnvironment } from '../../setup/mocks'

/* eslint-disable no-undef */
// Mock the config import before any other imports
vi.mock('@/core/config', () => ({
  default: {
    mode: 'development',
  },
}))

// import the composable
import useViewAPI from '@/core/composables/useViewAPI'

// Helper function to set up Pinia
const setupPinia = () => {
  const pinia = createTestingPinia({
    stubActions: false,
    createSpy: vi.fn,
  })
  setActivePinia(pinia)
  return pinia
}

// Helper function to get mock component and its API
const getMockComponentAndAPI = (wrapper) => {
  const mockComponent = wrapper.findComponent({ name: 'MockComponent' })
  return {
    component: mockComponent,
    api: mockComponent.vm.api,
  }
}

// Create a test component that uses the composable
const TestComponent = defineComponent({
  template: `
<div>
  <router-view></router-view>
</div>
`,
})

// Create a mock component for routes
const MockComponent = (text = 'Mock Component') =>
  defineComponent({
    name: 'MockComponent',
    setup() {
      const api = useViewAPI()
      return { api }
    },
    template: `<div>${text}</div>`,
  })

// Define test routes
const routes = [
  {
    id: '/',
    name: 'welcome_anonymous',
    component: MockComponent('Welcome Anonymous'),
    meta: { next: 'landing', allowAlways: true },
  },
  {
    id: '/landing',
    name: 'landing',
    component: MockComponent('Landing'),
    meta: { prev: 'welcome_anonymous', next: 'test', sequential: true },
  },
  {
    id: '/test',
    name: 'test',
    component: MockComponent('Test'),
    meta: { prev: 'landing', sequential: true },
  },
]

describe('useViewAPI composable in development mode', () => {
  let wrapper

  beforeAll(() => {
    setupBrowserEnvironment()
  })

  beforeEach(async () => {
    // Reset the ViewAPI instance
    useViewAPI._reset()
    // Reset mock state
    vi.clearAllMocks()

    // Create pinia instance
    const pinia = setupPinia()

    // Create a fresh router for each test
    const router = createRouter({
      history: createWebHashHistory(),
      routes,
    })

    // Mount the test component
    wrapper = mount(TestComponent, {
      global: {
        plugins: [router, pinia],
        stus: {
          RouterLink: true,
        },
      },
    })

    // Navigate to the first route and wait for it to be ready
    await router.push('/')
    await router.isReady()
    await flushPromises()
  })

  afterEach(() => {
    // Clear any persisted state
    const { api } = getMockComponentAndAPI(wrapper)
    if (api) {
      api.clear()
      api.clearPersist()
    }
    wrapper.unmount()
  })

  it('should handle keyboard navigation in development mode', async () => {
    const { api } = getMockComponentAndAPI(wrapper)

    // Add steps using api.steps
    api.steps.append([
      { id: 'step1', test: 'value' },
      { id: 'step2', test: 'value2' },
    ])

    expect(api.config.mode).toBe('development')
    // Verify initial state
    expect(api.pathString).toBe('step1')
    expect(api.stepData).toEqual({ id: 'step1', test: 'value' })

    // Simulate right arrow key press
    const rightEvent = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
    })
    document.dispatchEvent(rightEvent)
    await flushPromises()

    // Verify we moved to next step
    expect(api.pathString).toBe('step2')
    expect(api.stepData).toEqual({ id: 'step2', test: 'value2' })

    // Simulate left arrow key press
    const leftEvent = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
    })
    document.dispatchEvent(leftEvent)
    await flushPromises()

    // Verify we moved back to previous step
    expect(api.pathString).toBe('step1')
    expect(api.stepData).toEqual({ id: 'step1', test: 'value' })
  })
})
