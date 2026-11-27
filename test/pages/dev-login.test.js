/**
 * @fileoverview The password page for the dev tools and presentation mode.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { useRoute, navigateTo } from '#imports'
import DevLogin from '../../src/runtime/pages/dev-login.vue'

let fetchMock

/**
 * Mounts the page with a query string.
 * @param {object} [query] - The address's query
 * @returns {object} The wrapper
 */
function mountLogin(query = {}) {
  vi.mocked(useRoute).mockReturnValue({ path: '/dev-login', name: 'dev-login', query, params: {} })
  return mount(DevLogin)
}

/**
 * Types a password and submits the form.
 * @param {object} wrapper - The wrapper
 * @param {string} password - The password
 */
async function submit(wrapper, password) {
  await wrapper.find('input[type="password"]').setValue(password)
  await wrapper.find('form').trigger('submit')
}

describe('dev-login page', () => {
  beforeEach(() => {
    vi.mocked(navigateTo).mockClear()
    fetchMock = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('$fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks for the dev password by default', () => {
    const wrapper = mountLogin()
    expect(wrapper.find('h2').text()).toBe('Developer Access')
    expect(wrapper.text()).toContain('Enter the dev password to continue.')
  })

  it('asks for the presentation password when the address says so', () => {
    const wrapper = mountLogin({ scope: 'presentation' })
    expect(wrapper.find('h2').text()).toBe('Presentation Access')
    expect(wrapper.text()).toContain('Enter the presentation password to continue.')
  })

  it('asks for the presentation password when only the way back is a presentation address', () => {
    expect(mountLogin({ redirect: '/presentation/task' }).find('h2').text()).toBe('Presentation Access')
    expect(mountLogin({ redirect: '/dev/task', scope: 'other' }).find('h2').text()).toBe('Developer Access')
  })

  it('sends the password and scope, then loads /dev/ in place of this page', async () => {
    const wrapper = mountLogin()
    await submit(wrapper, 'hunter2')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', { method: 'POST', body: { password: 'hunter2', scope: 'dev' } })
    expect(navigateTo).toHaveBeenCalledWith('/dev/', { replace: true, external: true })
    expect(wrapper.find('.error').exists()).toBe(false)
  })

  it('goes back to the address the visitor was sent from', async () => {
    const wrapper = mountLogin({ redirect: '/presentation/task', scope: 'presentation' })
    await submit(wrapper, 'slides')
    await flushPromises()
    expect(fetchMock.mock.calls[0][1].body).toEqual({ password: 'slides', scope: 'presentation' })
    expect(navigateTo).toHaveBeenCalledWith('/presentation/task', { replace: true, external: true })
  })

  it('locks the form and says it is logging in while the request runs', async () => {
    let finish
    fetchMock.mockImplementation(() => new Promise((resolve) => {
      finish = resolve
    }))
    const wrapper = mountLogin()
    await submit(wrapper, 'hunter2')
    expect(wrapper.find('button').text()).toBe('Logging in...')
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
    finish()
    await flushPromises()
    expect(wrapper.find('button').text()).toBe('Login')
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })

  it('says the password is wrong on a 401 and stays on the page', async () => {
    fetchMock.mockRejectedValue({ statusCode: 401 })
    const wrapper = mountLogin()
    await submit(wrapper, 'wrong')
    await flushPromises()
    expect(wrapper.find('.error').text()).toBe('Invalid password')
    expect(navigateTo).not.toHaveBeenCalled()
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })

  it('says the login failed on any other error', async () => {
    fetchMock.mockRejectedValue({ statusCode: 500 })
    const wrapper = mountLogin()
    await submit(wrapper, 'hunter2')
    await flushPromises()
    expect(wrapper.find('.error').text()).toBe('Login failed')
  })

  it('clears the message when the next try starts', async () => {
    fetchMock.mockRejectedValueOnce({ statusCode: 401 })
    const wrapper = mountLogin()
    await submit(wrapper, 'wrong')
    await flushPromises()
    expect(wrapper.find('.error').exists()).toBe(true)
    await submit(wrapper, 'hunter2')
    await flushPromises()
    expect(wrapper.find('.error').exists()).toBe(false)
    expect(navigateTo).toHaveBeenCalledTimes(1)
  })
})
