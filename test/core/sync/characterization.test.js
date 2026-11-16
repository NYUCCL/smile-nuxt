import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import useSmileStore, { dataBackupKey } from '../../../src/runtime/stores/smilestore'
import useLog from '../../../src/runtime/stores/log'
import { SmileAPI } from '../../../src/runtime/composables/useAPI'
import { Stepper } from '../../../src/runtime/core/stepper/Stepper'
import { useStepper } from '../../../src/runtime/composables/useStepper'
import appconfig from '../../../src/runtime/core/config.js'
import { BAD_VALUES, BAD_TOP_LEVEL, isPlainJSON } from '../../fixtures/bad-values.js'

/**
 * Step 0 of plans/sync_engine.md: what today's code does with bad data.
 *
 * Each test states the behavior the sync engine must have: recording a value
 * never throws into experiment code, the value (cleaned if need be) is kept,
 * and everything stored stays plain JSON so saving keeps working. Where
 * today's code doesn't do that, the test is listed in KNOWN_FAILURES and runs
 * as `it.fails`. When a later step fixes one, its `it.fails` starts failing:
 * take it off the list.
 */
// Step 1 (toPlainJSON, stepper load repair) fixed all 65 found in step 0.
const KNOWN_FAILURES = new Set([])

function check(id, fn) {
  return KNOWN_FAILURES.has(id) ? it.fails(id, fn) : it(id, fn)
}

const PID = 'p-1'

/** A store connected to a participant, as after consent */
function connectedStore() {
  const store = useSmileStore()
  store.cookieState.participantId = PID
  store.setDataLoaded()
  return store
}

function makeAPI(store) {
  return new SmileAPI(store, useLog(), { name: 'trial', path: '/trial' }, {}, null, {})
}

/** A $fetch stand-in that serializes its body as ofetch does */
function serializingFetch() {
  return vi.fn(async (url, opts) => {
    if (opts?.body !== undefined) JSON.stringify(opts.body)
    return {}
  })
}

let fetchMock

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  fetchMock = serializingFetch()
  vi.stubGlobal('$fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('recording a bad value', () => {
  for (const bad of BAD_VALUES) {
    describe(bad.name, () => {
      check(`recordPageData: ${bad.name}`, () => {
        const store = connectedStore()
        const api = makeAPI(store)
        let ok
        expect(() => {
          ok = api.recordPageData(bad.make(), 'trial')
        }).not.toThrow()
        expect(ok).toBe(true)
        expect(store.data.pageData_trial.visit_0.data).toHaveLength(1)
        expect(isPlainJSON(store.data)).toBe(true)
      })

      check(`recordProperty: ${bad.name}`, () => {
        const store = connectedStore()
        const api = makeAPI(store)
        expect(() => api.recordProperty('prop', bad.make())).not.toThrow()
        expect(store.data.prop).toBeDefined()
        expect(isPlainJSON(store.data)).toBe(true)
      })

      check(`recordWindowEvent: ${bad.name}`, () => {
        const store = connectedStore()
        const api = makeAPI(store)
        const before = store.data.browserData.length
        expect(() => api.recordWindowEvent('blur', bad.make())).not.toThrow()
        expect(store.data.browserData).toHaveLength(before + 1)
        expect(isPlainJSON(store.data)).toBe(true)
      })
    })
  }

  for (const bad of BAD_TOP_LEVEL) {
    check(`recordPageData, whole argument: ${bad.name}`, () => {
      const store = connectedStore()
      const api = makeAPI(store)
      let ok
      expect(() => {
        ok = api.recordPageData(bad.make(), 'trial')
      }).not.toThrow()
      expect(ok).toBe(true)
      expect(isPlainJSON(store.data)).toBe(true)
    })
  }
})

describe('saving after a bad value reaches store.data', () => {
  // Experiment code can write to api.data directly, and recordWindowEvent
  // stores its argument as given, so store.data can hold anything.
  const dataPatches = () => fetchMock.mock.calls.filter(([url, opts]) =>
    opts?.method === 'PATCH' && !String(url).endsWith('/private'))

  for (const bad of BAD_VALUES.filter(b => !b.slow)) {
    check(`saveData still saves: ${bad.name}`, async () => {
      const store = connectedStore()
      store.data.bad = bad.make()
      store.data.good = 'kept'
      await store.saveData(true)
      expect(dataPatches()).toHaveLength(1)
      // What the server got is plain JSON and still has the good value
      const sent = JSON.parse(JSON.stringify(dataPatches()[0][1].body))
      expect(sent.data.good).toBe('kept')
    })

    check(`the local backup is still written: ${bad.name}`, () => {
      const store = connectedStore()
      store.data.bad = bad.make()
      store.data.good = 'kept'
      store.noteDataChanged({ replaced: false })
      const backup = JSON.parse(localStorage.getItem(dataBackupKey))
      expect(backup?.data?.good).toBe('kept')
    })
  }
})

describe('stepper state with a bad value in step data', () => {
  function stepperWith(store, value) {
    const root = new Stepper({ id: '/', parent: null, data: { gvars: {} }, store })
    root.name = 'trial'
    root.append([{ id: 'a', value }, { id: 'b', value: 'plain' }])
    return root
  }

  for (const bad of BAD_VALUES.filter(b => !b.slow)) {
    check(`stepper save and reload: ${bad.name}`, () => {
      const store = useSmileStore()
      const root = stepperWith(store, bad.make().value ?? bad.make())
      root.next()
      root.next()

      let ok
      expect(() => {
        ok = root.save('trial')
      }).not.toThrow()
      expect(ok).toBe(true)

      // What reached localStorage parses, and loads back at the same step
      const saved = JSON.parse(localStorage.getItem(appconfig.localStorageKey))
      const state = saved.viewSteppers.trial.data.stepperState
      const reloaded = new Stepper({ serializedState: state, store })
      expect(reloaded.currentPathString).toBe(root.currentPathString)
      expect(reloaded.currentData.id).toBe('b')
    })
  }
})

describe('loading damaged stepper state', () => {
  const good = () => {
    const store = useSmileStore()
    const root = new Stepper({ id: '/', parent: null, data: { gvars: {} }, store })
    root.append([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    root.next() // at 'b'
    return JSON.parse(JSON.stringify(root.json))
  }

  /** Change a copy of the state and return it */
  const without = (state, change) => {
    change(state)
    return state
  }

  // salvage: part of the state is damaged but the position can still be kept
  // ('any': the index itself is bad, so any valid step will do)
  const DAMAGED = [
    { name: 'null', make: () => null },
    { name: 'a string', make: () => '{"id":"/"' },
    { name: 'missing states', make: () => without(good(), s => delete s.states) },
    { name: 'states is an object', make: () => ({ ...good(), states: {} }) },
    { name: 'currentIndex past the end', make: () => ({ ...good(), currentIndex: 99 }), salvage: 'any' },
    { name: 'negative currentIndex', make: () => ({ ...good(), currentIndex: -1 }), salvage: 'any' },
    { name: 'currentIndex as a string', make: () => ({ ...good(), currentIndex: '1' }), salvage: true },
    { name: 'a child with no id', make: () => without(good(), s => delete s.states[0].id), salvage: true },
    { name: 'a child that is null', make: () => without(good(), s => (s.states[0] = null)), salvage: true },
    { name: 'unknown faker function', make: () => ({ ...good(), data: { f: { __fakerFunction: true, name: 'nope', params: [] } } }), salvage: true },
    { name: 'faker params not an array', make: () => ({ ...good(), data: { f: { __fakerFunction: true, name: 'runif', params: 3 } } }), salvage: true },
  ]

  for (const d of DAMAGED) {
    // What the app does today: useStepper() catches a failed load and starts
    // the view over. The page must never break.
    check(`useStepper with damaged state still gives a working stepper: ${d.name}`, () => {
      const store = useSmileStore()
      store.localState.viewSteppers.trial = { data: { stepperState: d.make() } }
      let s
      expect(() => {
        s = useStepper('trial')
      }).not.toThrow()
      expect(() => {
        s.append([{ id: 'x' }])
        s.next()
        JSON.stringify(s.json)
      }).not.toThrow()
    })

    // What the sync engine must do: load what it can rather than lose the
    // participant's place in the view.
    if (d.salvage) {
      check(`damaged state keeps the position: ${d.name}`, () => {
        const store = useSmileStore()
        let s
        expect(() => {
          s = new Stepper({ serializedState: d.make(), store })
        }).not.toThrow()
        if (d.salvage === 'any') expect(['a', 'b', 'c']).toContain(s.currentData?.id)
        else expect(s.currentData?.id).toBe('b')
        expect(() => {
          s.next()
          JSON.stringify(s.json)
        }).not.toThrow()
      })
    }
  }
})
