import { describe, it, expect, vi } from 'vitest'
import WithdrawView from '../../src/runtime/components/builtins/WithdrawView.vue'
import { createStore, createFakeApi, mountComponent } from './mount'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))

/**
 * Mounts the withdraw page.
 * @param {string} service - The recruitment service
 * @param {boolean} withdrawn - Whether the participant has withdrawn
 * @returns {object} The wrapper
 */
function mountView(service, withdrawn = true) {
  const { pinia, store } = createStore((s) => {
    s.cookieState.withdrawn = withdrawn
  })
  fake.api = createFakeApi(store, { getRecruitmentService: vi.fn(() => service) })
  fake.api.config.windowsizerRequest = { width: 800, height: 600 }
  return mountComponent(WithdrawView, { pinia })
}

describe('WithdrawView', () => {
  it('saves when it opens', () => {
    mountView('web')
    expect(fake.api.sync).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['prolific', 'Notice about withdraw from our Prolific study', 'Please return the task'],
    ['cloudresearch', 'Notice about withdraw from our CloudResearch study', 'Please return the task'],
    ['sona', 'Notice about withdraw from our SONA study', 'Please return to SONA'],
    ['sona_paid', 'Notice about withdraw from our SONA study', 'Please return to SONA'],
    ['spark', 'Notice about withdraw from our SPARK study', 'Feel free to close this window.'],
    ['panda', 'Notice about withdraw from our PANDA study', 'Feel free to close this window.'],
    ['citizensci', 'Notice about withdraw from our study', 'Feel free to close this window.'],
    ['web', 'Notice about withdraw from our web study', 'Feel free to close this window.'],
  ])('tells a %s participant what to do next', (service, title, message) => {
    const text = mountView(service).text()
    expect(text).toContain(title)
    expect(text).toContain(message)
    expect(text).not.toContain('Access Error')
  })

  it('uses a general notice for a recruitment service it does not know', () => {
    const text = mountView('something-else').text()
    expect(text).toContain('Notice about withdraw from our study')
    expect(text).toContain('Feel free to close this window.')
  })

  it('shows an error to a participant who has not withdrawn', () => {
    const text = mountView('prolific', false).text()
    expect(text).toContain('Access Error')
    expect(text).toContain('our records show you have not withdrawn')
    expect(text).not.toContain('Notice about withdraw')
  })
})
