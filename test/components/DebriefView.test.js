import { describe, it, expect, vi } from 'vitest'
import { h } from 'vue'
import DebriefView from '../../src/runtime/components/builtins/DebriefView.vue'
import ExpView from '../../src/runtime/components/builtins/ExpView.vue'
import { createStore, createFakeApi, mountComponent } from './mount'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useViewAPI', async original => ({ ...(await original()), default: () => fake.api }))

/**
 * Mounts a view with the fake view API.
 * @param {object} component - The view
 * @param {object} [props] - Its props
 * @returns {object} The wrapper
 */
function mountView(component, props) {
  const { pinia, store } = createStore()
  fake.api = createFakeApi(store)
  fake.api.config.windowsizerRequest = { width: 800, height: 600 }
  return mountComponent(component, { pinia, props })
}

describe('DebriefView', () => {
  const debriefText = { render: () => h('p', { id: 'debrief' }, 'What the study was about') }

  it('shows the debrief text component it is given', () => {
    const wrapper = mountView(DebriefView, { debriefText })
    expect(wrapper.find('#debrief').text()).toBe('What the study was about')
  })

  it('next goes to the next view', async () => {
    const wrapper = mountView(DebriefView, { debriefText })
    await wrapper.find('button').trigger('click')
    expect(fake.api.goNextView).toHaveBeenCalledTimes(1)
  })
})

describe('ExpView', () => {
  it('shows the placeholder title, and next goes to the next view', async () => {
    const wrapper = mountView(ExpView)
    expect(wrapper.find('h1').text()).toBe('Experiment')
    await wrapper.find('button').trigger('click')
    expect(fake.api.goNextView).toHaveBeenCalledTimes(1)
  })
})
