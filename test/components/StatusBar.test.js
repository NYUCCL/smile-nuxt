import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import StatusBar from '../../src/runtime/components/builtins/StatusBar.vue'
import WithdrawModal from '../../src/runtime/components/builtins/WithdrawModal.vue'
import InformedConsentModal from '../../src/runtime/components/builtins/InformedConsentModal.vue'
import SyncIndicator from '../../src/runtime/components/builtins/SyncIndicator.vue'
import { createStore, createFakeApi, mountComponent } from './mount'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))

/**
 * Mounts the status bar.
 * @param {(store: object) => void} [setup] - Sets the store's state
 * @param {object} [config] - Config values to change
 * @returns {{ wrapper: object, store: object }} The wrapper and the store
 */
function mountBar(setup, config = {}) {
  const { pinia, store } = createStore((s) => {
    s.config = { ...s.config, codeName: 'test-study', github: { lastCommitHash: 'abc1234' } }
    s.cookieState.consented = true
    if (setup) setup(s)
  })
  fake.api = createFakeApi(store, { setWithdrawn: vi.fn(), getAppComponent: vi.fn(() => ({ render: () => 'CONSENT TEXT' })) })
  Object.assign(fake.api.config, config)
  return { wrapper: mountComponent(StatusBar, { pinia }), store }
}

const buttonWithText = (wrapper, text) => wrapper.findAll('button').find(b => b.text().includes(text))
// The bar's Withdraw button. (The withdraw form, always in the page, has one
// too; the bar's wraps its label in a span.)
const withdrawButton = wrapper => wrapper.findAll('button').find(b => b.find('span').exists() && b.text() === 'Withdraw')

describe('StatusBar', () => {
  it('shows the study, the version and the lab logo', () => {
    const { wrapper } = mountBar()
    expect(wrapper.text()).toContain('Study: test-study')
    expect(wrapper.text()).toContain('Version: abc1234')
    expect(wrapper.find('a[href="https://lab.example"] img').attributes('src')).toBe('/public/logo.png')
  })

  it('shows the short participant ID once there is one', () => {
    expect(mountBar().wrapper.text()).not.toContain('User ID')
    const { wrapper } = mountBar((s) => {
      s.cookieState.participantId = '22035a94-f1c2-4c11-9d1e-000000000000'
    })
    expect(wrapper.text()).toContain('User ID: 22035a94-f')
  })

  it('contains the save indicator', () => {
    expect(mountBar().wrapper.findComponent(SyncIndicator).exists()).toBe(true)
  })

  it('has no consent or withdraw button before consent', () => {
    const { wrapper } = mountBar((s) => {
      s.cookieState.consented = false
    })
    expect(buttonWithText(wrapper, 'View consent')).toBeUndefined()
    expect(withdrawButton(wrapper)).toBeUndefined()
  })

  it('has both buttons after consent', () => {
    const { wrapper } = mountBar()
    expect(buttonWithText(wrapper, 'View consent')).toBeDefined()
    expect(withdrawButton(wrapper)).toBeDefined()
  })

  it.each(['withdrawn', 'done'])('has no withdraw button once the participant is %s', (flag) => {
    const { wrapper } = mountBar((s) => {
      s.cookieState[flag] = true
    })
    expect(buttonWithText(wrapper, 'View consent')).toBeDefined()
    expect(withdrawButton(wrapper)).toBeUndefined()
  })

  it('hides the logo and the buttons in anonymous mode, and keeps the save indicator', () => {
    const { wrapper } = mountBar(null, { anonymousMode: true })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(buttonWithText(wrapper, 'View consent')).toBeUndefined()
    expect(wrapper.findComponent(SyncIndicator).exists()).toBe(true)
  })

  it('opens and closes the consent form', async () => {
    const { wrapper } = mountBar()
    const modal = wrapper.findComponent(InformedConsentModal)
    expect(modal.props('show')).toBe(false)
    await buttonWithText(wrapper, 'View consent').trigger('click')
    expect(modal.props('show')).toBe(true)
    modal.vm.$emit('toggleConsent')
    await nextTick()
    expect(modal.props('show')).toBe(false)
  })

  it('opens and closes the withdraw form', async () => {
    const { wrapper } = mountBar()
    const modal = wrapper.findComponent(WithdrawModal)
    expect(modal.props('show')).toBe(false)
    await withdrawButton(wrapper).trigger('click')
    expect(modal.props('show')).toBe(true)
    modal.vm.$emit('toggleWithdraw')
    await nextTick()
    expect(modal.props('show')).toBe(false)
    expect(fake.api.goToView).not.toHaveBeenCalled()
  })

  it('goes to the withdraw page when the form is submitted', async () => {
    const { wrapper } = mountBar()
    const modal = wrapper.findComponent(WithdrawModal)
    await withdrawButton(wrapper).trigger('click')
    modal.vm.$emit('submitWithdraw')
    await nextTick()
    expect(modal.props('show')).toBe(false)
    expect(fake.api.goToView).toHaveBeenCalledWith('withdraw')
  })

  it('passes a Prolific participant\'s contact address to the withdraw form', async () => {
    const { wrapper } = mountBar((s) => {
      s.data.recruitmentService = 'prolific'
      s.private.recruitmentInfo = { prolific_id: 'PID123' }
    })
    expect(wrapper.findComponent(WithdrawModal).props('prefillEmail')).toBe('PID123@email.prolific.com')
  })

  it('passes no address for other recruitment services', () => {
    const { wrapper } = mountBar((s) => {
      s.data.recruitmentService = 'web'
    })
    expect(wrapper.findComponent(WithdrawModal).props('prefillEmail')).toBe('')
  })

  it('works the address out again when the withdraw form is opened', async () => {
    const { wrapper, store } = mountBar((s) => {
      s.data.recruitmentService = 'web'
    })
    store.data.recruitmentService = 'prolific'
    store.private.recruitmentInfo = { prolific_id: 'LATER' }
    await withdrawButton(wrapper).trigger('click')
    expect(wrapper.findComponent(WithdrawModal).props('prefillEmail')).toBe('LATER@email.prolific.com')
  })
})
