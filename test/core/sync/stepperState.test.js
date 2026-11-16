import { describe, it, expect, beforeEach, vi } from 'vitest'
import fc from 'fast-check'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import useSmileStore from '../../../src/runtime/stores/smilestore'
import { Stepper } from '../../../src/runtime/core/stepper/Stepper'
import { useStepper } from '../../../src/runtime/composables/useStepper'
import { fakerDistributions } from '../../../src/runtime/utils/randomization'
import appconfig from '../../../src/runtime/core/config.js'
import { BAD_VALUES, isPlainJSON } from '../../fixtures/bad-values.js'

/**
 * Stepper state is what puts a participant back on the right trial after a
 * reload (plans/sync_engine.md). Saving it must never throw, what's saved must
 * load back to the same place, and damaged state must load as much as it can.
 */

let store

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  store = useSmileStore()
})

function newRoot() {
  const root = new Stepper({ id: '/', parent: null, store })
  root.data.gvars = {} // as api.persist does
  root.name = 'trial'
  return root
}

/** What save() wrote to localStorage for this view */
function savedState(page = 'trial') {
  return JSON.parse(localStorage.getItem(appconfig.localStorageKey)).viewSteppers[page].data.stepperState
}

/** save, load into a new stepper, save again: both saves must match */
function roundTrip(root) {
  expect(root.save()).toBe(true)
  const first = savedState()
  const back = new Stepper({ serializedState: first, store })
  back.name = 'trial'
  expect(back.save()).toBe(true)
  expect(JSON.stringify(savedState(), null, 1)).toBe(JSON.stringify(first, null, 1))
  expect(back.currentPathString).toBe(root.currentPathString)
  return back
}

function advance(s, n) {
  for (let i = 0; i < n; i++) s.next()
}

describe('round trips', () => {
  it('a flat list, part way through', () => {
    const root = newRoot()
    root.append([{ word: 'red' }, { word: 'blue' }, { word: 'green' }])
    advance(root, 1)
    const back = roundTrip(root)
    expect(back.currentData).toEqual({ word: 'blue' })
  })

  it('nested blocks, part way into the second', () => {
    const root = newRoot()
    root.append([{ id: 'b1' }, { id: 'b2' }])
    root.states[0].append([{ t: 1 }, { t: 2 }])
    root.states[1].append([{ t: 3 }, { t: 4 }, { t: 5 }])
    advance(root, 4)
    const back = roundTrip(root)
    expect(back.currentData).toEqual(root.currentData)
    expect(back.currentPathString).toBe(root.currentPathString)
  })

  it('outer, zip and a seeded shuffle', () => {
    const root = newRoot()
    root.append([{ id: 'o' }, { id: 'z' }])
    root.states[0].outer({ shape: ['circle', 'square'], color: ['red', 'green'] })
    root.states[0].shuffle({ seed: 'abc', always: true })
    root.states[1].zip({ a: [1, 2, 3], b: ['x', 'y', 'z'] })
    advance(root, 3)
    const back = roundTrip(root)
    expect(back.states[0].rowsData).toEqual(root.states[0].rowsData)
    expect(back.states[1].rowsData).toEqual(root.states[1].rowsData)
    expect(back.currentData).toEqual(root.currentData)
  })

  it('shuffle leaves every child index at 0', () => {
    const root = newRoot()
    root.append([{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }, { id: 'b4' }])
    for (const b of root.states) b.append([{ t: 1 }, { t: 2 }])
    root.shuffle({ seed: 'xyz' })
    expect(root.states.map(s => s.id)).not.toEqual(['b1', 'b2', 'b3', 'b4'])
    for (const b of root.states) {
      expect(b.index).toBe(0)
      for (const leaf of b.states) expect(leaf.index).toBe(0)
    }
    advance(root, 3)
    roundTrip(root)
  })

  it('loading sets a leaf index left by the old shuffle to 0, without a warning', () => {
    const root = newRoot()
    root.append([{ id: 'b1' }, { id: 'b2' }])
    root.states[0].append([{ t: 1 }, { t: 2 }, { t: 3 }])
    root.states[1].append([{ t: 4 }])
    advance(root, 1)
    const state = JSON.parse(JSON.stringify(root.json))
    state.states[0].states.forEach((leaf, i) => {
      leaf.currentIndex = i
    })
    const spy = vi.spyOn(root._log, 'warn')
    spy.mockClear()
    const back = new Stepper({ serializedState: state, store })
    expect(back.states[0].states.map(l => l.index)).toEqual([0, 0, 0])
    expect(back.currentPathString).toBe(root.currentPathString)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('persist values (gvars) of every plain kind', () => {
    const root = newRoot()
    root.append([{ t: 1 }, { t: 2 }])
    root.data.gvars = { n: 3, s: 'x', list: [[1, 2], [3]], obj: { 'a.b': true }, nil: null }
    root.next()
    const back = roundTrip(root)
    expect(back.data.gvars).toEqual(root.data.gvars)
  })

  it('a faker function is kept as a marker and works after loading', () => {
    const api = { faker: { runif: (min, max) => fakerDistributions.runif(min, max).val } }
    const root = newRoot()
    root.append([{ id: 'a', r: () => api.faker.runif(1, 10) }, { id: 'b' }])
    root.next()
    roundTrip(root)
    const state = savedState()
    expect(state.states[0].data.r).toEqual({ __fakerFunction: true, name: 'runif', params: [1, 10] })
    const back = new Stepper({ serializedState: state, store })
    const value = back.states[0].data.r()
    expect(value).toBeGreaterThanOrEqual(1)
    expect(value).toBeLessThanOrEqual(10)
  })

  it('a Vue component in step data is kept as a marker', () => {
    const Comp = defineComponent({ name: 'StroopTrial', render: () => null })
    const root = newRoot()
    root.append([{ id: 'a', type: Comp }, { id: 'b' }])
    root.next()
    roundTrip(root)
    expect(savedState().states[0].data.type).toEqual({ __vueComponent: true, componentName: 'StroopTrial' })
  })
})

describe('bad values in step data and persist', () => {
  for (const bad of BAD_VALUES.filter(b => !b.slow)) {
    it(`persist holding ${bad.name}: saves, reloads, and the other values survive`, () => {
      const root = newRoot()
      root.append([{ id: 'a' }, { id: 'b' }])
      root.data.gvars.bad = bad.make()
      root.data.gvars.score = 7
      root.next()
      root.next()
      let ok
      expect(() => {
        ok = root.save()
      }).not.toThrow()
      expect(ok).toBe(true)
      const state = savedState()
      expect(isPlainJSON(state)).toBe(true)
      const back = new Stepper({ serializedState: state, store })
      expect(back.data.gvars.score).toBe(7)
      expect(back.currentData.id).toBe('b')
      // and it keeps working
      expect(() => back.next()).not.toThrow()
    })

    it(`appending a step holding ${bad.name} twice: no throw, duplicates still found`, () => {
      const root = newRoot()
      const item = { id: 'a', v: bad.make() }
      expect(() => root.append([item])).not.toThrow()
      expect(() => root.append([item])).not.toThrow()
      expect(root.states).toHaveLength(1)
    })
  }

  it('warns once per stepper, not on every save', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const root = newRoot()
    const log = root._log
    const spy = vi.spyOn(log, 'warn')
    spy.mockClear() // the log store can outlive a test's pinia
    root.append([{ id: 'a', n: 1n }, { id: 'b' }])
    root.save()
    root.next()
    root.save()
    expect(spy.mock.calls.filter(c => String(c[0]).includes('step data cleaned'))).toHaveLength(1)
    spy.mockRestore()
    warn.mockRestore()
  })

  it('damaged localStorage under the key does not stop a save', () => {
    localStorage.setItem(appconfig.localStorageKey, '{not json')
    const root = newRoot()
    root.append([{ id: 'a' }])
    expect(root.save()).toBe(true)
    expect(savedState().states[0].id).toBe('a')

    localStorage.setItem(appconfig.localStorageKey, '[1,2]')
    expect(root.save()).toBe(true)
    localStorage.setItem(appconfig.localStorageKey, '{"viewSteppers":"x"}')
    expect(root.save()).toBe(true)
    expect(savedState().states[0].id).toBe('a')
  })

  it('a full localStorage does not stop a save (the store copy is kept)', () => {
    const root = newRoot()
    root.append([{ id: 'a' }])
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    try {
      expect(root.save()).toBe(true)
      expect(store.localState.viewSteppers.trial.data.stepperState.states[0].id).toBe('a')
    }
    finally {
      setItem.mockRestore()
    }
  })
})

describe('damaged state', () => {
  function goodState() {
    const root = newRoot()
    root.append([{ id: 'b1' }, { id: 'b2' }])
    root.states[0].append([{ t: 1 }, { t: 2 }])
    root.states[1].append([{ t: 3 }, { t: 4 }])
    root.data.gvars = { score: 2 }
    advance(root, 3)
    return JSON.parse(JSON.stringify(root.json))
  }

  /** Every node object in a state tree */
  function nodes(state) {
    const out = []
    const walk = (n) => {
      if (!n || typeof n !== 'object') return
      out.push(n)
      if (Array.isArray(n.states)) n.states.forEach(walk)
    }
    walk(state)
    return out
  }

  const FIELDS = ['id', 'currentIndex', 'depth', 'shuffled', 'states', 'data']
  const junk = fc.oneof(
    fc.constant('delete'),
    fc.constant(null),
    fc.string(),
    fc.integer({ min: -5, max: 50 }),
    fc.double(),
    fc.boolean(),
    fc.constant([]),
    fc.constant({}),
    fc.array(fc.oneof(fc.constant(null), fc.integer(), fc.string(), fc.object()), { maxLength: 4 }),
    fc.object(),
    fc.constant({ __fakerFunction: true, name: 'nope', params: 3 }),
    fc.constant({ __fakerFunction: true, name: '__proto__', params: [] }),
  )
  const mutation = fc.record({ node: fc.nat(), field: fc.constantFrom(...FIELDS), to: junk })

  function damage(state, mutations) {
    for (const m of mutations) {
      const all = nodes(state)
      const node = all[m.node % all.length]
      if (m.to === 'delete') delete node[m.field]
      else node[m.field] = structuredClone(m.to)
    }
    return state
  }

  it('loads, or refuses only when the root has no list of steps; never breaks after loading', () => {
    fc.assert(fc.property(fc.array(mutation, { minLength: 1, maxLength: 6 }), (mutations) => {
      const state = damage(goodState(), mutations)
      let s
      try {
        s = new Stepper({ serializedState: state, store })
      }
      catch (err) {
        expect(Array.isArray(state.states)).toBe(false)
        expect(String(err.message)).toContain('Missing required fields')
        return
      }
      s.name = 'trial'
      // whatever loaded can be used, saved and loaded again
      s.currentData // eslint-disable-line no-unused-expressions
      for (let i = 0; i < 6; i++) s.next()
      s.prev()
      expect(s.save()).toBe(true)
      const again = new Stepper({ serializedState: savedState(), store })
      expect(again.currentPathString).toBe(s.currentPathString)
    }), { numRuns: 400 })
  })

  it('useStepper never throws on damaged state', () => {
    fc.assert(fc.property(fc.array(mutation, { minLength: 1, maxLength: 6 }), (mutations) => {
      setActivePinia(createPinia())
      store = useSmileStore()
      store.localState.viewSteppers.trial = { data: { stepperState: damage(goodState(), mutations) } }
      const s = useStepper('trial')
      s.append([{ id: 'x' }])
      s.next()
      expect(isPlainJSON(s.json)).toBe(true)
    }), { numRuns: 200 })
  })

  it('a damaged leaf keeps the position (the bad child becomes an empty step)', () => {
    const state = goodState()
    state.states[1].states[0] = 'garbage'
    const s = new Stepper({ serializedState: state, store })
    expect(s.currentPathString).toBe('b2/1')
    expect(s.currentData).toEqual({ t: 4 })
  })

  it('damaged step data in one child leaves the others alone', () => {
    const state = goodState()
    state.states[0].states[0].data = 'not an object'
    const s = new Stepper({ serializedState: state, store })
    expect(s.states[1].states[1].data).toEqual({ t: 4 })
    expect(s.data.gvars.score).toBe(2)
  })

  it('an unknown or broken faker marker gives null when called, not an error', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const state = goodState()
    state.data.f = { __fakerFunction: true, name: 'nope', params: [] }
    state.data.g = { __fakerFunction: true, name: 'runif', params: 'not a list' }
    state.data.h = { __fakerFunction: true, name: 'constructor', params: [] }
    const s = new Stepper({ serializedState: state, store })
    expect(s.data.f()).toBe(null)
    expect(() => s.data.g()).not.toThrow()
    expect(s.data.h()).toBe(null)
    warn.mockRestore()
  })
})
