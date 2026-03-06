/* eslint-disable no-undef */
// general testing functions
import { defineComponent } from 'vue'
import { setActivePinia } from 'pinia'
import { createTestingPinia } from '@pinia/testing'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHashHistory, useRoute } from 'vue-router'
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest'

// import shared mocks
import '../../setup/mocks' // Import shared mocks
import { setupBrowserEnvironment } from '../../setup/mocks'

// Mock the config import
vi.mock('@/core/config', () => ({
  default: {
    maxSteps: 5000,
  },
}))

// import the composable
import useStepper from '@/core/composables/useStepper'
import useSmileStore from '@/core/stores/smilestore'
import useLog from '@/core/stores/log'

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
      const route = useRoute()
      const stepper = useStepper(route.name)
      return { stepper }
    },
    template: `<div>${text}</div>`,
  })

// Define test routes
const routes = [
  {
    path: '/',
    name: 'welcome_anonymous',
    component: MockComponent('Welcome Anonymous'),
    meta: { next: 'landing', allowAlways: true },
  },
  {
    path: '/landing',
    name: 'landing',
    component: MockComponent('Landing'),
    meta: { prev: 'welcome_anonymous', next: 'test', sequential: true },
  },
  {
    path: '/test',
    name: 'test',
    component: MockComponent('Test'),
    meta: { prev: 'landing', sequential: true },
  },
]

// Create a mock serialized state
const mockSerializedState = {
  stepperState: {
    id: '/',
    currentIndex: 0,
    depth: 0,
    shuffled: false,
    states: [
      {
        id: 'survey_page1',
        currentIndex: 0,
        depth: 1,
        shuffled: false,
        states: [],
        data: {
          id: 'survey_page1',
        },
      },
      {
        id: 'survey_page2',
        currentIndex: 0,
        depth: 1,
        shuffled: false,
        states: [],
        data: {
          id: 'survey_page2',
        },
      },
      {
        id: 'survey_page3',
        currentIndex: 0,
        depth: 1,
        shuffled: false,
        states: [],
        data: {
          id: 'survey_page3',
        },
      },
    ],
    data: {
      gvars: {
        forminfo: {
          dob: '',
          gender: '',
          race: '',
          hispanic: '',
          fluent_english: '',
          normal_vision: '',
          color_blind: '',
          learning_disability: '',
          neurodevelopmental_disorder: '',
          psychiatric_disorder: '',
          country: '',
          zipcode: '',
          education_level: '',
          household_income: '',
        },
      },
    },
  },
}

// Create a mock serialized state
const mockInvalidSerializedState = {
  stepperState: {
    pathname: '/',
    current_index: 1,
    depth: 0,
    shuffled: false,
    nodes: [
      { id: '1', data: { type: 'trial', id: 1 }, next: '2' },
      { id: '2', data: { type: 'trial', id: 2 } },
    ],
    data: {},
  },
}

// Helper function to set up Pinia
const setupPinia = () => {
  const pinia = createTestingPinia({
    stubActions: false,
    createSpy: vi.fn,
  })
  setActivePinia(pinia)
  return pinia
}

// Helper function to get the stepper instance for the current route
const getCurrentRouteStepper = (router, wrapper) => {
  const currentRoute = router.currentRoute.value
  const mockComponent = wrapper.findComponent(currentRoute.matched[0].components.default)
  expect(mockComponent.exists()).toBe(true)
  return mockComponent.vm.stepper
}

// Helper function to set up test environment
const setupTestEnvironment = async (pinia) => {
  // Reset mock state
  vi.clearAllMocks()

  // Get smilestore instance
  const smilestore = useSmileStore()

  // Create a fresh router
  const router = createRouter({
    history: createWebHashHistory(),
    routes,
  })

  // Mount the test component
  const wrapper = mount(TestComponent, {
    global: {
      plugins: [pinia, router],
      stubs: {
        RouterLink: true,
      },
    },
  })

  // Navigate to the first route and wait for it to be ready
  await router.push('/')
  await router.isReady()
  await flushPromises()

  return {
    router,
    wrapper,
    smilestore,
    getCurrentRouteStepper: () => getCurrentRouteStepper(router, wrapper),
  }
}

// Helper function to set up test environment with serialized state
const setupTestEnvironmentWithSerializedState = async (pinia, mockSerializedState) => {
  // Reset mock state
  vi.clearAllMocks()

  // Get smilestore instance
  const smilestore = useSmileStore()

  // Set up the mock state in smilestore
  smilestore.browserPersisted.viewSteppers['welcome_anonymous'] = {
    data: mockSerializedState,
  }

  // Create a fresh router
  const router = createRouter({
    history: createWebHashHistory(),
    routes,
  })

  // Mount the test component
  const wrapper = mount(TestComponent, {
    global: {
      plugins: [pinia, router],
      stubs: {
        RouterLink: true,
      },
    },
  })

  // Navigate to the first route and wait for it to be ready
  await router.push('/')
  await router.isReady()
  await flushPromises()

  return {
    router,
    wrapper,
    smilestore,
    getCurrentRouteStepper: () => getCurrentRouteStepper(router, wrapper),
  }
}

describe('useStepper composable', () => {
  let testEnv = null
  let pinia = null

  beforeAll(() => {
    setupBrowserEnvironment()
  })

  beforeEach(async () => {
    // Create and set up Pinia first
    pinia = setupPinia()

    // Now we can safely access the store
    const smilestore = useSmileStore()

    // you do have to do this because the store is not reset between tests
    // because the composable is not reset between calls to useSmileStore
    smilestore.browserEphemeral.steppers = {}
    smilestore.browserPersisted.viewSteppers = {}
    smilestore.dev.viewProvidesStepper = false
    expect(smilestore.browserEphemeral.steppers).toEqual({})
    expect(smilestore.browserPersisted.viewSteppers).toEqual({})
    expect(smilestore.dev.viewProvidesStepper).toEqual(false)
  })

  afterEach(async () => {
    // Clean up after each test
    if (testEnv?.wrapper) {
      await testEnv.wrapper.unmount()
    }
    testEnv = null
  })

  describe('basic functionality', () => {
    it('should create a new stepper instance when none exists', async () => {
      testEnv = await setupTestEnvironment(pinia)
      const { getCurrentRouteStepper, smilestore } = testEnv

      const stepper = getCurrentRouteStepper()
      expect(stepper).toBeDefined()
      expect(stepper.name).toBe('welcome_anonymous')
      expect(smilestore.dev.viewProvidesStepper).toBe(true)
    })

    it('should reuse existing stepper instance when revisiting a view', async () => {
      testEnv = await setupTestEnvironment(pinia)
      const { router, getCurrentRouteStepper } = testEnv

      // Get initial stepper
      const initialStepper = getCurrentRouteStepper()

      // Navigate away and back
      await router.push('/landing')
      await router.push('/')
      await flushPromises()

      // Get new stepper instance
      const newStepper = getCurrentRouteStepper()

      // Verify it's the same instance
      expect(newStepper).toBe(initialStepper)
    })
  })

  describe('serialized state handling', () => {
    it('should load stepper from serialized state', async () => {
      testEnv = await setupTestEnvironmentWithSerializedState(pinia, mockSerializedState)
      const { getCurrentRouteStepper } = testEnv

      // Get stepper instance
      const stepper = getCurrentRouteStepper()

      // Verify stepper loaded the serialized state
      expect(stepper.dataAlongPath).toEqual([{ id: 'survey_page1' }])
      expect(stepper.index).toBe(0)

      // Verify navigation works
      stepper.next()
      expect(stepper.dataAlongPath).toEqual([{ id: 'survey_page2' }])
      expect(stepper.index).toBe(1)
    })

    it('should create new stepper when serialized state is invalid', async () => {
      const log = useLog()
      testEnv = await setupTestEnvironmentWithSerializedState(pinia, mockInvalidSerializedState)
      const { getCurrentRouteStepper } = testEnv

      // Get stepper instance
      const stepper = getCurrentRouteStepper()

      // Verify new stepper was created with default state
      expect(stepper).toBeDefined()
      expect(stepper.name).toBe('welcome_anonymous')
      expect(stepper.dataAlongPath).toEqual([])
      expect(stepper.index).toBe(0)

      // Verify error was logged with the correct message
      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining('STEPPER: Failed to load saved state'),
        expect.stringContaining('Missing required fields in data')
      )
    })

    it('should preserve stepper state across route changes', async () => {
      testEnv = await setupTestEnvironmentWithSerializedState(pinia, mockSerializedState)
      const { router, getCurrentRouteStepper, smilestore } = testEnv

      // Get initial stepper
      const initialStepper = getCurrentRouteStepper()
      expect(initialStepper.dataAlongPath).toEqual([{ id: 'survey_page1' }])

      // Navigate to next step
      initialStepper.next()
      expect(initialStepper.dataAlongPath).toEqual([{ id: 'survey_page2' }])

      // Navigate to different route and back
      await router.push('/landing')
      await router.push('/')
      await flushPromises()

      // Get new stepper instance
      const newStepper = getCurrentRouteStepper()

      // Verify state was preserved
      expect(newStepper.dataAlongPath).toEqual([{ id: 'survey_page2' }])
      expect(newStepper.index).toBe(1)
    })
  })
})
