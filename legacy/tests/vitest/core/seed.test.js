/* eslint-disable no-undef */

import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import { mount } from '@vue/test-utils'
import seedrandom from 'seedrandom'
import Timeline from '@/core/timeline/Timeline'
import useAPI from '@/core/composables/useAPI'
import { defineComponent } from 'vue'
import useSmileStore from '@/core/stores/smilestore'

describe('Seed tests', () => {
  let router
  let pinia
  let api

  beforeEach(() => {
    // Create a router instance
    router = createRouter({
      history: createWebHashHistory(),
      routes: [{ path: '/', component: { template: '<div>Home</div>' } }],
    })

    // Create a test component that uses the API
    const TestComponent = defineComponent({
      setup() {
        api = useAPI()
        return { api }
      },
      template: '<div>Test Component</div>',
    })

    // Create pinia instance
    pinia = createTestingPinia({ stubActions: true })
    setActivePinia(pinia)

    // Mount the test component with router
    const wrapper = mount(TestComponent, {
      global: {
        plugins: [[router], [pinia]], // Provide as arrays of plugins
      },
    })
  })

  it('should return true', () => {
    expect(true).toBe(true)
  })

  it('should save automatic seed to smilestore.browserPersisted.seedID', async () => {
    const MockComponent = { template: '<div>Mock Component</div>' }

    const timeline = new Timeline(api)

    timeline.pushSeqView({
      path: '/welcome',
      name: 'welcome_anonymous',
      component: MockComponent,
    })

    timeline.pushSeqView({
      path: '/second',
      name: 'second',
      component: MockComponent,
    })

    timeline.build()
    const { routes } = timeline

    await router.isReady()

    // expect seed to not be an empty string
    const smilestore = useSmileStore() // uses the testing pinia!
    expect(smilestore.browserPersisted.seedID).not.toEqual('')
  })

  it('should reproduce same random number when seed is reset', () => {
    seedrandom('testseed', { global: true })
    const testrand1 = Math.random()

    seedrandom('testseed', { global: true })
    const testrand2 = Math.random()

    expect(testrand1).toBe(testrand2)
  })
})
