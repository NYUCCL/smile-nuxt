/* eslint-disable no-undef */
import seedrandom from 'seedrandom'
import Timeline from '@/core/timeline/Timeline'
import {
  sampleWithReplacement,
  shuffle,
  randomInt,
} from '@/core/utils/randomization'

/**
 * Integration tests for randomized experiment flows.
 *
 * These tests define createTimeline(api) functions — exactly as a user would
 * write in their design.js — and execute them against a mock API with REAL
 * seeded randomization. This validates that when a user sets up randomized
 * branching, condition assignment, weighted splits, etc., the resulting
 * timeline is valid and reproducible.
 */

// ---------------------------------------------------------------------------
// Shared test infrastructure
// ---------------------------------------------------------------------------

const MockComponent = { template: '<div>Mock</div>' }

/**
 * Creates a mock API that mirrors the real SmileAPI surface used in design.js,
 * but wires in REAL randomization functions (seeded via seedrandom).
 */
function createMockApi() {
  const randomizedRoutes = {}
  const conditions = {}

  const store = {
    getRandomizedRouteByName: vi.fn(name => randomizedRoutes[name] || null),
    setRandomizedRoute: vi.fn((name, option) => {
      randomizedRoutes[name] = option
    }),
    getConditionByName: vi.fn(name => conditions[name] || null),
    setCondition: vi.fn((name, value) => {
      conditions[name] = value
    }),
    registerStepper: vi.fn(),
    config: {
      mode: 'production',
      runtime: {},
      global_app_components: {},
    },
    data: { smileConfig: {} },
    localState: { seqtimeline: [], routes: [], possibleConditions: {} },
  }

  const logStore = {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
    success: vi.fn(),
  }

  const api = {
    store,
    logStore,
    config: store.config,
    data: store.data,
    log: {
      debug: (...args) => logStore.debug(...args),
      error: (...args) => logStore.error(...args),
      warn: (...args) => logStore.warn(...args),
      log: (...args) => logStore.log(...args),
    },

    // Real randomization utilities (depend on seeded Math.random)
    sampleWithReplacement,
    shuffle,
    randomInt,

    // Real randomAssignCondition implementation (simplified from SmileAPI)
    randomAssignCondition(conditionObject) {
      const keys = Object.keys(conditionObject)
      const conditionNames = keys.filter(key => key !== 'weights')
      if (conditionNames.length !== 1) return null

      const [name] = conditionNames
      const current = conditions[name]
      if (current) return current

      const possible = conditionObject[name]
      store.localState.possibleConditions[name] = possible

      const weights = keys.includes('weights') ? conditionObject.weights : undefined
      const selected = sampleWithReplacement(possible, 1, weights)[0]
      conditions[name] = selected
      store.setCondition(name, selected)
      return selected
    },

    getConditionByName(name) {
      return conditions[name] || null
    },

    setCondition(name, value) {
      conditions[name] = value
      store.setCondition(name, value)
    },

    // Stubs for config/component methods called by design.js
    setRuntimeConfig(key, value) {
      store.config.runtime[key] = value
      const { global_app_components: _gac, ...rest } = store.config
      store.data.smileConfig = rest
    },
    getConfig(key) {
      if (key in store.config) return store.config[key]
      if (store.config.runtime && key in store.config.runtime) return store.config.runtime[key]
      return null
    },
    setAppComponent(key, value) {
      store.config.global_app_components[key] = value
    },
  }

  return api
}

/**
 * Helper: verify the seqtimeline forms a valid doubly-linked list.
 */
function assertValidLinkedList(seqtimeline) {
  for (let i = 0; i < seqtimeline.length; i++) {
    const route = seqtimeline[i]
    if (i === 0) {
      expect(route.meta.prev).toBe(null)
    }
    else {
      expect(route.meta.prev).toBe(seqtimeline[i - 1].name)
    }
    if (i === seqtimeline.length - 1) {
      expect(route.meta.next).toBe(null)
    }
    else {
      expect(route.meta.next).toBe(seqtimeline[i + 1].name)
    }
  }
}

// ---------------------------------------------------------------------------
// Example design.js files (test fixtures)
// ---------------------------------------------------------------------------

/**
 * Design 1: Simple random branch (like playground/design.js).
 * Participants are randomly assigned to see either a "number" or "color" page.
 */
function designSimpleRandomBranch(api) {
  const timeline = new Timeline(api)

  timeline.pushSeqView({
    path: '/welcome',
    name: 'welcome_anonymous',
    component: MockComponent,
    meta: { requiresConsent: false },
  })

  timeline.pushSeqView({ name: 'consent', component: MockComponent })
  timeline.pushSeqView({ name: 'instructions', component: MockComponent })
  timeline.pushSeqView({ name: 'exp', component: MockComponent })

  // Randomized branch — exactly like playground/design.js
  timeline.registerView({ name: 'number', component: MockComponent })
  timeline.registerView({ name: 'color', component: MockComponent })
  timeline.pushRandomizedNode({
    name: 'RandomSplit',
    options: [['number'], ['color']],
  })

  timeline.pushSeqView({ name: 'debrief', component: MockComponent })
  timeline.pushSeqView({ name: 'thanks', component: MockComponent })

  timeline.build()
  return timeline
}

/**
 * Design 2: Weighted condition assignment + conditional branching.
 * Between-subjects design with 3 instruction versions (weights 2:1:1),
 * plus a conditional branch that shows different tasks per condition.
 */
function designWeightedConditions(api) {
  const timeline = new Timeline(api)

  // Between-subjects condition assignment with weights
  api.randomAssignCondition({
    instructionsVersion: ['v1', 'v2', 'v3'],
    weights: [2, 1, 1],
  })

  timeline.pushSeqView({
    path: '/welcome',
    name: 'welcome_anonymous',
    component: MockComponent,
    meta: { requiresConsent: false },
  })

  timeline.pushSeqView({ name: 'consent', component: MockComponent })

  // Conditional branching based on assigned condition
  timeline.registerView({ name: 'instructions_v1', component: MockComponent })
  timeline.registerView({ name: 'instructions_v2', component: MockComponent })
  timeline.registerView({ name: 'instructions_v3', component: MockComponent })

  timeline.pushConditionalNode({
    name: 'instructionsBranch',
    instructionsVersion: {
      v1: ['instructions_v1'],
      v2: ['instructions_v2'],
      v3: ['instructions_v3'],
    },
  })

  timeline.pushSeqView({ name: 'task', component: MockComponent })
  timeline.pushSeqView({ name: 'thanks', component: MockComponent })

  timeline.build()
  return timeline
}

/**
 * Design 3: Multiple randomized splits in sequence.
 * Two independent random branches with a fixed page in between.
 */
function designMultipleRandomSplits(api) {
  const timeline = new Timeline(api)

  timeline.pushSeqView({
    path: '/welcome',
    name: 'welcome_anonymous',
    component: MockComponent,
    meta: { requiresConsent: false },
  })

  // First random split: which intro to show
  timeline.registerView({ name: 'introA', component: MockComponent })
  timeline.registerView({ name: 'introB', component: MockComponent })
  timeline.pushRandomizedNode({
    name: 'introSplit',
    options: [['introA'], ['introB']],
  })

  // Fixed middle section
  timeline.pushSeqView({ name: 'mainTask', component: MockComponent })

  // Second random split: task order
  timeline.registerView({ name: 'taskX', component: MockComponent })
  timeline.registerView({ name: 'taskY', component: MockComponent })
  timeline.pushRandomizedNode({
    name: 'taskSplit',
    options: [['taskX', 'taskY'], ['taskY', 'taskX']],
  })

  timeline.pushSeqView({ name: 'thanks', component: MockComponent })

  timeline.build()
  return timeline
}

/**
 * Design 4: Randomized order of a multi-step block.
 * Counterbalance the order of three task blocks.
 */
function designCounterbalancedBlocks(api) {
  const timeline = new Timeline(api)

  timeline.pushSeqView({
    path: '/welcome',
    name: 'welcome_anonymous',
    component: MockComponent,
    meta: { requiresConsent: false },
  })

  timeline.registerView({ name: 'blockA', component: MockComponent })
  timeline.registerView({ name: 'blockB', component: MockComponent })
  timeline.registerView({ name: 'blockC', component: MockComponent })

  timeline.pushRandomizedNode({
    name: 'blockOrder',
    options: [
      ['blockA', 'blockB', 'blockC'],
      ['blockA', 'blockC', 'blockB'],
      ['blockB', 'blockA', 'blockC'],
      ['blockB', 'blockC', 'blockA'],
      ['blockC', 'blockA', 'blockB'],
      ['blockC', 'blockB', 'blockA'],
    ],
  })

  timeline.pushSeqView({ name: 'thanks', component: MockComponent })

  timeline.build()
  return timeline
}

/**
 * Design 5: Nested randomization using registerRandomizedNode.
 * An outer randomized node references an inner registered randomized node.
 */
function designNestedRandomization(api) {
  const timeline = new Timeline(api)

  timeline.pushSeqView({
    path: '/welcome',
    name: 'welcome_anonymous',
    component: MockComponent,
    meta: { requiresConsent: false },
  })

  timeline.registerView({ name: 'phase1', component: MockComponent })
  timeline.registerView({ name: 'phase2a', component: MockComponent })
  timeline.registerView({ name: 'phase2b', component: MockComponent })
  timeline.registerView({ name: 'phase3', component: MockComponent })

  // Inner randomized node (registered, not pushed)
  timeline.registerRandomizedNode({
    name: 'phase2Random',
    options: [['phase2a', 'phase2b'], ['phase2b', 'phase2a']],
  })

  // Outer structure that includes the inner node
  timeline.pushRandomizedNode({
    name: 'mainFlow',
    options: [['phase1', 'phase2Random', 'phase3']],
  })

  timeline.pushSeqView({ name: 'thanks', component: MockComponent })

  timeline.build()
  return timeline
}

/**
 * Design 6: Weighted random split with heavily skewed weights.
 */
function designHeavilyWeightedSplit(api) {
  const timeline = new Timeline(api)

  timeline.pushSeqView({
    path: '/welcome',
    name: 'welcome_anonymous',
    component: MockComponent,
    meta: { requiresConsent: false },
  })

  timeline.registerView({ name: 'controlTask', component: MockComponent })
  timeline.registerView({ name: 'experimentalTask', component: MockComponent })

  timeline.pushRandomizedNode({
    name: 'treatmentAssignment',
    options: [['controlTask'], ['experimentalTask']],
    weights: [9, 1],
  })

  timeline.pushSeqView({ name: 'thanks', component: MockComponent })

  timeline.build()
  return timeline
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Randomized experiment flows — design.js integration tests', () => {
  beforeEach(() => {
    seedrandom('test-seed', { global: true })
  })

  afterEach(() => {
    seedrandom(undefined, { global: true })
  })

  // ---- Design 1: Simple random branch ----
  describe('Design 1: simple random branch (playground pattern)', () => {
    it('should produce a valid timeline with one of two randomized routes', () => {
      const api = createMockApi()
      const timeline = designSimpleRandomBranch(api)

      // welcome + consent + instructions + exp + (number|color) + debrief + thanks = 7
      expect(timeline.seqtimeline.length).toBe(7)

      const names = timeline.seqtimeline.map(r => r.name)
      expect(names[0]).toBe('welcome_anonymous')
      expect(names[1]).toBe('consent')
      expect(names[2]).toBe('instructions')
      expect(names[3]).toBe('exp')
      expect(['number', 'color']).toContain(names[4])
      expect(names[5]).toBe('debrief')
      expect(names[6]).toBe('thanks')

      assertValidLinkedList(timeline.seqtimeline)
    })

    it('should be reproducible with the same seed', () => {
      seedrandom('fixed-seed-abc', { global: true })
      const api1 = createMockApi()
      const t1 = designSimpleRandomBranch(api1)
      const names1 = t1.seqtimeline.map(r => r.name)

      seedrandom('fixed-seed-abc', { global: true })
      const api2 = createMockApi()
      const t2 = designSimpleRandomBranch(api2)
      const names2 = t2.seqtimeline.map(r => r.name)

      expect(names1).toEqual(names2)
    })

    it('should produce both branches across different seeds', () => {
      const selected = new Set()
      for (let i = 0; i < 50; i++) {
        seedrandom(`branch-${i}`, { global: true })
        const api = createMockApi()
        const t = designSimpleRandomBranch(api)
        selected.add(t.seqtimeline[4].name)
      }
      // Both 'number' and 'color' should appear
      expect(selected.has('number')).toBe(true)
      expect(selected.has('color')).toBe(true)
    })
  })

  // ---- Design 2: Weighted conditions ----
  describe('Design 2: weighted condition assignment + conditional branch', () => {
    it('should assign a valid condition and branch accordingly', () => {
      const api = createMockApi()
      const timeline = designWeightedConditions(api)

      // welcome + consent + (instructions_v1|v2|v3) + task + thanks = 5
      expect(timeline.seqtimeline.length).toBe(5)

      const instrName = timeline.seqtimeline[2].name
      expect(['instructions_v1', 'instructions_v2', 'instructions_v3']).toContain(instrName)

      assertValidLinkedList(timeline.seqtimeline)
    })

    it('should respect weights in condition assignment distribution', () => {
      const counts = { v1: 0, v2: 0, v3: 0 }
      const N = 600

      for (let i = 0; i < N; i++) {
        seedrandom(`cond-${i}`, { global: true })
        const api = createMockApi()
        designWeightedConditions(api)

        const assigned = api.getConditionByName('instructionsVersion')
        counts[assigned] += 1
      }

      // Weights are 2:1:1, so v1 should be ~50%, v2 and v3 ~25% each
      expect(counts.v1 / N).toBeGreaterThan(0.35)
      expect(counts.v1 / N).toBeLessThan(0.65)
      expect(counts.v2 / N).toBeGreaterThan(0.10)
      expect(counts.v2 / N).toBeLessThan(0.40)
      expect(counts.v3 / N).toBeGreaterThan(0.10)
      expect(counts.v3 / N).toBeLessThan(0.40)
    })

    it('should not re-assign condition on second run with same api', () => {
      const api = createMockApi()
      const t1 = designWeightedConditions(api)
      const firstCondition = api.getConditionByName('instructionsVersion')
      const firstInstr = t1.seqtimeline[2].name

      // "Rebuild" the timeline with same api (simulates page reload with persisted state)
      // Reset timeline-related state but keep conditions
      api.store.localState.seqtimeline = []
      api.store.localState.routes = []

      const t2 = designWeightedConditions(api)
      const secondCondition = api.getConditionByName('instructionsVersion')
      const secondInstr = t2.seqtimeline[2].name

      expect(secondCondition).toBe(firstCondition)
      expect(secondInstr).toBe(firstInstr)
    })
  })

  // ---- Design 3: Multiple random splits ----
  describe('Design 3: multiple independent randomized splits', () => {
    it('should produce valid timeline with two independent splits', () => {
      const api = createMockApi()
      const timeline = designMultipleRandomSplits(api)

      // welcome + (introA|B) + mainTask + (taskX,taskY in some order) + thanks = 6
      expect(timeline.seqtimeline.length).toBe(6)

      const names = timeline.seqtimeline.map(r => r.name)
      expect(names[0]).toBe('welcome_anonymous')
      expect(['introA', 'introB']).toContain(names[1])
      expect(names[2]).toBe('mainTask')

      // Tasks 3 and 4 should be taskX and taskY in some order
      const taskPair = [names[3], names[4]].sort()
      expect(taskPair).toEqual(['taskX', 'taskY'])

      expect(names[5]).toBe('thanks')
      assertValidLinkedList(timeline.seqtimeline)
    })

    it('should store both randomized selections independently', () => {
      const api = createMockApi()
      designMultipleRandomSplits(api)

      expect(api.store.setRandomizedRoute).toHaveBeenCalledTimes(2)
      const callNames = api.store.setRandomizedRoute.mock.calls.map(c => c[0])
      expect(callNames).toContain('introSplit')
      expect(callNames).toContain('taskSplit')
    })

    it('should produce all four possible combinations across seeds', () => {
      const combos = new Set()
      for (let i = 0; i < 100; i++) {
        seedrandom(`multi-${i}`, { global: true })
        const api = createMockApi()
        const t = designMultipleRandomSplits(api)
        const names = t.seqtimeline.map(r => r.name)
        combos.add(`${names[1]}-${names[3]}${names[4]}`)
      }
      // 2 intro options * 2 task orders = 4 combos
      expect(combos.size).toBe(4)
    })
  })

  // ---- Design 4: Counterbalanced blocks ----
  describe('Design 4: counterbalanced block ordering', () => {
    it('should produce a valid permutation of three blocks', () => {
      const api = createMockApi()
      const timeline = designCounterbalancedBlocks(api)

      // welcome + 3 blocks + thanks = 5
      expect(timeline.seqtimeline.length).toBe(5)

      const blocks = timeline.seqtimeline.slice(1, 4).map(r => r.name).sort()
      expect(blocks).toEqual(['blockA', 'blockB', 'blockC'])

      assertValidLinkedList(timeline.seqtimeline)
    })

    it('should cover multiple orderings across seeds', () => {
      const orderings = new Set()
      for (let i = 0; i < 100; i++) {
        seedrandom(`counter-${i}`, { global: true })
        const api = createMockApi()
        const t = designCounterbalancedBlocks(api)
        const order = t.seqtimeline.slice(1, 4).map(r => r.name).join(',')
        orderings.add(order)
      }
      // With 6 possible orderings and 100 seeds, should see most of them
      expect(orderings.size).toBeGreaterThan(3)
    })
  })

  // ---- Design 5: Nested randomization ----
  describe('Design 5: nested randomization via registerRandomizedNode', () => {
    it('should inline nested randomized nodes into the timeline', () => {
      const api = createMockApi()
      const timeline = designNestedRandomization(api)

      // welcome + phase1 + (phase2a,phase2b in some order) + phase3 + thanks = 6
      expect(timeline.seqtimeline.length).toBe(6)

      const names = timeline.seqtimeline.map(r => r.name)
      expect(names[0]).toBe('welcome_anonymous')
      expect(names[1]).toBe('phase1')

      // Phase 2 pair should be phase2a and phase2b in some order
      const phase2 = [names[2], names[3]].sort()
      expect(phase2).toEqual(['phase2a', 'phase2b'])

      expect(names[4]).toBe('phase3')
      expect(names[5]).toBe('thanks')

      assertValidLinkedList(timeline.seqtimeline)
    })

    it('should be reproducible', () => {
      seedrandom('nested-seed', { global: true })
      const api1 = createMockApi()
      const t1 = designNestedRandomization(api1)

      seedrandom('nested-seed', { global: true })
      const api2 = createMockApi()
      const t2 = designNestedRandomization(api2)

      expect(t1.seqtimeline.map(r => r.name)).toEqual(t2.seqtimeline.map(r => r.name))
    })
  })

  // ---- Design 6: Heavily weighted split ----
  describe('Design 6: heavily weighted treatment assignment', () => {
    it('should produce valid timeline with one treatment arm', () => {
      const api = createMockApi()
      const timeline = designHeavilyWeightedSplit(api)

      // welcome + (controlTask|experimentalTask) + thanks = 3
      expect(timeline.seqtimeline.length).toBe(3)

      const selected = timeline.seqtimeline[1].name
      expect(['controlTask', 'experimentalTask']).toContain(selected)

      assertValidLinkedList(timeline.seqtimeline)
    })

    it('should heavily favor the control arm (9:1 weights)', () => {
      const counts = {}
      const N = 500

      for (let i = 0; i < N; i++) {
        seedrandom(`weight-${i}`, { global: true })
        const api = createMockApi()
        const t = designHeavilyWeightedSplit(api)
        const selected = t.seqtimeline[1].name
        counts[selected] = (counts[selected] || 0) + 1
      }

      expect(counts['controlTask'] / N).toBeGreaterThan(0.75)
      expect(counts['experimentalTask'] / N).toBeLessThan(0.25)
    })
  })

  // ---- Cross-cutting: persistence ----
  describe('Cross-cutting: stored route persistence', () => {
    it('should reuse previously selected randomized route on rebuild', () => {
      const api = createMockApi()

      // First build
      const t1 = designSimpleRandomBranch(api)
      const firstSelected = t1.seqtimeline[4].name

      // Simulate rebuild (page reload) — randomized routes are persisted in store
      api.store.localState.seqtimeline = []
      api.store.localState.routes = []

      // Use a different seed — should NOT matter because stored route is reused
      seedrandom('completely-different-seed', { global: true })
      const t2 = designSimpleRandomBranch(api)
      const secondSelected = t2.seqtimeline[4].name

      expect(secondSelected).toBe(firstSelected)
    })
  })
})
