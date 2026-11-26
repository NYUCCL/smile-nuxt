/**
 * @fileoverview useViewAPI.js: step navigation at the ends, the block
 * helpers, persisted variables, writing through stepData, resolving
 * component references in dataAlongPath, the step data queries and clearing.
 * The view API is created directly (no component), on a real store.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRoute, useNuxtApp } from '#imports'
import useViewAPI from '../../../src/runtime/composables/useViewAPI.js'
import useSmileStore from '../../../src/runtime/stores/smilestore'

describe('useViewAPI', () => {
  let api, store

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.mocked(useRoute).mockReturnValue({ path: '/task', name: 'task', query: {}, params: {} })
    vi.mocked(useNuxtApp).mockReturnValue({ $timeline: null })
    useViewAPI._reset()
    store = useSmileStore()
    api = useViewAPI()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    store.stopSnapshots()
    useViewAPI._reset()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns the same instance on every call until it is reset', () => {
    expect(useViewAPI()).toBe(api)
    useViewAPI._reset()
    expect(useViewAPI()).not.toBe(api)
  })

  it('names the view after the route when the timeline does not know the path', () => {
    api.steps.append([{ id: 'a' }])
    api.goFirstStep()
    expect(store.localState.viewSteppers.task).toBeDefined()
    expect(store.dev.viewProvidesStepper).toBe(true)
  })

  describe('steps', () => {
    it('hasSteps is false for an empty view and true once steps are added', () => {
      expect(api.hasSteps()).toBe(false)
      api.steps.append([{ id: 'a' }])
      expect(api.hasSteps()).toBe(true)
    })

    it('goNextStep returns null at the last step and stays there', () => {
      api.steps.append([{ id: 'a' }, { id: 'b' }])
      expect(api.pathString).toBe('a')
      expect(api.goNextStep()).not.toBeNull()
      expect(api.pathString).toBe('b')
      expect(api.hasNextStep()).toBe(false)
      expect(api.goNextStep()).toBeNull()
      expect(api.pathString).toBe('b')
    })

    it('goPrevStep returns null at the first step and stays there', () => {
      api.steps.append([{ id: 'a' }, { id: 'b' }])
      expect(api.hasPrevStep()).toBe(false)
      expect(api.goPrevStep()).toBeNull()
      expect(api.pathString).toBe('a')
    })

    it('the step functions scroll the experiment\'s container to the top unless told not to', () => {
      document.body.innerHTML = '<div class="device-container"></div>'
      const el = document.querySelector('.device-container')
      api.steps.append([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
      const scrolled = () => {
        const top = el.scrollTop
        el.scrollTop = 300
        return top
      }
      el.scrollTop = 300

      api.goNextStep(false)
      expect(scrolled()).toBe(300)
      api.goNextStep()
      expect(scrolled()).toBe(0)
      api.goPrevStep(false)
      expect(scrolled()).toBe(300)
      api.goPrevStep()
      expect(scrolled()).toBe(0)
      api.goToStep('c', false)
      expect(scrolled()).toBe(300)
      api.goToStep('a')
      expect(scrolled()).toBe(0)
      api.goFirstStep(false)
      expect(scrolled()).toBe(300)
      api.goFirstStep()
      expect(scrolled()).toBe(0)
    })

    it('stepIndex, isLastStep, length and stepLength count the leaf steps', () => {
      api.steps.append([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
      expect(api.length).toBe(3)
      expect(api.stepLength).toBe(3)
      expect(api.nSteps).toBe(3)
      expect(api.stepIndex).toBe(0)
      expect(api.isLastStep()).toBe(false)
      api.goToStep('c')
      expect(api.stepIndex).toBe(2)
      expect(api.isLastStep()).toBe(true)
      expect(api.path).toEqual(['c'])
    })

    it('isLastBlockStep is about the position in the current block', () => {
      const block = api.steps.append([{ id: 'block' }])[0]
      block.append([{ id: 'x' }, { id: 'y' }])
      api.steps.append([{ id: 'after' }])
      api.goFirstStep()
      expect(api.pathString).toBe('block/x')
      expect(api.blockLength).toBe(2)
      expect(api.blockIndex).toBe(0)
      expect(api.isLastBlockStep()).toBe(false)
      api.goNextStep()
      expect(api.pathString).toBe('block/y')
      expect(api.isLastBlockStep()).toBe(true)
      // The last step of the block is not the last step of the view
      expect(api.isLastStep()).toBe(false)
    })
  })

  describe('persist', () => {
    it('keeps values, and isDefined says whether a name has been set', () => {
      api.steps.append([{ id: 'a' }])
      expect(api.persist.isDefined('score')).toBe(false)
      api.persist.score = 0
      expect(api.persist.isDefined('score')).toBe(true)
      expect(api.persist.score).toBe(0)
    })

    it('creates the store for the values when the stepper has none', () => {
      delete api.steps.root.data.gvars
      expect(api.persist.isDefined('x')).toBe(false)
      expect(api.steps.root.data.gvars).toEqual({})
    })

    it('a change inside a nested object is kept and saved', () => {
      vi.useFakeTimers()
      api.steps.append([{ id: 'a' }])
      api.persist.settings = { volume: 1, deep: { on: false } }
      api.persist.settings.volume = 7
      api.persist.settings.deep.on = true
      expect(api.persist.settings.volume).toBe(7)
      expect(api.persist.settings.deep.on).toBe(true)
      const update = vi.spyOn(api, 'updateStepper')
      vi.advanceTimersByTime(5)
      expect(update).toHaveBeenCalled()
      expect(JSON.stringify(store.localState.viewSteppers.task)).toContain('"volume":7')
    })

    it('an array is returned as it is', () => {
      api.persist.list = [1, 2, 3]
      expect(api.persist.list).toEqual([1, 2, 3])
      expect(Array.isArray(api.persist.list)).toBe(true)
    })

    it('clearPersist removes every value and saves', () => {
      api.steps.append([{ id: 'a' }])
      api.persist.score = 5
      api.clearPersist()
      expect(api.persist.isDefined('score')).toBe(false)
      expect(JSON.stringify(store.localState.viewSteppers.task)).not.toContain('"score"')
    })
  })

  describe('timers', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(10_000)
    })

    it('a timer is not started until startTimer is called', () => {
      expect(api.isTimerStarted()).toBe(false)
      expect(api.isTimerStarted('rt')).toBe(false)
      api.startTimer('rt')
      expect(api.isTimerStarted('rt')).toBe(true)
      expect(api.isTimerStarted()).toBe(false)
    })

    it('elapsed time is counted from the start, in ms, seconds and minutes', () => {
      api.startTimer()
      vi.setSystemTime(10_000 + 90_000)
      expect(api.elapsedTime()).toBe(90_000)
      expect(api.elapsedTimeInSeconds()).toBe(90)
      expect(api.elapsedTimeInMinutes()).toBe(1.5)
    })

    it('timers with different names are separate', () => {
      api.startTimer('a')
      vi.setSystemTime(12_000)
      api.startTimer('b')
      vi.setSystemTime(15_000)
      expect(api.elapsedTime('a')).toBe(5000)
      expect(api.elapsedTime('b')).toBe(3000)
    })
  })

  describe('stepData', () => {
    it('is the block\'s data merged with the step\'s; the step wins', () => {
      const block = api.steps.append([{ id: 'block', color: 'red', size: 1 }])[0]
      block.append([{ id: 'x', size: 2 }])
      api.goFirstStep()
      expect(api.stepData.color).toBe('red')
      expect(api.stepData.size).toBe(2)
    })

    it('a value set on it is written to the current step and saved', () => {
      api.steps.append([{ id: 'a' }, { id: 'b' }])
      api.stepData.response = 'yes'
      expect(api.steps.currentData.response).toBe('yes')
      expect(api.stepDataLeaf.response).toBe('yes')
      expect(JSON.stringify(store.localState.viewSteppers.task)).toContain('"response":"yes"')
      api.goNextStep()
      expect(api.stepData.response).toBeUndefined()
    })

    it('a value set inside a nested object is written at the same place in the step\'s data', () => {
      api.steps.append([{ id: 'a', answers: { first: 1 } }])
      api.stepData.answers.second = 2
      expect(api.steps.currentData.answers).toEqual({ first: 1, second: 2 })
    })

    it('a nested value that comes from the block is created on the step when written', () => {
      const block = api.steps.append([{ id: 'block', settings: { level: 1 } }])[0]
      block.append([{ id: 'x' }])
      api.goFirstStep()
      api.stepData.settings.level = 5
      expect(api.steps.currentData.settings).toEqual({ level: 5 })
    })

    it('an element set in an array is written to the step\'s array', () => {
      api.steps.append([{ id: 'a', choices: ['x', 'y', 'z'] }])
      api.stepData.choices[1] = 'changed'
      expect(api.steps.currentData.choices[1]).toBe('changed')
      expect(api.stepData.choices.length).toBe(3)
    })

    it('an object inside an array can be written through', () => {
      api.steps.append([{ id: 'a', items: [{ n: 1 }, { n: 2 }] }])
      api.stepData.items[1].n = 20
      expect(api.steps.currentData.items[1].n).toBe(20)
    })

    it('an array that comes from the block is created on the step when written', () => {
      const block = api.steps.append([{ id: 'block', list: ['a', 'b'] }])[0]
      block.append([{ id: 'x' }])
      api.goFirstStep()
      api.stepData.list[0] = 'z'
      expect(api.steps.currentData.list[0]).toBe('z')
    })

    it('recordStep records the merged step data for the page', () => {
      const block = api.steps.append([{ id: 'block', color: 'red' }])[0]
      block.append([{ id: 'x', n: 1 }])
      api.goFirstStep()
      api.stepData.response = 'left'
      // recordPageData names the page from the timeline
      vi.mocked(useNuxtApp).mockReturnValue({ $timeline: { getViewForPath: () => ({ name: 'task' }) } })
      api.recordStep()
      const recorded = store.data.pageData_task.visit_0.data
      expect(recorded).toHaveLength(1)
      expect(recorded[0]).toMatchObject({ color: 'red', n: 1, response: 'left' })
    })
  })

  describe('stepDataLeaf', () => {
    it('has the step\'s own data only, not the block\'s', () => {
      const block = api.steps.append([{ id: 'block', color: 'red' }])[0]
      block.append([{ id: 'x', n: 1 }])
      api.goFirstStep()
      expect(api.stepDataLeaf.n).toBe(1)
      expect(api.stepDataLeaf.color).toBeUndefined()
    })

    it('a value set on it is written to the step and saved', () => {
      api.steps.append([{ id: 'a' }])
      api.stepDataLeaf.rt = 512
      expect(api.steps.currentData.rt).toBe(512)
      expect(JSON.stringify(store.localState.viewSteppers.task)).toContain('"rt":512')
    })

    it('reads nested objects and arrays', () => {
      api.steps.append([{ id: 'a', nested: { list: [{ v: 1 }] } }])
      expect(api.stepDataLeaf.nested.list[0].v).toBe(1)
      expect(api.stepDataLeaf.nested.list.length).toBe(1)
    })
  })

  describe('dataAlongPath', () => {
    const ref = name => ({ __vueComponent: true, componentName: name })

    it('is one entry per level from the block down to the step', () => {
      const block = api.steps.append([{ id: 'block', color: 'red' }])[0]
      block.append([{ id: 'x', n: 1 }])
      api.goFirstStep()
      expect(api.dataAlongPath.map(item => item.id)).toEqual(['block', 'x'])
    })

    it('replaces a saved component reference with the component the stepper knows by that name', () => {
      const Card = { name: 'Card', template: '<div/>' }
      api.steps.append([{ id: 'a', type: ref('Card'), other: 1 }])
      api.steps._componentRegistry.set('Card', Card)
      const item = api.dataAlongPath.at(-1)
      expect(item.type).toEqual(Card)
      expect(item.other).toBe(1)
    })

    it('gives a "not found" placeholder for a reference nothing knows', () => {
      api.steps.append([{ id: 'a', type: ref('Missing') }])
      expect(api.dataAlongPath.at(-1).type).toEqual({ template: '<div>Component Missing not found</div>' })
    })

    it('falls back to the app\'s registered components', () => {
      const Global = { name: 'Global' }
      api.steps.append([{ id: 'a', type: ref('Global') }, { id: 'b', type: ref('ViaApp') }])
      api._appContext = { components: { Global } }
      expect(api.dataAlongPath.at(-1).type).toBe(Global)

      const ViaApp = { name: 'ViaApp' }
      api._appContext = { components: {}, app: { component: vi.fn(name => (name === 'ViaApp' ? ViaApp : undefined)) } }
      api.goNextStep()
      expect(api.dataAlongPath.at(-1).type).toBe(ViaApp)
    })

    it('still gives the placeholder when the app does not know the name either', () => {
      api.steps.append([{ id: 'a', type: ref('Nope') }])
      api._appContext = { components: {}, app: { component: () => undefined } }
      expect(api.dataAlongPath.at(-1).type.template).toContain('Nope not found')
    })

    it('leaves other entries as they are', () => {
      api.steps.append([{ id: 'a', type: 'plain-string' }])
      expect(api.dataAlongPath.at(-1).type).toBe('plain-string')
    })
  })

  describe('step data queries', () => {
    beforeEach(() => {
      const blocks = api.steps.append([{ id: 'practice', kind: 'p' }, { id: 'main', kind: 'm' }])
      blocks[0].append([{ id: 't1', n: 1 }, { id: 't2', n: 2 }])
      blocks[1].append([{ id: 't1', n: 10 }])
    })

    it('queryStepDataLeaf returns every step\'s own data, in order', () => {
      expect(api.queryStepDataLeaf().map(d => d.n)).toEqual([1, 2, 10])
      expect(api.queryStepDataLeaf()[0].kind).toBeUndefined()
    })

    it('queryStepDataLeaf filters by the start of the path; * matches anything', () => {
      expect(api.queryStepDataLeaf('practice').map(d => d.n)).toEqual([1, 2])
      expect(api.queryStepDataLeaf('main/t1').map(d => d.n)).toEqual([10])
      expect(api.queryStepDataLeaf('*/t1').map(d => d.n)).toEqual([1, 10])
      expect(api.queryStepDataLeaf('nothing')).toEqual([])
    })

    it('queryStepData does the same, without persisted variables in the data', () => {
      expect(api.queryStepData().map(d => d.n)).toEqual([1, 2, 10])
      expect(api.queryStepData('main*').map(d => d.n)).toEqual([10])
      for (const d of api.queryStepData()) expect('gvars' in d).toBe(false)
    })

    it('a filter with regex characters is matched as text', () => {
      api.steps.append([{ id: 'a(b)', n: 99 }])
      expect(api.queryStepDataLeaf('a(b)').map(d => d.n)).toEqual([99])
      expect(api.queryStepDataLeaf('a(').map(d => d.n)).toEqual([99])
    })
  })

  describe('clearing', () => {
    it('clearCurrentStepData removes what was recorded on the current step and leaves the others', () => {
      api.steps.append([{ id: 'a' }, { id: 'b' }])
      api.stepData.response = 'first'
      api.goNextStep()
      api.stepData.response = 'second'
      api.clearCurrentStepData()
      expect(api.stepDataLeaf.response).toBeUndefined()
      api.goPrevStep()
      expect(api.stepDataLeaf.response).toBe('first')
    })

    it('clear removes the view\'s steps and its saved state', () => {
      api.steps.append([{ id: 'a' }, { id: 'b' }])
      api.goNextStep()
      expect(store.localState.viewSteppers.task.data.stepperState).toBeDefined()
      api.clear()
      expect(api.steps.states).toHaveLength(0)
      expect(api.hasSteps()).toBe(false)
    })

    it('clear works for a view with no saved state', () => {
      delete store.localState.viewSteppers.task
      expect(() => api.clear()).not.toThrow()
    })
  })
})
