import { describe, it, expect, vi } from 'vitest'
import InstructionsView from '../../src/runtime/components/builtins/InstructionsView.vue'
import { createStore, createFakeApi, mountComponent } from './mount'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useViewAPI', async original => ({ ...(await original()), default: () => fake.api }))

/**
 * Mounts the instructions view for one value of the instructionsVersion condition.
 * @param {string} [condition] - The condition's value
 * @returns {object} The wrapper
 */
function mountInstructions(condition) {
  const { pinia, store } = createStore()
  fake.api = createFakeApi(store, { getConditionByName: vi.fn(() => condition) })
  fake.api.config.windowsizerRequest = { width: 800, height: 600 }
  return mountComponent(InstructionsView, { pinia })
}

describe('InstructionsView', () => {
  it('asks for the instructionsVersion condition', () => {
    mountInstructions('1')
    expect(fake.api.getConditionByName).toHaveBeenCalledWith('instructionsVersion')
  })

  it.each(['1', '2', '3'])('shows the text for version %s', (version) => {
    expect(mountInstructions(version).text()).toContain(`instructions version ${version}`)
  })

  it('says no condition is set when there is none', () => {
    expect(mountInstructions(undefined).text()).toContain('no condition set')
  })

  it('next goes back to the first step and then to the next view', async () => {
    const wrapper = mountInstructions('1')
    await wrapper.find('button').trigger('click')
    expect(fake.api.goFirstStep).toHaveBeenCalledTimes(1)
    expect(fake.api.goNextView).toHaveBeenCalledTimes(1)
    expect(fake.api.goFirstStep.mock.invocationCallOrder[0]).toBeLessThan(fake.api.goNextView.mock.invocationCallOrder[0])
  })
})
