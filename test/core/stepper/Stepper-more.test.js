/**
 * @fileoverview Stepper, StepState and StepperSerializer: the cases the
 * other stepper tests don't reach. Saving without a store or a name, zip()
 * with columns of different lengths, id generators, step ids the tree can't
 * use, component references in step data, the tree picture for the dev
 * tools, and a few StepState getters.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Stepper } from '../../../src/runtime/core/stepper/Stepper.js'
import { StepState } from '../../../src/runtime/core/stepper/StepState.js'
import { StepperSerializer } from '../../../src/runtime/core/stepper/StepperSerializer.js'
import useLog from '../../../src/runtime/stores/log'

const fakeStore = () => ({ localState: { viewSteppers: {} } })

describe('Stepper: more cases', () => {
  let log

  beforeEach(() => {
    log = useLog()
    for (const fn of [log.warn, log.error, log.debug]) fn.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('save', () => {
    it('returns false, with a warning, when the stepper has no store', () => {
      const stepper = new Stepper()
      expect(stepper.save('task')).toBe(false)
      expect(log.warn).toHaveBeenCalledWith('Stepper: Cannot save state - no store reference available')
    })

    it('returns false, with a warning, when there is no page name and the stepper has no name', () => {
      const store = fakeStore()
      const stepper = new Stepper({ store })
      expect(stepper.save()).toBe(false)
      expect(log.warn).toHaveBeenCalledWith('Stepper: Cannot save state - no page name provided and stepper has no name')
      expect(store.localState.viewSteppers).toEqual({})
    })

    it('saves under the stepper\'s name when no page is given', () => {
      const store = fakeStore()
      const stepper = new Stepper({ store })
      stepper.name = 'task'
      stepper.append([{ id: 'a', n: 1 }])
      expect(stepper.save()).toBe(true)
      expect(store.localState.viewSteppers.task.data.stepperState.states[0].data).toEqual({ id: 'a', n: 1 })
    })

    it('saves under the page given, in place of the name', () => {
      const store = fakeStore()
      const stepper = new Stepper({ store })
      stepper.name = 'task'
      expect(stepper.save('other')).toBe(true)
      expect(Object.keys(store.localState.viewSteppers)).toEqual(['other'])
    })

    it('saves step data that plain JSON can\'t hold, and warns once', () => {
      const store = fakeStore()
      const stepper = new Stepper({ store })
      stepper.append([{ id: 'a', big: 5n }, { id: 'b', big: 6n }])
      expect(stepper.save('task')).toBe(true)
      expect(() => JSON.stringify(store.localState.viewSteppers.task)).not.toThrow()
      expect(stepper.save('task')).toBe(true)
      const cleaned = log.warn.mock.calls.filter(([m]) => String(m).startsWith('Stepper: step data cleaned to save it'))
      expect(cleaned).toHaveLength(1)
      expect(cleaned[0][0]).toMatch(/and 1 more\)$/)
    })

    it('the warning names the one value when only one was cleaned', () => {
      const store = fakeStore()
      const stepper = new Stepper({ store })
      stepper.append([{ id: 'a', big: 5n }])
      stepper.save('task')
      const cleaned = log.warn.mock.calls.map(([m]) => String(m)).find(m => m.startsWith('Stepper: step data cleaned'))
      expect(cleaned).toMatch(/\)$/)
      expect(cleaned).not.toContain('more')
    })

    it('returns false, with an error, when the state can\'t be serialized at all', () => {
      const store = fakeStore()
      const stepper = new Stepper({ store })
      vi.spyOn(StepperSerializer, 'serialize').mockImplementation(() => {
        throw new Error('broken')
      })
      expect(stepper.save('task')).toBe(false)
      expect(log.error).toHaveBeenCalledWith('Stepper: could not serialize state: Error: broken')
      expect(store.localState.viewSteppers).toEqual({})
    })
  })

  describe('append', () => {
    it('takes a single object as well as an array', () => {
      const stepper = new Stepper()
      stepper.append({ id: 'only', n: 1 })
      expect(stepper.states.map(s => s.id)).toEqual(['only'])
    })

    it('numbers the steps that have no id', () => {
      const stepper = new Stepper()
      stepper.append([{ n: 1 }, { n: 2 }])
      expect(stepper.states.map(s => s.id)).toEqual([0, 1])
    })

    it('logs an error and skips a step whose id contains a slash; the others are added', () => {
      const stepper = new Stepper()
      stepper.append([{ id: 'ok' }, { id: 'a/b' }, { id: 'also-ok' }])
      expect(stepper.states.map(s => s.id)).toEqual(['ok', 'also-ok'])
      expect(log.error).toHaveBeenCalledWith('State id cannot contain slashes (id: "a/b")')
    })

    it('calls the modify callback', () => {
      const stepper = new Stepper()
      const onModify = vi.fn()
      stepper.setOnModify(onModify)
      stepper.append([{ id: 'a' }])
      expect(onModify).toHaveBeenCalledTimes(1)
    })

    it('remembers a component found in step data by its name', () => {
      const Card = { name: 'Card', template: '<div/>' }
      const Rendered = { name: 'Rendered', render: () => null }
      const stepper = new Stepper()
      stepper.append([{ id: 'a', type: Card, other: Rendered, plain: { name: 'NotAComponent' }, n: 1 }])
      expect(stepper._componentRegistry.get('Card')).toBe(Card)
      expect(stepper._componentRegistry.get('Rendered')).toBe(Rendered)
      expect(stepper._componentRegistry.has('NotAComponent')).toBe(false)
    })

    it('remembers the component even when the step is skipped as a duplicate', () => {
      const Card = { name: 'Card', template: '<div/>' }
      const stepper = new Stepper()
      stepper.append([{ id: 'a', n: 1 }])
      stepper.append([{ id: 'a', type: Card }])
      expect(stepper.states).toHaveLength(1)
      expect(stepper._componentRegistry.get('Card')).toBe(Card)
    })

    it('is not stopped by a step whose values throw when read', () => {
      const hostile = new Proxy({}, {
        ownKeys() {
          throw new Error('no keys')
        },
      })
      const getter = {
        id: 'getter',
        get bad() {
          throw new Error('no value')
        },
      }
      const stepper = new Stepper()
      expect(() => stepper._registerComponentsFromData(hostile)).not.toThrow()
      expect(() => stepper._registerComponentsFromData(getter)).not.toThrow()
      expect(() => stepper._registerComponentsFromData(null)).not.toThrow()
      expect(() => stepper._registerComponentsFromData('text')).not.toThrow()
      expect(stepper._componentRegistry.size).toBe(0)
    })
  })

  describe('outer', () => {
    it('needs an object with at least one column', () => {
      const stepper = new Stepper()
      expect(() => stepper.outer(null)).toThrow('outer() requires an object with arrays as values')
      expect(() => stepper.outer('x')).toThrow('outer() requires an object with arrays as values')
      expect(() => stepper.outer({})).toThrow('outer() requires at least one column')
    })

    it('uses the id generator for each combination', () => {
      const stepper = new Stepper()
      stepper.outer({ color: ['red', 'blue'], size: [1, 2] }, row => `${row.color}-${row.size}`)
      expect(stepper.states.map(s => s.id)).toEqual(['red-1', 'red-2', 'blue-1', 'blue-2'])
      expect(stepper.states[0].data).toEqual({ color: 'red', size: 1, id: 'red-1' })
    })

    it('treats a value that is not an array as a column of one', () => {
      const stepper = new Stepper()
      stepper.outer({ color: ['red', 'blue'], block: 'practice' })
      expect(stepper.states.map(s => s.data)).toEqual([
        { color: 'red', block: 'practice' },
        { color: 'blue', block: 'practice' },
      ])
    })
  })

  describe('zip', () => {
    const rows = stepper => stepper.states.map(s => s.data)

    it('needs an object with at least one column', () => {
      const stepper = new Stepper()
      expect(() => stepper.zip(null)).toThrow('zip() requires an object with arrays as values')
      expect(() => stepper.zip({})).toThrow('zip() requires at least one column')
    })

    it('pairs the columns row by row', () => {
      const stepper = new Stepper()
      stepper.zip({ a: [1, 2], b: ['x', 'y'] })
      expect(rows(stepper)).toEqual([{ a: 1, b: 'x' }, { a: 2, b: 'y' }])
    })

    it('refuses columns of different lengths unless a method is given', () => {
      const stepper = new Stepper()
      expect(() => stepper.zip({ a: [1, 2, 3], b: ['x'] })).toThrow(/Specify a method \(loop, pad, last\)/)
      expect(stepper.states).toHaveLength(0)
    })

    it('"loop" repeats the shorter column', () => {
      const stepper = new Stepper()
      stepper.zip({ a: [1, 2, 3], b: ['x', 'y'] }, { method: 'loop' })
      expect(rows(stepper)).toEqual([{ a: 1, b: 'x' }, { a: 2, b: 'y' }, { a: 3, b: 'x' }])
    })

    it('"pad" fills the shorter column with padValue', () => {
      const stepper = new Stepper()
      stepper.zip({ a: [1, 2, 3], b: ['x'] }, { method: 'pad', padValue: null })
      expect(rows(stepper)).toEqual([{ a: 1, b: 'x' }, { a: 2, b: null }, { a: 3, b: null }])
    })

    it('"pad" needs a padValue', () => {
      const stepper = new Stepper()
      expect(() => stepper.zip({ a: [1, 2], b: ['x'] }, { method: 'pad' })).toThrow('padValue is required when using the pad method')
    })

    it('"last" repeats the shorter column\'s last value', () => {
      const stepper = new Stepper()
      stepper.zip({ a: [1, 2, 3], b: ['x', 'y'] }, { method: 'last' })
      expect(rows(stepper)).toEqual([{ a: 1, b: 'x' }, { a: 2, b: 'y' }, { a: 3, b: 'y' }])
    })

    it('refuses a method it does not know', () => {
      const stepper = new Stepper()
      expect(() => stepper.zip({ a: [1, 2], b: ['x'] }, { method: 'stretch' })).toThrow('Invalid method: stretch. Must be one of: loop, pad, last')
    })

    it('treats a value that is not an array as a column of one', () => {
      const stepper = new Stepper()
      stepper.zip({ a: [1, 2], block: 'practice' }, { method: 'last' })
      expect(rows(stepper)).toEqual([{ a: 1, block: 'practice' }, { a: 2, block: 'practice' }])
    })

    it('takes an id generator, alone or before the options', () => {
      const stepper = new Stepper()
      stepper.zip({ a: [1, 2], b: ['x', 'y'] }, row => `t${row.a}`)
      expect(stepper.states.map(s => s.id)).toEqual(['t1', 't2'])

      const other = new Stepper()
      other.zip({ a: [1, 2, 3], b: ['x'] }, row => `${row.b}${row.a}`, { method: 'loop' })
      expect(other.states.map(s => s.id)).toEqual(['x1', 'x2', 'x3'])
    })
  })

  describe('visualize', () => {
    it('gives the tree as plain objects: data, path, index, and whether each node is a leaf', () => {
      const stepper = new Stepper()
      stepper.append([{ id: 'block' }, { id: 'last', n: 3 }])
      stepper[0].append([{ id: 'x', n: 1 }, { id: 'y', n: 2 }])
      const tree = stepper.visualize()
      expect(tree.isLeaf).toBe(false)
      expect(tree.rows.map(r => r.path)).toEqual(['block', 'last'])
      const [block, last] = tree.rows
      expect(block.isLeaf).toBe(false)
      expect(block.rows.map(r => r.path)).toEqual(['block/x', 'block/y'])
      expect(block.rows[0]).toMatchObject({ data: { id: 'x', n: 1 }, isLeaf: true, isFirstLeaf: true, rows: [] })
      expect(block.rows[1].isFirstLeaf).toBe(false)
      expect(last).toMatchObject({ data: { id: 'last', n: 3 }, isLeaf: true, isFirstLeaf: false })
    })

    it('is an empty tree for a stepper with no steps', () => {
      const tree = new Stepper().visualize()
      expect(tree.rows).toEqual([])
      expect(tree.isLeaf).toBe(true)
      expect(tree.isFirstLeaf).toBe(false)
    })
  })

  describe('clearing', () => {
    it('clearCurrentStepData empties the data of the step the stepper is on, and no other', () => {
      const stepper = new Stepper()
      stepper.append([{ id: 'block' }])
      stepper[0].append([{ id: 'x', n: 1 }, { id: 'y', n: 2 }])
      stepper.next()
      stepper.clearCurrentStepData()
      expect(stepper[0].states.map(s => s.data)).toEqual([{ id: 'x', n: 1 }, {}])
    })

    it('clearSubTree removes the steps and forgets that they were shuffled', () => {
      const stepper = new Stepper()
      stepper.append([{ id: 'a' }, { id: 'b' }])
      stepper.shuffle()
      stepper.clearSubTree()
      expect(stepper.states).toHaveLength(0)
      expect(stepper._shuffled).toBe(false)
    })
  })
})

describe('StepState: getters', () => {
  /** root → [a → [a1, a2], b] */
  function tree() {
    const root = new StepState()
    const a = root.push('a', { name: 'A' })
    a.push('a1', { n: 1 })
    a.push('a2', { n: 2 })
    root.push('b', { name: 'B' })
    return root
  }

  it('rows and states are the same children; statesData and rowsData are their data', () => {
    const root = tree()
    expect(root.rows).toBe(root.states)
    expect(root.statesData).toEqual([{ name: 'A' }, { name: 'B' }])
    expect(root.rowsData).toEqual(root.statesData)
    expect(root.length).toBe(2)
  })

  it('the states setter replaces the children', () => {
    const root = tree()
    const only = new StepState('only', root)
    root.states = [only]
    expect(root.states).toEqual([only])
    expect(root.hasSteps()).toBe(true)
  })

  it('hasSteps is false for a node without children', () => {
    expect(new StepState().hasSteps()).toBe(false)
    expect(tree().states[1].hasSteps()).toBe(false)
  })

  it('parentIndex is the parent\'s current position, and null for the root', () => {
    const root = tree()
    const a = root.states[0]
    expect(root.parentIndex).toBeNull()
    expect(a.states[0].parentIndex).toBe(0)
    root.next()
    expect(a.states[0].parentIndex).toBe(1)
  })

  it('isFirstLeaf is true only for the leftmost leaf', () => {
    const root = tree()
    const [a, b] = root.states
    expect(a.states[0].isFirstLeaf).toBe(true)
    expect(a.states[1].isFirstLeaf).toBe(false)
    expect(b.isFirstLeaf).toBe(false)
    expect(a.isFirstLeaf).toBe(false)
    expect(root.isFirstLeaf).toBe(false)
  })

  it('isFirstLeaf is false for a root with no children', () => {
    expect(new StepState().isFirstLeaf).toBe(false)
  })

  it('dataAlongPath includes the root\'s data when the root has its own id', () => {
    const root = new StepState('custom-root')
    root.data = { level: 'root' }
    root.push('a', { level: 'a' })
    expect(root.dataAlongPath).toEqual([{ level: 'root' }, { level: 'a' }])
  })

  it('dataAlongPath leaves out the data of a root named "/"', () => {
    const root = new StepState()
    root.data = { gvars: {} }
    root.push('a', { level: 'a' })
    expect(root.dataAlongPath).toEqual([{ level: 'a' }])
  })

  it('insert places a step at an index; a negative index counts from the end', () => {
    const root = new StepState()
    root.push('a')
    root.push('c')
    root.insert('b', 1)
    root.insert('first', 0)
    root.insert('last', 99)
    root.insert('before-last', -2)
    expect(root.states.map(s => s.id)).toEqual(['first', 'a', 'b', 'c', 'before-last', 'last'])
  })

  it('insert refuses an id that already exists at the node, or one with a slash', () => {
    const root = new StepState()
    root.push('a')
    expect(() => root.push('a')).toThrow('State id already exists in at this node (id: "a")')
    expect(() => root.push('x/y')).toThrow('State id cannot contain slashes (id: "x/y")')
    expect(root.states).toHaveLength(1)
  })
})

describe('StepperSerializer: step data', () => {
  const saved = (stepper, i = 0) => StepperSerializer.serialize(stepper).states[i].data

  it('writes a component as a reference by name, and the step remembers the component', () => {
    const Card = { name: 'Card', template: '<div/>' }
    const stepper = new Stepper()
    stepper.append([{ id: 'a', component: Card, type: { name: 'Typed', render: () => null } }])
    expect(saved(stepper)).toMatchObject({
      component: { __vueComponent: true, componentName: 'Card' },
      type: { __vueComponent: true, componentName: 'Typed' },
    })
    // Saving registers the component on the step it belongs to
    const step = stepper.states[0]
    expect(step._componentRegistry.get('Card')).toBe(Card)
    expect(step._componentRegistry.has('Typed')).toBe(true)
  })

  it('keeps a reference that was already saved as a reference', () => {
    const stepper = new Stepper()
    stepper.append([{ id: 'a', component: { __vueComponent: true, componentName: 'Card', extra: 'dropped' } }])
    expect(saved(stepper).component).toEqual({ __vueComponent: true, componentName: 'Card' })
  })

  it('writes a marker for a value that throws when read, and saves the rest of the step', () => {
    const stepper = new Stepper()
    stepper.append([{ id: 'a', n: 1 }])
    Object.defineProperty(stepper.states[0]._data, 'bad', {
      enumerable: true,
      get() {
        throw new Error('no value')
      },
    })
    const data = saved(stepper)
    expect(data.n).toBe(1)
    expect(data.bad).toBe('[Error: no value]')
  })

  it('writes a marker for step data whose keys can\'t be listed', () => {
    const stepper = new Stepper()
    stepper.append([{ id: 'a' }])
    stepper.states[0]._data = new Proxy({}, {
      ownKeys() {
        throw new Error('no keys')
      },
    })
    expect(saved(stepper)).toEqual({ __error: '[Error: no keys]' })
  })

  it('reads faker parameters that are not JSON as trimmed strings', () => {
    const api = { faker: { rnorm: (a, b) => ({ val: a + b, type: 'fake' }) } }
    const mean = 5
    const stepper = new Stepper()
    stepper.append([{ id: 'a', rt: () => api.faker.rnorm(mean, 2) }])
    expect(saved(stepper).rt).toMatchObject({ __fakerFunction: true, name: 'rnorm', params: ['mean', '2'] })
  })
})

describe('StepperSerializer: loading', () => {
  const load = (data) => {
    const stepper = new Stepper()
    StepperSerializer.deserialize(data, stepper, stepper)
    return stepper
  }

  it('uses empty data, and says so, when a step\'s saved data can\'t be rebuilt', () => {
    const log = useLog()
    log.warn.mockClear()
    vi.spyOn(StepperSerializer, '_reconstructData').mockImplementationOnce(() => {
      throw new Error('bad data')
    })
    const stepper = load({ id: '/', currentIndex: 0, depth: 0, data: { a: 1 }, states: [] })
    expect(stepper.data).toEqual({})
    expect(log.warn).toHaveBeenCalledWith(expect.stringMatching(/^Stepper: repaired saved state at .*data/))
    vi.restoreAllMocks()
  })

  it('falls back to console.warn when the log store can\'t be used', () => {
    const log = useLog()
    log.warn.mockImplementationOnce(() => {
      throw new Error('no pinia')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(StepperSerializer, '_reconstructData').mockImplementationOnce(() => {
      throw new Error('bad data')
    })
    load({ id: '/', currentIndex: 0, depth: 0, data: {}, states: [] })
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^Stepper: repaired saved state at /))
    vi.restoreAllMocks()
  })

  it('gives null, with a warning, for a saved faker call that fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stepper = load({
      id: '/', currentIndex: 0, depth: 0, data: {},
      states: [{
        id: 'a', currentIndex: 0, depth: 1, states: [],
        // rchoice throws for an empty list of options
        data: { pick: { __fakerFunction: true, name: 'rchoice', params: [[]] } },
      }],
    })
    // The saved call comes back as a function, called when the value is read
    expect(typeof stepper.states[0].data.pick).toBe('function')
    expect(stepper.states[0].data.pick()).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Faker function rchoice failed during reconstruction'))
    vi.restoreAllMocks()
  })
})
