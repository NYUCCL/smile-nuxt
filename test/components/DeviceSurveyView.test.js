import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import DeviceSurveyView from '../../src/runtime/components/builtins/DeviceSurveyView.vue'
import { moduleComponents, mountComponent, setupViewAPI } from './mount'

const PAGE1 = { device_type: 'Laptop Computer', connection: 'Wifi', connection_quality: 'Fast', browser: 'Firefox' }
const PAGE2 = { pointer: 'Trackpad', assistive_technology: 'No', tools: 'No', ai: 'No' }

describe('DeviceSurveyView', () => {
  let wrapper
  let api
  let store

  beforeEach(async () => {
    let pinia;
    ({ pinia, store, api } = setupViewAPI('device'))
    wrapper = mountComponent(DeviceSurveyView, { pinia, attachTo: document.body })
    await nextTick()
  })
  afterEach(() => {
    wrapper.unmount()
    api.clear()
    api.clearPersist()
  })

  const button = text => wrapper.findAll('button').find(b => b.text().includes(text))
  // Answers the page's Selects in order, as picking an option in each does
  const fill = async (values) => {
    const selects = wrapper.findAllComponents(moduleComponents.Select)
    expect(selects).toHaveLength(values.length)
    for (const [i, value] of values.entries()) {
      selects[i].vm.$emit('update:modelValue', value)
      await nextTick()
    }
  }
  const recorded = () => Object.values(store.data.pageData_device ?? {}).flatMap(visit => visit.data)

  it('starts on the first page with an empty form', () => {
    expect(api.pathString).toBe('device_page1')
    expect(wrapper.text()).toContain('Computer/Device Information')
    expect(Object.values(api.persist.forminfo).every(v => v === '')).toBe(true)
    expect(Object.keys(api.persist.forminfo)).toEqual([...Object.keys(PAGE1), ...Object.keys(PAGE2)])
  })

  it('needs all four answers on the first page before going on', async () => {
    const values = Object.values(PAGE1)
    const selects = wrapper.findAllComponents(moduleComponents.Select)
    for (const [i, value] of values.entries()) {
      expect(button('Continue').attributes('disabled')).toBeDefined()
      selects[i].vm.$emit('update:modelValue', value)
      await nextTick()
    }
    expect(button('Continue').attributes('disabled')).toBeUndefined()
  })

  it('goes to the second page, and back with the answers kept', async () => {
    await fill(Object.values(PAGE1))
    await button('Continue').trigger('click')
    await nextTick()
    expect(api.pathString).toBe('device_page2')
    await button('Previous').trigger('click')
    await nextTick()
    expect(api.pathString).toBe('device_page1')
    expect(api.persist.forminfo.browser).toBe('Firefox')
  })

  it('needs all four answers on the second page before finishing', async () => {
    await fill(Object.values(PAGE1))
    await button('Continue').trigger('click')
    await nextTick()
    const finish = () => button('I\'m done!')
    const selects = wrapper.findAllComponents(moduleComponents.Select)
    for (const [i, value] of Object.values(PAGE2).entries()) {
      expect(finish().attributes('disabled')).toBeDefined()
      selects[i].vm.$emit('update:modelValue', value)
      await nextTick()
    }
    expect(finish().attributes('disabled')).toBeUndefined()
  })

  it('records all eight answers once and goes to the next view', async () => {
    await fill(Object.values(PAGE1))
    await button('Continue').trigger('click')
    await nextTick()
    await fill(Object.values(PAGE2))
    expect(recorded()).toEqual([])
    await button('I\'m done!').trigger('click')
    expect(recorded()).toEqual([{ ...PAGE1, ...PAGE2 }])
    expect(api.goNextView).toHaveBeenCalledTimes(1)
  })
})
