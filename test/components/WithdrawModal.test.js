import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import WithdrawModal from '../../src/runtime/components/builtins/WithdrawModal.vue'
import { createStore, createFakeApi, mountComponent } from './mount'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))

const OPTIONS = [
  'I couldn\'t adjust the size of my browser to make everything visible',
  'This task is too hard.',
  'This task is too time consuming.',
  'This task is boring.',
  'I do not understand what I am supposed to do.',
  'I am uncomfortable answering the questions.',
  'The content of the task is upsetting to me.',
  'I am having technical issues.',
]

/**
 * Mounts the modal (attached to the document: the checkboxes need it).
 * @param {object} [props] - The modal's props
 * @returns {object} The wrapper
 */
function mountModal(props = { show: true }) {
  const { pinia, store } = createStore()
  fake.api = createFakeApi(store, { setWithdrawn: vi.fn() })
  return mountComponent(WithdrawModal, { pinia, props, attachTo: document.body })
}

const buttonWithText = (wrapper, text) => wrapper.findAll('button').find(b => b.text().includes(text))

describe('WithdrawModal', () => {
  let wrapper
  let main
  beforeEach(() => {
    main = document.createElement('div')
    main.className = 'main-content'
    document.body.appendChild(main)
  })
  afterEach(() => {
    wrapper?.unmount()
    main.remove()
  })

  it('is hidden until show is true', async () => {
    wrapper = mountModal({ show: false })
    expect(wrapper.find('div').classes()).toContain('hidden')
    await wrapper.setProps({ show: true })
    expect(wrapper.find('div').classes()).not.toContain('hidden')
  })

  it('lists the eight reasons, each with a checkbox', () => {
    wrapper = mountModal()
    const labels = wrapper.findAll('label').map(l => l.text())
    for (const option of OPTIONS) expect(labels).toContain(option)
    expect(wrapper.findAll('[role="checkbox"]')).toHaveLength(8)
  })

  it('records nothing chosen, empty comments and the prefilled email when Withdraw is pressed at once', async () => {
    wrapper = mountModal({ show: true, prefillEmail: 'abc@email.prolific.com' })
    expect(wrapper.find('#email').element.value).toBe('abc@email.prolific.com')
    await buttonWithText(wrapper, 'Withdraw').trigger('click')
    expect(fake.api.setWithdrawn).toHaveBeenCalledTimes(1)
    expect(fake.api.setWithdrawn.mock.calls[0][0]).toEqual({
      reason_select: [],
      reason_comments: '',
      email: 'abc@email.prolific.com',
    })
  })

  it('fills in an email that arrives after the form is set up', async () => {
    wrapper = mountModal({ show: true })
    expect(wrapper.find('#email').element.value).toBe('')
    await wrapper.setProps({ prefillEmail: 'later@email.prolific.com' })
    expect(wrapper.find('#email').element.value).toBe('later@email.prolific.com')
  })

  it('keeps an email the participant typed when another arrives', async () => {
    wrapper = mountModal({ show: true })
    await wrapper.find('#email').setValue('mine@example.com')
    await wrapper.setProps({ prefillEmail: 'later@email.prolific.com' })
    expect(wrapper.find('#email').element.value).toBe('mine@example.com')
  })

  it('records the reasons that are checked, the comments and the email', async () => {
    wrapper = mountModal()
    const boxes = wrapper.findAll('[role="checkbox"]')
    await boxes[1].trigger('click')
    await boxes[7].trigger('click')
    await wrapper.find('#comments').setValue('Too long for me')
    await wrapper.find('#email').setValue('me@example.com')
    await buttonWithText(wrapper, 'Withdraw').trigger('click')
    expect(fake.api.setWithdrawn.mock.calls[0][0]).toEqual({
      reason_select: [OPTIONS[1], OPTIONS[7]],
      reason_comments: 'Too long for me',
      email: 'me@example.com',
    })
  })

  it('does not record a reason that was checked and then unchecked', async () => {
    wrapper = mountModal()
    const boxes = wrapper.findAll('[role="checkbox"]')
    await boxes[0].trigger('click')
    await boxes[3].trigger('click')
    await boxes[0].trigger('click')
    expect(boxes[0].attributes('aria-checked')).toBe('false')
    expect(boxes[3].attributes('aria-checked')).toBe('true')
    await buttonWithText(wrapper, 'Withdraw').trigger('click')
    expect(fake.api.setWithdrawn.mock.calls[0][0].reason_select).toEqual([OPTIONS[3]])
  })

  it('saves at once and tells its parent when Withdraw is pressed', async () => {
    wrapper = mountModal()
    await buttonWithText(wrapper, 'Withdraw').trigger('click')
    expect(fake.api.sync).toHaveBeenCalledTimes(1)
    // The withdrawal is set before the save starts
    expect(fake.api.setWithdrawn.mock.invocationCallOrder[0]).toBeLessThan(fake.api.sync.mock.invocationCallOrder[0])
    expect(wrapper.emitted('submitWithdraw')).toHaveLength(1)
    expect(wrapper.emitted('toggleWithdraw')).toBeUndefined()
  })

  it('closes without withdrawing from "Nevermind", the close button and the backdrop', async () => {
    wrapper = mountModal()
    await buttonWithText(wrapper, 'Nevermind').trigger('click')
    await wrapper.find('button[aria-label="close"]').trigger('click')
    // The backdrop
    await wrapper.find('div.bg-black').trigger('click')
    expect(wrapper.emitted('toggleWithdraw')).toHaveLength(3)
    expect(fake.api.setWithdrawn).not.toHaveBeenCalled()
    expect(fake.api.sync).not.toHaveBeenCalled()
    expect(wrapper.emitted('submitWithdraw')).toBeUndefined()
  })

  it('stops the page behind it from scrolling while it is shown', async () => {
    wrapper = mountModal({ show: false })
    expect(main.style.overflow).toBe('')
    await wrapper.setProps({ show: true })
    expect(main.style.overflow).toBe('hidden')
    await wrapper.setProps({ show: false })
    expect(main.style.overflow).toBe('')
  })

  it('lets the page scroll again when it is removed while shown', () => {
    wrapper = mountModal({ show: true })
    expect(main.style.overflow).toBe('hidden')
    wrapper.unmount()
    wrapper = null
    expect(main.style.overflow).toBe('')
  })

  it('works on a page with no .main-content element', async () => {
    main.remove()
    wrapper = mountModal({ show: false })
    await wrapper.setProps({ show: true })
    wrapper.unmount()
    wrapper = null
  })
})
