import { describe, it, expect, vi, afterEach } from 'vitest'
import WindowSizerView from '../../src/runtime/components/builtins/WindowSizerView.vue'
import { mountComponent, setupViewAPI } from './mount'

describe('WindowSizerView', () => {
  let wrapper
  let api
  afterEach(() => wrapper.unmount())

  /**
   * Mounts the view.
   * @param {object} [options] - Mount options (props, attrs)
   */
  function mountSizer(options = {}) {
    let pinia;
    ({ pinia, api } = setupViewAPI('windowsizer', { windowsizerRequest: { width: 640, height: 480 } }))
    vi.spyOn(api, 'verifyVisibility').mockImplementation(() => {})
    wrapper = mountComponent(WindowSizerView, { pinia, ...options })
  }
  const box = () => wrapper.find('div[style]')

  it('draws a box of the size the study asks for', () => {
    mountSizer()
    const style = box().attributes('style')
    expect(style).toContain('width: 640px')
    expect(style).toContain('height: 480px')
    expect(style).toContain('min-width: 640px')
    expect(style).toContain('min-height: 480px')
  })

  it('on the first visit, asks the participant to resize and has a button to go on', () => {
    mountSizer()
    expect(wrapper.text()).toContain('Please adjust the size of your browser window')
    expect(wrapper.text()).not.toContain('We don\'t want you to miss anything!')
    expect(wrapper.find('button').text()).toContain('It is visible now, I\'m ready')
  })

  it('marks the window as checked and goes to the next view when the button is pressed', async () => {
    mountSizer()
    await wrapper.find('button').trigger('click')
    expect(api.verifyVisibility).toHaveBeenCalledWith(true)
    expect(api.goNextView).toHaveBeenCalledTimes(1)
    expect(api.verifyVisibility.mock.invocationCallOrder[0]).toBeLessThan(api.goNextView.mock.invocationCallOrder[0])
  })

  it('when shown over a view that became too small, has no button, so it cannot skip the view', () => {
    mountSizer({ props: { triggered: true } })
    expect(wrapper.text()).toContain('We don\'t want you to miss anything!')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  // The layouts write <WindowSizerView triggered />, which passes '' (#33)
  it('reads the bare "triggered" attribute as true', () => {
    mountSizer({ props: { triggered: '' } })
    expect(wrapper.text()).toContain('We don\'t want you to miss anything!')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('tells the participant in both versions how to withdraw if the window cannot be resized', () => {
    mountSizer()
    expect(wrapper.text()).toContain('please click the red "withdraw" button')
    wrapper.unmount()
    mountSizer({ props: { triggered: true } })
    expect(wrapper.text()).toContain('please click the red "withdraw" button')
  })
})
