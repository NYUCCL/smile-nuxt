import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { animate } from 'motion'
import InformedConsentView from '../../src/runtime/components/builtins/InformedConsentView.vue'
import InformedConsentModal from '../../src/runtime/components/builtins/InformedConsentModal.vue'
import { createStore, createFakeApi, moduleComponents, mountComponent, setupViewAPI } from './mount'

// The modal uses useAPI(); the view uses the real view API (setupViewAPI)
const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))
// The button's wiggle: one that ends at once
vi.mock('motion', () => ({ animate: vi.fn(() => ({ finished: Promise.resolve() })) }))

const ConsentText = defineComponent({ render: () => h('p', 'THE CONSENT FORM TEXT') })

describe('InformedConsentView', () => {
  let wrapper
  let api

  /**
   * Mounts the consent view.
   * @param {object} [config] - Config values to set
   */
  async function mountConsent(config = {}) {
    let pinia;
    ({ pinia, api } = setupViewAPI('consent', config))
    wrapper = mountComponent(InformedConsentView, { pinia, props: { informedConsentText: ConsentText }, attachTo: document.body })
    await nextTick()
  }
  const startButton = () => wrapper.findAll('button').find(b => b.text().includes('Let\'s start'))
  const toggle = async (value) => {
    wrapper.findComponent(moduleComponents.Switch).vm.$emit('update:modelValue', value)
    await nextTick()
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(animate).mockClear()
  })
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    api.clear()
    api.clearPersist()
    vi.useRealTimers()
  })

  it('shows the study\'s consent text and a switch that is off', async () => {
    await mountConsent()
    expect(wrapper.text()).toContain('THE CONSENT FORM TEXT')
    expect(wrapper.text()).toContain('I consent and am over 18 years old.')
    expect(api.persist.agree).toBe(false)
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
  })

  it('has no button to go on until the participant agrees', async () => {
    await mountConsent()
    expect(startButton()).toBeUndefined()
    await toggle(true)
    expect(startButton()).toBeDefined()
    await toggle(false)
    expect(startButton()).toBeUndefined()
  })

  it('goes to the next view when the button is pressed, and not before', async () => {
    await mountConsent()
    await toggle(true)
    expect(api.goNextView).not.toHaveBeenCalled()
    await startButton().trigger('click')
    expect(api.goNextView).toHaveBeenCalledTimes(1)
  })

  it('turns on from a click on the switch', async () => {
    await mountConsent()
    await wrapper.find('[role="switch"]').trigger('click')
    await nextTick()
    expect(api.persist.agree).toBe(true)
    expect(startButton()).toBeDefined()
  })

  it('skips the consent form in anonymous mode', async () => {
    await mountConsent({ anonymousMode: true })
    expect(api.goNextView).toHaveBeenCalledTimes(1)
  })

  it('draws attention to the button 3 seconds after agreeing, then every 2 seconds', async () => {
    await mountConsent()
    await toggle(true)
    await vi.advanceTimersByTimeAsync(2999)
    expect(animate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(animate).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(animate).toHaveBeenCalledTimes(2)
  })

  it('stops drawing attention when the participant takes the agreement back', async () => {
    await mountConsent()
    await toggle(true)
    await vi.advanceTimersByTimeAsync(3000)
    await toggle(false)
    await vi.advanceTimersByTimeAsync(10000)
    expect(animate).toHaveBeenCalledTimes(1)
  })

  it('stops its timer when the view is left', async () => {
    await mountConsent()
    await toggle(true)
    wrapper.unmount()
    wrapper = null
    await vi.advanceTimersByTimeAsync(10000)
    expect(animate).not.toHaveBeenCalled()
  })
})

describe('InformedConsentModal', () => {
  let wrapper
  let main

  /**
   * Mounts the modal.
   * @param {object} [props] - The modal's props
   * @param {object} [api] - API members to replace
   */
  function mountModal(props = { show: true }, api = {}) {
    const { pinia, store } = createStore()
    fake.api = createFakeApi(store, { getAppComponent: vi.fn(() => ConsentText), ...api })
    wrapper = mountComponent(InformedConsentModal, { pinia, props, attachTo: document.body })
  }
  beforeEach(() => {
    main = document.createElement('div')
    main.className = 'main-content'
    document.body.appendChild(main)
  })
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    main.remove()
  })

  it('is hidden until show is true', async () => {
    mountModal({ show: false })
    expect(wrapper.find('div').classes()).toContain('hidden')
    await wrapper.setProps({ show: true })
    expect(wrapper.find('div').classes()).not.toContain('hidden')
  })

  it('shows the study\'s consent text', () => {
    mountModal()
    expect(fake.api.getAppComponent).toHaveBeenCalledWith('informed_consent_text')
    expect(wrapper.text()).toContain('THE CONSENT FORM TEXT')
  })

  it('shows an error in place of the text when the text cannot be looked up', () => {
    mountModal({ show: true }, { getAppComponent: undefined })
    expect(wrapper.text()).toContain('Error: Unable to load consent form text.')
  })

  it('asks to be closed from the button, the close button and the backdrop', async () => {
    mountModal()
    await wrapper.findAll('button').find(b => b.text().includes('Take me back!')).trigger('click')
    await wrapper.find('button[aria-label="close"]').trigger('click')
    // The backdrop
    await wrapper.find('div.bg-black').trigger('click')
    expect(wrapper.emitted('toggleConsent')).toHaveLength(3)
  })

  it('stops the page behind it from scrolling while it is shown, and lets it scroll after', async () => {
    mountModal({ show: false })
    expect(main.style.overflow).toBe('')
    await wrapper.setProps({ show: true })
    expect(main.style.overflow).toBe('hidden')
    await wrapper.setProps({ show: false })
    expect(main.style.overflow).toBe('')
    await wrapper.setProps({ show: true })
    wrapper.unmount()
    wrapper = null
    expect(main.style.overflow).toBe('')
  })

  it('works on a page with no .main-content element', async () => {
    main.remove()
    mountModal({ show: false })
    await wrapper.setProps({ show: true })
    wrapper.unmount()
    wrapper = null
  })
})
