/* eslint-disable no-undef */
import { defineComponent, h } from 'vue'
import { createTestingPinia } from '@pinia/testing'
import { createRouter, createWebHashHistory } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import useTimeline from '@/core/composables/useTimeline'
import { vi, describe, beforeEach, afterEach, it, expect } from 'vitest'

// Create mock stores
const mockSmilestore = {
  browserEphemeral: {
    forceNavigate: false,
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

let router
let wrapper
let pinia

// Define test routes
const routes = [
  {
    path: '/',
    name: 'home',
    component: MockComponent,
    meta: { next: 'about' },
  },
  {
    path: '/about',
    name: 'about',
    component: MockComponent,
    meta: { prev: 'home', next: 'contact' },
  },
  {
    path: '/contact',
    name: 'contact',
    component: MockComponent,
    meta: { prev: 'about' },
  },
]

describe('useTimeline composable', () => {
  beforeEach(() => {
    // Reset mock state
    mockSmilestore.browserEphemeral.forceNavigate = false
    mockSmilestore.dev.currentViewDone = false
    mockSmilestore.config.autoSave = false
    vi.clearAllMocks()

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
    // Navigate to home first
    await router.push({ name: 'home' })

    const routerPushSpy = vi.spyOn(router, 'push')
    const { timeline } = wrapper.vm

    timeline.goNextView()

    expect(routerPushSpy).toHaveBeenCalledWith({
      name: 'about',
      query: {},
    })
    expect(mockSmilestore.dev.currentViewDone).toBe(true)
  })

  it('should navigate to the previous view', async () => {
    // Navigate to about first
    await router.push({ name: 'about' })

    const routerPushSpy = vi.spyOn(router, 'push')
    const { timeline } = wrapper.vm

    timeline.goPrevView()

    expect(routerPushSpy).toHaveBeenCalledWith({
      name: 'home',
      query: {},
    })
    expect(mockSmilestore.dev.currentViewDone).toBe(true)
  })

  it('should execute callback function when navigating', async () => {
    await router.push({ name: 'home' })

    const callbackFn = vi.fn()
    const { timeline } = wrapper.vm

    timeline.goNextView(callbackFn)

    expect(callbackFn).toHaveBeenCalled()
  })

  it('should navigate to a specific view with force=true by default', async () => {
    const routerPushSpy = vi.spyOn(router, 'push')
    const { timeline } = wrapper.vm

    await timeline.goToView('about')

    expect(routerPushSpy).toHaveBeenCalledWith({ name: 'about' })
    expect(mockSmilestore.browserEphemeral.forceNavigate).toBe(false) // Should be reset after navigation
  })

  it('should navigate to a specific view with force=false', async () => {
    const routerPushSpy = vi.spyOn(router, 'push')
    const { timeline } = wrapper.vm

    await timeline.goToView('contact', false)

    expect(routerPushSpy).toHaveBeenCalledWith({ name: 'contact' })
    expect(mockSmilestore.browserEphemeral.forceNavigate).toBe(false) // Should remain false
  })

  it('should lookup the next route correctly', async () => {
    const { timeline } = wrapper.vm

    const nextRoute = timeline.lookupNext('home')

    expect(nextRoute).toEqual({
      name: 'about',
      query: {},
    })
  })

  it('should return null when looking up a non-existent route', () => {
    const { timeline } = wrapper.vm

    const nextRoute = timeline.lookupNext('non-existent-route')

    expect(nextRoute).toBeNull()
  })

  it('should return null when the route has no next property', async () => {
    const { timeline } = wrapper.vm

    const nextRoute = timeline.lookupNext('contact')

    expect(nextRoute).toBeNull()
  })

  it('should save data when autoSave is enabled', async () => {
    // Enable autoSave
    mockSmilestore.config.autoSave = true

    await router.push({ name: 'home' })

    const { timeline } = wrapper.vm

    timeline.goNextView()

    expect(mockSmilestore.saveData).toHaveBeenCalled()
    expect(mockLog.log).toHaveBeenCalledWith('TIMELINE STEPPER: Attempting auto saving on navigateTo() navigation')
  })

  it('should not save data when autoSave is disabled', async () => {
    // Ensure autoSave is disabled
    mockSmilestore.config.autoSave = false

    await router.push({ name: 'home' })

    const { timeline } = wrapper.vm

    timeline.goNextView()

    expect(mockSmilestore.saveData).not.toHaveBeenCalled()
  })
})
