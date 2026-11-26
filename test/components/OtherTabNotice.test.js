import { describe, it, expect, vi, afterEach } from 'vitest'
import { nextTick } from 'vue'
import OtherTabNotice from '../../src/runtime/components/builtins/OtherTabNotice.vue'
import { createStore, mountComponent } from './mount'

/**
 * Mounts the notice.
 * @param {boolean|string} otherTab - The store's otherTab
 * @param {object} [props] - The notice's props
 * @returns {{ wrapper: object, store: object }} The wrapper and the store
 */
function mountWith(otherTab, props = {}) {
  const { pinia, store } = createStore((s) => {
    s.browserEphemeral.otherTab = otherTab
  })
  return { wrapper: mountComponent(OtherTabNotice, { pinia, props }), store }
}

const notice = wrapper => wrapper.find('[data-testid="other-tab-notice"]')
const button = wrapper => wrapper.find('[data-testid="other-tab-continue"]')

describe('OtherTabNotice', () => {
  const location = window.location
  afterEach(() => {
    Object.defineProperty(window, 'location', { value: location, writable: true, configurable: true })
  })

  it('shows nothing while this tab has the participant', () => {
    const { wrapper } = mountWith(false)
    expect(notice(wrapper).exists()).toBe(false)
  })

  it('says the study is open in another tab when a newer tab took over', () => {
    const { wrapper } = mountWith('newer-tab')
    expect(notice(wrapper).attributes('role')).toBe('alertdialog')
    expect(wrapper.find('h2').text()).toBe('This study is open in another tab')
    expect(wrapper.text()).toContain('Your progress is saved.')
    expect(button(wrapper).text()).toBe('Continue here')
  })

  it('says the progress was saved somewhere else after a save conflict', () => {
    const { wrapper } = mountWith('conflict')
    expect(wrapper.find('h2').text()).toBe('Your progress was saved somewhere else')
    expect(wrapper.text()).toContain('Press Continue to carry on from')
    expect(button(wrapper).text()).toBe('Continue')
  })

  it('uses the conflict wording for any reason other than a newer tab', () => {
    const { wrapper } = mountWith(true)
    expect(wrapper.find('h2').text()).toBe('Your progress was saved somewhere else')
  })

  it('covers the window, or its container with the inline prop', () => {
    expect(notice(mountWith('newer-tab').wrapper).classes()).toContain('fixed')
    const inline = notice(mountWith('newer-tab', { inline: true }).wrapper)
    expect(inline.classes()).not.toContain('fixed')
    expect(inline.classes()).toContain('h-full')
  })

  it('reloads the page when Continue is pressed', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true, configurable: true })
    const { wrapper } = mountWith('newer-tab')
    await button(wrapper).trigger('click')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('appears when another tab takes over after it was mounted', async () => {
    const { wrapper, store } = mountWith(false)
    store.browserEphemeral.otherTab = 'newer-tab'
    await nextTick()
    expect(notice(wrapper).exists()).toBe(true)
  })
})
