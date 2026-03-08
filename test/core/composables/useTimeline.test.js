/* eslint-disable no-undef */
import { defineComponent, h } from 'vue'
import { createTestingPinia } from '@pinia/testing'
import { createRouter, createWebHashHistory } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import { navigateTo, useNuxtApp, useRoute } from '#imports'
import useTimeline from '@/core/composables/useTimeline'

// Shared mutable route object — useRoute() returns this, and tests mutate it
const mockRoute = { path: '/', name: 'home', query: {}, params: {} }
vi.mocked(useRoute).mockReturnValue(mockRoute)

// Route config for the mock timeline
const timelineRoutes = [
  {
    path: '/',
    name: 'home',
    meta: { next: 'about' },
  },
  {
    path: '/about',
    name: 'about',
    meta: { prev: 'home', next: 'contact' },
  },
  {
    path: '/contact',
    name: 'contact',
    meta: { prev: 'about' },
  },
]

// Create a mock $timeline that mimics the real Timeline API
const mockTimeline = {
  getViewForPath: vi.fn((path) => {
    return timelineRoutes.find(r => r.path === path) || null
  }),
  getRouteByName: vi.fn((name) => {
    return timelineRoutes.find(r => r.name === name) || null
  }),
}

// Create mock stores
const mockSmilestore = {
  browserEphemeral: {
    forceNavigate: false,
    currentViewDone: false,
  },
  dev: {
    currentViewDone: false,
  },
  config: {
    autoSave: false,
  },
  saveData: vi.fn(),
}

const mockLog = {
  log: vi.fn(),
}

// Mock the stores
vi.mock('@/core/stores/smilestore', () => ({
  default: () => mockSmilestore,
}))

vi.mock('@/core/stores/log', () => ({
  default: () => mockLog,
}))

// Override useNuxtApp to return our mock timeline
vi.mocked(useNuxtApp).mockReturnValue({ $timeline: mockTimeline })

// Create a test component that uses the composable
const TestComponent = defineComponent({
  setup() {
    const timeline = useTimeline()
    return { timeline }
  },
  render() {
    return h('div')
  },
})

// Create mock route components
const MockComponent = defineComponent({
  render() {
    return h('div', 'Mock Page')
  },
})

// Define test routes (for Vue Router — composable uses $timeline for lookups)
const routes = [
  { path: '/', name: 'home', component: MockComponent },
  { path: '/about', name: 'about', component: MockComponent },
  { path: '/contact', name: 'contact', component: MockComponent },
]

describe('useTimeline composable', () => {
  let router
  let wrapper
  let pinia

  beforeEach(() => {
    // Reset mock state
    mockSmilestore.browserEphemeral.forceNavigate = false
    mockSmilestore.browserEphemeral.currentViewDone = false
    mockSmilestore.dev.currentViewDone = false
    mockSmilestore.config.autoSave = false
    vi.clearAllMocks()
    vi.mocked(useNuxtApp).mockReturnValue({ $timeline: mockTimeline })
    vi.mocked(useRoute).mockReturnValue(mockRoute)
    // Reset mock route to home
    mockRoute.path = '/'
    mockRoute.name = 'home'
    mockRoute.query = {}

    // Create a fresh router for each test
    router = createRouter({
      history: createWebHashHistory(),
      routes,
    })

    // Create a fresh pinia for each test
    pinia = createTestingPinia({
      createSpy: vi.fn,
    })

    // Mount the test component
    wrapper = mount(TestComponent, {
      global: {
        plugins: [router, pinia],
        stubs: {
          RouterLink: true,
        },
      },
    })
  })

  afterEach(() => {
    wrapper.unmount()
  })

  it('should provide the expected methods', () => {
    const { timeline } = wrapper.vm
    expect(timeline).toBeDefined()
    expect(timeline.goNextView).toBeInstanceOf(Function)
    expect(timeline.goPrevView).toBeInstanceOf(Function)
    expect(timeline.goToView).toBeInstanceOf(Function)
    expect(timeline.lookupNext).toBeInstanceOf(Function)
  })

  it('should navigate to the next view', async () => {
    await router.push({ name: 'home' })
    await flushPromises()

    const { timeline } = wrapper.vm
    timeline.goNextView()

    // New impl uses navigateTo with path objects
    expect(navigateTo).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/about' }),
    )
    expect(mockSmilestore.browserEphemeral.currentViewDone).toBe(true)
  })

  it('should navigate to the previous view', async () => {
    await router.push({ name: 'about' })
    await flushPromises()
    // Update shared mock route to reflect current path
    mockRoute.path = '/about'
    mockRoute.name = 'about'

    const { timeline } = wrapper.vm
    timeline.goPrevView()

    expect(navigateTo).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/' }),
    )
    expect(mockSmilestore.browserEphemeral.currentViewDone).toBe(true)
  })

  it('should execute callback function when navigating', async () => {
    await router.push({ name: 'home' })
    await flushPromises()

    const callbackFn = vi.fn()
    const { timeline } = wrapper.vm

    timeline.goNextView(callbackFn)

    expect(callbackFn).toHaveBeenCalled()
  })

  it('should navigate to a specific view with force=true by default', async () => {
    const { timeline } = wrapper.vm

    await timeline.goToView('about')

    expect(navigateTo).toHaveBeenCalledWith('/about')
    expect(mockSmilestore.browserEphemeral.forceNavigate).toBe(false) // Reset after navigation
  })

  it('should navigate to a specific view with force=false', async () => {
    const { timeline } = wrapper.vm

    await timeline.goToView('contact', false)

    expect(navigateTo).toHaveBeenCalledWith('/contact')
    expect(mockSmilestore.browserEphemeral.forceNavigate).toBe(false) // Should remain false
  })

  it('should lookup the next route correctly', async () => {
    const { timeline } = wrapper.vm

    const nextRoute = timeline.lookupNext('home')

    expect(nextRoute).toEqual(
      expect.objectContaining({ path: '/about' }),
    )
  })

  it('should return null when looking up a non-existent route', () => {
    const { timeline } = wrapper.vm

    const nextRoute = timeline.lookupNext('non-existent-route')

    expect(nextRoute).toBeNull()
  })

  it('should return null when the route has no next property', () => {
    const { timeline } = wrapper.vm

    const nextRoute = timeline.lookupNext('contact')

    expect(nextRoute).toBeNull()
  })

  it('should save data when autoSave is enabled', async () => {
    mockSmilestore.config.autoSave = true

    await router.push({ name: 'home' })
    await flushPromises()

    const { timeline } = wrapper.vm

    timeline.goNextView()

    expect(mockSmilestore.saveData).toHaveBeenCalled()
    expect(mockLog.log).toHaveBeenCalledWith('TIMELINE STEPPER: Attempting auto saving on navigation')
  })

  it('should not save data when autoSave is disabled', async () => {
    mockSmilestore.config.autoSave = false

    await router.push({ name: 'home' })
    await flushPromises()

    const { timeline } = wrapper.vm

    timeline.goNextView()

    expect(mockSmilestore.saveData).not.toHaveBeenCalled()
  })
})
