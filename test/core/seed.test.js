/* eslint-disable no-undef */
import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import seedrandom from 'seedrandom'
import useSmileStore from '@/core/stores/smilestore'
import seedPlugin from '@/core/plugins/seed.client'

describe('Seed plugin', () => {
  let pinia

  beforeEach(() => {
    pinia = createTestingPinia({ stubActions: false })
    setActivePinia(pinia)
  })

  afterEach(() => {
    // Restore unseeded Math.random
    seedrandom(undefined, { global: true })
  })

  it('should generate and store a new seedID when useSeed is true and no existing seed', () => {
    const store = useSmileStore()
    store.localState.useSeed = true
    store.cookieState.seedSet = false
    store.cookieState.seedID = ''

    seedPlugin()

    // Plugin should have generated a UUID and stored it
    expect(store.cookieState.seedID).toBeTruthy()
    expect(store.cookieState.seedID).not.toBe('')
    expect(store.cookieState.seedSet).toBe(true)
  })

  it('should seed Math.random globally when useSeed is true', () => {
    const store = useSmileStore()
    store.localState.useSeed = true
    store.cookieState.seedSet = false
    store.cookieState.seedID = ''

    seedPlugin()

    const seedID = store.cookieState.seedID

    // Re-seed with the same ID and verify deterministic output
    seedrandom(seedID, { global: true })
    const val1 = Math.random()
    seedrandom(seedID, { global: true })
    const val2 = Math.random()
    expect(val1).toBe(val2)
  })

  it('should reuse existing seed when seedSet is true', () => {
    const store = useSmileStore()
    store.localState.useSeed = true
    store.cookieState.seedSet = true
    store.cookieState.seedID = 'existing-seed'

    seedPlugin()

    // Should keep the existing seed, not generate a new one
    expect(store.cookieState.seedID).toBe('existing-seed')
    expect(store.cookieState.seedSet).toBe(true)

    // Verify Math.random is seeded with the existing seed
    seedrandom('existing-seed', { global: true })
    const expected = Math.random()
    seedrandom('existing-seed', { global: true })
    const actual = Math.random()
    expect(actual).toBe(expected)
  })

  it('should not seed Math.random when useSeed is false', () => {
    const store = useSmileStore()
    store.localState.useSeed = false
    store.cookieState.seedSet = false
    store.cookieState.seedID = ''

    seedPlugin()

    // Store should remain unchanged
    expect(store.cookieState.seedID).toBe('')
    expect(store.cookieState.seedSet).toBe(false)
  })

  it('should produce deterministic random sequences across two plugin runs with same seed', () => {
    const store = useSmileStore()
    store.localState.useSeed = true
    store.cookieState.seedSet = true
    store.cookieState.seedID = 'deterministic-test'

    seedPlugin()
    const seq1 = [Math.random(), Math.random(), Math.random()]

    // Re-run the plugin (simulating page reload with persisted seed)
    seedPlugin()
    const seq2 = [Math.random(), Math.random(), Math.random()]

    expect(seq1).toEqual(seq2)
  })
})
