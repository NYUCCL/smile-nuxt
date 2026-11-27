import { describe, it, expect, vi } from 'vitest'
import FavoriteNumber from '../../src/runtime/components/builtins/FavoriteNumber.vue'
import FavoriteColor from '../../src/runtime/components/builtins/FavoriteColor.vue'
import { createStore, createFakeApi, mountComponent } from './mount'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useViewAPI', async original => ({ ...(await original()), default: () => fake.api }))

/**
 * Mounts one of the two example task views.
 * @param {object} component - The view
 * @returns {object} The wrapper
 */
function mountView(component) {
  const { pinia, store } = createStore()
  fake.api = createFakeApi(store)
  return mountComponent(component, { pinia })
}

describe('FavoriteNumber', () => {
  it('starts with 1 in a number field', () => {
    const input = mountView(FavoriteNumber).find('input#faveNumber')
    expect(input.attributes('type')).toBe('number')
    expect(input.element.value).toBe('1')
  })

  it('next records the default answer and goes to the next view', async () => {
    const wrapper = mountView(FavoriteNumber)
    await wrapper.find('button').trigger('click')
    expect(fake.api.recordPageData).toHaveBeenCalledWith({ favoriteNumber: '1' })
    expect(fake.api.goNextView).toHaveBeenCalledTimes(1)
  })

  it('next records the number that was typed, before leaving the view', async () => {
    const wrapper = mountView(FavoriteNumber)
    await wrapper.find('input#faveNumber').setValue('42')
    await wrapper.find('button').trigger('click')
    // A number field's v-model gives a number
    expect(fake.api.recordPageData).toHaveBeenCalledWith({ favoriteNumber: 42 })
    expect(fake.api.recordPageData.mock.invocationCallOrder[0]).toBeLessThan(fake.api.goNextView.mock.invocationCallOrder[0])
  })
})

describe('FavoriteColor', () => {
  it('starts with an empty field', () => {
    expect(mountView(FavoriteColor).find('input#faveColor').element.value).toBe('')
  })

  it('next records the color that was typed and goes to the next view', async () => {
    const wrapper = mountView(FavoriteColor)
    await wrapper.find('input#faveColor').setValue('teal')
    await wrapper.find('button').trigger('click')
    expect(fake.api.recordPageData).toHaveBeenCalledWith({ favoriteColor: 'teal' })
    expect(fake.api.goNextView).toHaveBeenCalledTimes(1)
  })

  it('next with nothing typed records an empty answer', async () => {
    const wrapper = mountView(FavoriteColor)
    await wrapper.find('button').trigger('click')
    expect(fake.api.recordPageData).toHaveBeenCalledWith({ favoriteColor: '' })
  })
})
