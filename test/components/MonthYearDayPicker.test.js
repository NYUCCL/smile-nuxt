import { describe, it, expect, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { resetLocalTimeZone, setLocalTimeZone } from '@internationalized/date'
import MonthYearDayPicker from '../../src/runtime/components/forms/MonthYearDayPicker.vue'
import { moduleComponents, mountComponent } from './mount'

describe('MonthYearDayPicker', () => {
  let wrapper
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    resetLocalTimeZone()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  const mountPicker = (props = {}) => {
    wrapper = mountComponent(MonthYearDayPicker, { props, attachTo: document.body })
    return wrapper
  }
  // The day buttons of the month on show (not the days of the months around it)
  const day = n => wrapper.findAll('[data-slot="calendar-cell-trigger"], [role="button"][data-value]')
    .find(d => d.text() === String(n) && d.attributes('data-outside-view') === undefined)
  const selects = () => wrapper.findAllComponents(moduleComponents.Select)
  const lastEmitted = () => wrapper.emitted('update:modelValue')?.at(-1)?.[0]

  it('shows the month and year of the value it is given', () => {
    mountPicker({ modelValue: '1990-02-03' })
    expect(selects()[0].props('modelValue')).toBe('2')
    expect(selects()[1].props('modelValue')).toBe('1990')
    expect(day(3).attributes('data-selected')).toBeDefined()
    // February 1990 has 28 days
    expect(day(28)).toBeDefined()
    expect(day(29)).toBeUndefined()
  })

  it('shows the current month when it has no value', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 22, 12), toFake: ['Date'] })
    mountPicker()
    expect(selects()[0].props('modelValue')).toBe('11')
    expect(selects()[1].props('modelValue')).toBe('2026')
    expect(wrapper.find('[data-selected]').exists()).toBe(false)
  })

  it('gives the chosen day as YYYY-MM-DD', async () => {
    mountPicker({ modelValue: '1990-02-03' })
    await day(17).trigger('click')
    expect(lastEmitted()).toBe('1990-02-17')
  })

  it.each(['America/Los_Angeles', 'UTC', 'Europe/Berlin', 'Asia/Tokyo', 'Pacific/Auckland'])('gives the day that was clicked in the %s time zone', async (zone) => {
    vi.stubEnv('TZ', zone)
    setLocalTimeZone(zone)
    mountPicker({ modelValue: '1990-02-03' })
    await day(17).trigger('click')
    expect(lastEmitted()).toBe('1990-02-17')
  })

  it('moves the selected date when another month is chosen', async () => {
    mountPicker({ modelValue: '1990-02-03' })
    selects()[0].vm.$emit('update:modelValue', '7')
    await nextTick()
    expect(lastEmitted()).toBe('1990-07-03')
    expect(selects()[0].props('modelValue')).toBe('7')
  })

  it('moves the selected date when another year is chosen', async () => {
    mountPicker({ modelValue: '1990-02-03' })
    selects()[1].vm.$emit('update:modelValue', '1975')
    await nextTick()
    expect(lastEmitted()).toBe('1975-02-03')
  })

  it('changes the month on show, and selects nothing, when there is no date yet', async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 22, 12), toFake: ['Date'] })
    mountPicker()
    selects()[0].vm.$emit('update:modelValue', '3')
    selects()[1].vm.$emit('update:modelValue', '2001')
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(selects()[0].props('modelValue')).toBe('3')
    expect(selects()[1].props('modelValue')).toBe('2001')
    // March 2001 has 31 days
    expect(day(31)).toBeDefined()
  })

  it('does nothing when the month or year already on show is chosen again', async () => {
    mountPicker({ modelValue: '1990-02-03' })
    selects()[0].vm.$emit('update:modelValue', '2')
    selects()[1].vm.$emit('update:modelValue', '1990')
    selects()[0].vm.$emit('update:modelValue', '')
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('follows a value that is changed from outside', async () => {
    mountPicker({ modelValue: '1990-02-03' })
    await wrapper.setProps({ modelValue: '2004-12-25' })
    expect(selects()[0].props('modelValue')).toBe('12')
    expect(selects()[1].props('modelValue')).toBe('2004')
    expect(day(25).attributes('data-selected')).toBeDefined()
  })

  it('keeps the month on show when the value is cleared from outside', async () => {
    mountPicker({ modelValue: '1990-02-03' })
    await wrapper.setProps({ modelValue: '' })
    expect(selects()[0].props('modelValue')).toBe('2')
    expect(wrapper.find('[data-selected]').exists()).toBe(false)
  })
})
