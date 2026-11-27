import { describe, it, expect, vi, afterEach } from 'vitest'
import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import useAPI from '../../src/runtime/composables/useAPI'
import useSmileStore from '../../src/runtime/stores/smilestore'
import { setFlags, resetFlags } from './flags'

describe('import.meta.dev in tests', () => {
  afterEach(resetFlags)

  it('is off unless a test sets it', () => {
    setActivePinia(createTestingPinia({ stubActions: true, createSpy: vi.fn }))
    const store = useSmileStore()
    const api = useAPI()
    api.setAutofill(() => {})
    api.removeAutofill()
    expect(store.setAutofill).not.toHaveBeenCalled()
    expect(store.removeAutofill).not.toHaveBeenCalled()

    setFlags({ dev: true })
    api.setAutofill(() => {})
    api.removeAutofill()
    expect(store.setAutofill).toHaveBeenCalledTimes(1)
    expect(store.removeAutofill).toHaveBeenCalledTimes(1)

    resetFlags()
    api.setAutofill(() => {})
    expect(store.setAutofill).toHaveBeenCalledTimes(1)
  })

  it('refuses a flag it does not know', () => {
    expect(() => setFlags({ prod: true })).toThrow('Unknown flag')
  })
})
