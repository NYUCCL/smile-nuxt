/* eslint-disable no-undef */
// general testing functions
import { defineComponent, h } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createTestingPinia } from '@pinia/testing'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHashHistory } from 'vue-router'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import NestedTable from '@/core/composables/NestedTable'

// import shared mocks
import '../../setup/mocks' // Import shared mocks
import { setupBrowserEnvironment } from '../../setup/mocks'

// Mock the config import
vi.mock('@/core/config', () => ({
  default: {
    maxSteps: 5000,
  },
}))

// import the API composable (h stepper is a method of the API)
import useAPI from '@/core/composables/useAPI'
import { StepState } from '@/core/composables/StepState'
import config from '@/core/config' // Add this import after the Mock
import useSmileStore from '@/core/stores/smilestore'

// Create a test component that uses the composable
const TestComponent = defineComponent({
  template: `
    <div>
      <router-view></router-view>
    </div>
  `,
})

// Create a mock component for routes
const MockComponent = (text = 'Mock Component') =>
  defineComponent({
    name: 'MockComponent',
    setup() {
      const api = useAPI()
      const stepper = api.useHStepper()
      return { api, stepper }
    },
    template: `<div>${text}</div>`,
  })

// Define test routes
const routes = [
  {
    path: '/',
    name: 'welcome_anonymous',
    component: MockComponent('Welcome Anonymous'),
    meta: { next: 'landing', allowAlways: true },
  },
  {
    path: '/landing',
    name: 'landing',
    component: MockComponent('Landing'),
    meta: { prev: 'welcome_anonymous', next: 'test', sequential: true },
  },
  {
    path: '/test',
    name: 'test',
    component: MockComponent('Test'),
    meta: { prev: 'landing', sequential: true },
  },
]

describe.skip('useHStepper composable', () => {
  let api
  let router
  let wrapper

  // Helper function to get the API instance for the current route
  const getCurrentRouteAPI = () => {
    const currentRoute = router.currentRoute.value
    const mockComponent = wrapper.findComponent(currentRoute.matched[0].components.default)
    expect(mockComponent.exists()).toBe(true)
    return mockComponent.vm.api
  }

  // Helper function to get the stepper instance for the current route
  const getCurrentRouteStepper = () => {
    const currentRoute = router.currentRoute.value
    const mockComponent = wrapper.findComponent(currentRoute.matched[0].components.default)
    expect(mockComponent.exists()).toBe(true)
    return mockComponent.vm.stepper
  }

  beforeAll(() => {
    setupBrowserEnvironment()
  })

  beforeEach(async () => {
    // Reset mock state
    vi.clearAllMocks()

    // Create a fresh router for each test
    router = createRouter({
      history: createWebHashHistory(),
      routes,
    })

    // Create pinia instance
    const pinia = createTestingPinia({
      stubActions: false,
      createSpy: vi.fn,
    })

    // Mount the test component
    wrapper = mount(TestComponent, {
      global: {
        plugins: [pinia, router],
        stubs: {
          RouterLink: true,
        },
      },
    })

    // Navigate to the first route and wait for it to be ready
    await router.push('/')
    await router.isReady()
    await flushPromises()

    api = getCurrentRouteAPI()
  })

  afterEach(() => {
    wrapper.unmount()
  })

  describe('basic interactive checks', () => {
    it('should make sense to use', () => {
      const stepper = getCurrentRouteStepper()
      expect(stepper).toBeDefined()
      expect(stepper.next).toBeInstanceOf(Function)
      expect(stepper.prev).toBeInstanceOf(Function)
      expect(stepper.reset).toBeInstanceOf(Function)
    })
  })

  describe('basic creation operations', () => {
    it('should provide the useStepper method', async () => {
      expect(api).toBeDefined()
      expect(api.useHStepper).toBeDefined()
      expect(api.useHStepper).toBeInstanceOf(Function)
    })

    it('should create the stepper', async () => {
      const stepper = getCurrentRouteStepper()
      expect(stepper).toBeDefined()
    })

    it('should include the key top-level functions in the stepper', async () => {
      const stepper = getCurrentRouteStepper()
      expect(stepper).toBeDefined()
      expect(stepper.next).toBeInstanceOf(Function)
      expect(stepper.prev).toBeInstanceOf(Function)
      expect(stepper.reset).toBeInstanceOf(Function)
      expect(stepper.index).toBeDefined()
      expect(stepper.datapath).toBeDefined()
      expect(stepper.sm).toBeInstanceOf(StepState)
    })

    it('should create a StepState instance', async () => {
      const stepper = getCurrentRouteStepper()
      expect(stepper.sm).toBeInstanceOf(StepState)
    })

    it('should provide the table() method', async () => {
      const stepper = getCurrentRouteStepper()
      expect(stepper.table).toBeInstanceOf(Function)
    })

    it('should provide the table API after table()', async () => {
      const stepper = getCurrentRouteStepper()
      const t1 = stepper.table()

      expect(t1).toBeDefined()
      expect(t1.rows).toBeDefined()
      expect(Array.isArray(t1.rows)).toBe(true)
      expect(t1.append).toBeInstanceOf(Function)
      expect(t1.shuffle).toBeInstanceOf(Function)
      expect(t1.sample).toBeInstanceOf(Function)
      expect(t1.repeat).toBeInstanceOf(Function)
      expect(t1.push).toBeInstanceOf(Function)
      expect(t1.forEach).toBeInstanceOf(Function)
      expect(t1.zip).toBeInstanceOf(Function)
      expect(t1.range).toBeInstanceOf(Function)
      expect(t1.outer).toBeInstanceOf(Function)
      expect(t1.print).toBeInstanceOf(Function)
      expect(t1.length).toBeDefined()
      expect(t1.indexOf).toBeInstanceOf(Function)
      expect(t1.slice).toBeInstanceOf(Function)
      expect(t1[Symbol.iterator]).toBeInstanceOf(Function)
      expect(t1[Symbol.isConcatSpreadable]).toBeDefined()

      // Test nested table creation
      // and you do that recursively for the next table
    })

    it('should throw errors if chain methods are called before table()', async () => {
      const stepper = getCurrentRouteStepper()

      // Test all chainable methods
      const methods = [
        'append',
        'shuffle',
        'sample',
        'repeat',
        'forEach',
        'zip',
        'outer',
        'range',
        'print',
        'slice',
        'partition',
        'indexOf',
        'interleave',
        'pop',
        'getSubtreeData',
      ] // 'push' is not included because it is forwarded to the stepper's push method

      methods.forEach((method) => {
        expect(() => {
          stepper[method]()
        }).toThrow(`${method}() must be called after table()`)
      })
    })

    it('should throw errors if getters are accessed before table()', async () => {
      const stepper = getCurrentRouteStepper()

      // Test getters that should be protected
      const getters = ['rows', 'rowsdata']
      // path/paths is excluded because there is a equivalent function on the state machien

      getters.forEach((getter) => {
        expect(() => {
          const value = stepper[getter]
        }).toThrow(`${getter}() must be called after table()`)
      })
    })
  })

  describe('basic table operations', () => {
    // since NestedTable.test.js exists most of the core table functions should be
    // tested elsewhere.  Here we just test that the methods are available and that
    // the table is created correctly.

    it('should create a table with the range method', async () => {
      const stepper = getCurrentRouteStepper()
      const table = stepper.spec().range(10)
      expect(table).toBeInstanceOf(NestedTable)
      expect(table.length).toBe(10) // preferred way to access
      expect(table.rows).toBeInstanceOf(Array)
      expect(table.rows).toHaveLength(10)
      for (let i = 0; i < 10; i++) {
        expect(table[i].data).toEqual({ range: i })
      }
    })

    it('should create a nested table', async () => {
      const stepper = getCurrentRouteStepper()
      const table = stepper
        .spec()
        .range(10)
        .forEach((row, i) => {
          // Create range items directly on the row (which is a NestedTable itself)
          row.range(10)
          //return row // Return the row to ensure changes are captured
        })
      //table.print()
      expect(table).toBeInstanceOf(NestedTable)
      expect(table.length).toBe(10) // preferred way to access
      expect(table.rows).toBeInstanceOf(Array)
      expect(table.rows).toHaveLength(10)
      expect(table.length).toBe(10)

      for (let i = 0; i < 10; i++) {
        expect(table[i].data).toEqual({ range: i })
        expect(table[i]._items.length).toBe(10) // Check items directly on the row
        for (let j = 0; j < 10; j++) {
          expect(table[i][j].data).toEqual({ range: j })
        }
      }
    })

    // the first few tests here should verify that the structure from variables table calls
    // are reflected in the state machine.
    // they then should verify that navigation works as expected
    describe('table push() method', () => {
      it('should push a row to the statemachine', async () => {
        const stepper = getCurrentRouteStepper()
        const table = stepper.table().append({ hi: 'there' }).push()
        expect(table.length).toBe(1)
        expect(table[0].data).toEqual({ hi: 'there' })
      })

      it('should push a table to the state machine and handle stepping correctly', async () => {
        const stepper = getCurrentRouteStepper()
        const table = stepper.table().range(10)

        // Store original table values for comparison
        const tableValues = table.rows.map((row, i) => [{ range: i }])

        // Push table to state machine
        table.push()
        stepper.reset()

        // Verify initial state - should be at first item
        expect(stepper.datapath).toEqual(tableValues[0])
        expect(stepper.index).toEqual(1)
        expect(stepper.sm.index).toBe(1) /// skips SOS to start

        // // Step through remaining trials and verify values match
        for (let i = 1; i < 10; i++) {
          const nextValue = stepper.goNextStep()
          expect(nextValue.id).toBe(i)
          expect(stepper.datapath).toEqual(tableValues[i])
          expect(stepper.index).toEqual(i + 1) // stepper index start from 0 at the SOS
          expect(stepper.sm.index).toBe(i + 1)
        }

        // Verify we're at the end
        expect(stepper.goNextStep().id).toBe('EOS')

        // Step backwards and verify values
        for (let i = 9; i >= 0; i--) {
          const prevValue = stepper.goPrevStep()
          expect(prevValue.id).toBe(i)
          expect(stepper.datapath).toEqual(tableValues[i])
          expect(stepper.index).toEqual(i + 1)
        }

        // Test reset - should go back to first item
        stepper.reset()
        expect(stepper.datapath).toEqual(tableValues[0])
        expect(stepper.index).toEqual(1)
        expect(stepper.sm.index).toBe(1)

        // Verify we can step forward again after reset
        const nextValue = stepper.goNextStep()
        expect(nextValue.id).toBe(1)
        expect(stepper.datapath).toEqual(tableValues[1])
        expect(stepper.index).toEqual(2)
        expect(stepper.sm.index).toBe(2)
      })

      it('should require push() to be the final operation in the chain', async () => {
        const stepper = getCurrentRouteStepper()
        const table = stepper.table().range(10)

        // Store original table values for comparison
        const tableValues = table.rows.map((row, i) => [{ range: i }])

        // Push table to state machine
        table.push()

        // Verify initial state - should be at first item
        expect(stepper.datapath).toEqual(tableValues[0])
        expect(stepper.index).toEqual(1)

        // Step through remaining trials and verify values match
        for (let i = 1; i < 10; i++) {
          const nextValue = stepper.goNextStep()
          expect(nextValue.id).toBe(i)
          expect(stepper.datapath).toEqual(tableValues[i])
          expect(stepper.index).toEqual(i + 1)
        }

        // Verify we're at the end
        expect(stepper.goNextStep().id).toBe('EOS')

        // Step backwards and verify values
        for (let i = 9; i >= 0; i--) {
          const prevValue = stepper.goPrevStep()
          expect(prevValue.id).toBe(i)
          expect(stepper.datapath).toEqual(tableValues[i])
          expect(stepper.index).toEqual(i + 1)
        }

        // Test reset - should go back to first item
        stepper.reset()
        expect(stepper.datapath).toEqual(tableValues[0])
        expect(stepper.index).toEqual(1)

        // Verify we can step forward again after reset
        const nextValue = stepper.goNextStep()
        expect(nextValue.id).toBe(1)
        expect(stepper.datapath).toEqual(tableValues[1])
        expect(stepper.index).toEqual(2)
      })

      it('should handle basic navigation as shown in documentation', async () => {
        const stepper = getCurrentRouteStepper()

        // Create and push some trials
        stepper
          .table()
          .append([
            { shape: 'circle', color: 'red' },
            { shape: 'square', color: 'blue' },
          ])
          .push()

        // After push(), we're at the first trial
        expect(stepper.datapath).toEqual([{ shape: 'circle', color: 'red' }])
        expect(stepper.index).toBe(1)

        // Move to next trial
        stepper.goNextStep()
        expect(stepper.datapath).toEqual([{ shape: 'square', color: 'blue' }])
        expect(stepper.index).toBe(2)

        // Go back
        stepper.goPrevStep()
        expect(stepper.datapath).toEqual([{ shape: 'circle', color: 'red' }])
        expect(stepper.index).toBe(1)

        // Reset always goes to the first trial
        stepper.reset()
        expect(stepper.datapath).toEqual([{ shape: 'circle', color: 'red' }])
        expect(stepper.index).toBe(1)
      })

      it('should handle nested tables', async () => {
        const stepper = getCurrentRouteStepper()

        // Create a nested table using map
        const trials = stepper
          .table()
          .range(2) // Create 2 parent trials
          .forEach((row, i) => {
            row.data = { ...row.data, phase: 'parent', id: i } // Add fields to parent
            row.append([
              { type: 'stim', index: 0 },
              { type: 'feedback', index: 1 },
              { type: 'rest', index: 2 },
            ]) // Each parent has 3 nested trials
          })
        trials.push()

        // Verify initial state - should be at first child item
        expect(stepper.index).toBe(1)
        expect(stepper.datapath).toEqual([
          { range: 0, phase: 'parent', id: 0 },
          { type: 'stim', index: 0 },
        ])

        // Move to second nested trial of first parent
        stepper.goNextStep()
        expect(stepper.datapath).toEqual([
          { range: 0, phase: 'parent', id: 0 },
          { type: 'feedback', index: 1 },
        ])
        expect(stepper.index).toBe(2)

        // Move to third nested trial of first parent
        stepper.goNextStep()
        expect(stepper.datapath).toEqual([
          { range: 0, phase: 'parent', id: 0 },
          { type: 'rest', index: 2 },
        ])
        expect(stepper.index).toBe(3)

        // Move to first nested trial of second parent
        stepper.goNextStep()
        expect(stepper.datapath).toEqual([
          { range: 1, phase: 'parent', id: 1 },
          { type: 'stim', index: 0 },
        ])
        expect(stepper.index).toBe(4)

        // Move to second nested trial of second parent
        stepper.goNextStep()
        expect(stepper.datapath).toEqual([
          { range: 1, phase: 'parent', id: 1 },
          { type: 'feedback', index: 1 },
        ])
        expect(stepper.index).toBe(5)

        // Move to third nested trial of second parent
        stepper.goNextStep()
        expect(stepper.datapath).toEqual([
          { range: 1, phase: 'parent', id: 1 },
          { type: 'rest', index: 2 },
        ])
        expect(stepper.index).toBe(6)

        // Verify we're at the end
        expect(stepper.goNextStep().id).toBe('EOS')

        // Test going backwards
        stepper.goPrevStep()
        expect(stepper.datapath).toEqual([
          { range: 1, phase: 'parent', id: 1 },
          { type: 'rest', index: 2 },
        ])
        expect(stepper.index).toBe(6)

        // Reset should go back to first parent's first trial
        stepper.reset()
        expect(stepper.datapath).toEqual([
          { range: 0, phase: 'parent', id: 0 },
          { type: 'stim', index: 0 },
        ])
        expect(stepper.index).toBe(1)
      })

      it('should handle nodes with empty data objects', async () => {
        const stepper = getCurrentRouteStepper()

        // Create a table with empty objects and undefined/null data
        const trials = stepper
          .table()
          .append([
            {}, // Empty object
            { data: null }, // Object with null
            { data: undefined }, // Object with undefined
            { data: {} }, // Object with empty nested object
          ])
          .push()

        // Verify initial state
        expect(stepper.datapath).toEqual([{}])
        expect(stepper.index).toBe(1)

        // Navigate through all states
        stepper.goNextStep()
        expect(stepper.datapath).toEqual([{ data: null }])
        expect(stepper.index).toBe(2)

        stepper.goNextStep()
        expect(stepper.datapath).toEqual([{ data: undefined }])
        expect(stepper.index).toBe(3)

        stepper.goNextStep()
        expect(stepper.datapath).toEqual([{ data: {} }])
        expect(stepper.index).toBe(4)
      })

      it('should handle nodes with missing data in the path', async () => {
        const stepper = getCurrentRouteStepper()

        // Create a nested structure where some nodes have no data
        const trials = stepper
          .table()
          .range(2) // Creates parent nodes with only range data
          .forEach((row, i) => {
            // First parent gets no additional data, second gets data
            if (i === 1) {
              row.data = { ...row.data, phase: 'parent' }
            }

            // Create nested trials with some missing data
            row.append([
              { type: 'stim' }, // Has data
              {}, // No data
              { type: 'feedback' }, // Has data
            ])
          })
          .push()

        // Check first parent (only range data) with first child
        expect(stepper.datapath).toEqual([{ range: 0 }, { type: 'stim' }])
        expect(stepper.index).toBe(1)

        // Move to empty data child
        stepper.goNextStep()
        expect(stepper.datapath).toEqual([{ range: 0 }, {}])
        expect(stepper.index).toBe(2)

        // Move to second parent (has additional data) with first child
        stepper.goNextStep()
        stepper.goNextStep()
        expect(stepper.datapath).toEqual([{ range: 1, phase: 'parent' }, { type: 'stim' }])
        expect(stepper.index).toBe(4)
      })

      it('should support sequential row addition through multiple pushes', async () => {
        const stepper = getCurrentRouteStepper()

        // First push: Add practice trials
        stepper
          .table()
          .append([
            { type: 'practice', id: 1 },
            { type: 'practice', id: 2 },
          ])
          .push()

        // Verify initial state
        expect(stepper.datapath).toEqual([{ type: 'practice', id: 1 }])
        expect(stepper.index).toBe(1)

        // Second push: Add main trials
        stepper
          .table()
          .append([
            { type: 'main', id: 3 },
            { type: 'main', id: 4 },
          ])
          .push()

        stepper.reset()
        // Verify we can navigate through all trials in sequence
        expect(stepper.index).toBe(1)
        expect(stepper.datapath).toEqual([{ type: 'practice', id: 1 }])

        stepper.goNextStep()
        expect(stepper.datapath).toEqual([{ type: 'practice', id: 2 }])
        expect(stepper.index).toBe(2)

        stepper.goNextStep()
        expect(stepper.datapath).toEqual([{ type: 'main', id: 3 }])
        expect(stepper.index).toBe(3)

        stepper.goNextStep()
        expect(stepper.datapath).toEqual([{ type: 'main', id: 4 }])
        expect(stepper.index).toBe(4)

        // Verify we're at the end
        expect(stepper.goNextStep().id).toBe('EOS')

        // Test going backwards
        stepper.goPrevStep()
        expect(stepper.datapath).toEqual([{ type: 'main', id: 4 }])
        expect(stepper.index).toBe(4)

        stepper.goPrevStep()
        expect(stepper.datapath).toEqual([{ type: 'main', id: 3 }])
        expect(stepper.index).toBe(3)

        stepper.goPrevStep()
        expect(stepper.datapath).toEqual([{ type: 'practice', id: 2 }])
        expect(stepper.index).toBe(2)

        stepper.goPrevStep()
        expect(stepper.datapath).toEqual([{ type: 'practice', id: 1 }])
        expect(stepper.index).toBe(1)

        // Verify we're at the beginning
        expect(stepper.goPrevStep().id).toBe('SOS')

        // Test reset
        stepper.reset()
        expect(stepper.datapath).toEqual([{ type: 'practice', id: 1 }])
        expect(stepper.index).toBe(1)
      })

      it('should handle deep nesting (3+ levels)', async () => {
        const stepper = getCurrentRouteStepper()

        // Create a deeply nested structure
        const trials = stepper
          .table()
          .range(2)
          .forEach((block, blockId) => {
            block.data = { ...block.data, type: 'block', id: blockId }

            // Level 2: Create trials within blocks
            block.range(2).forEach((trial, trialId) => {
              trial.data = { ...trial.data, type: 'trial', id: trialId }

              // Level 3: Create phases within trials
              trial.append([
                { type: 'stimulus', phase: 1 },
                { type: 'response', phase: 2 },
              ])
            })
          })
          .push()

        // Verify initial state (first block, first trial, first phase)
        expect(stepper.datapath).toEqual([
          { range: 0, type: 'block', id: 0 },
          { range: 0, type: 'trial', id: 0 },
          { type: 'stimulus', phase: 1 },
        ])
        expect(stepper.index).toBe(1)

        // Navigate through the structure
        stepper.goNextStep()
        expect(stepper.datapath).toEqual([
          { range: 0, type: 'block', id: 0 },
          { range: 0, type: 'trial', id: 0 },
          { type: 'response', phase: 2 },
        ])
        expect(stepper.index).toBe(2)

        // Move to next trial's first phase
        stepper.goNextStep()
        expect(stepper.datapath).toEqual([
          { range: 0, type: 'block', id: 0 },
          { range: 1, type: 'trial', id: 1 },
          { type: 'stimulus', phase: 1 },
        ])
        expect(stepper.index).toBe(3)

        // Move to next block
        stepper.goNextStep()
        stepper.goNextStep()
        expect(stepper.datapath).toEqual([
          { range: 1, type: 'block', id: 1 },
          { range: 0, type: 'trial', id: 0 },
          { type: 'stimulus', phase: 1 },
        ])
        expect(stepper.index).toBe(5)
      })

      it('should handle error cases and invalid paths', async () => {
        const stepper = getCurrentRouteStepper()

        // Create a simple nested structure
        const trials = stepper
          .table()
          .range(2)
          .forEach((row, i) => {
            row.data = { ...row.data, phase: 'parent', id: i }
            row.append([{ type: 'stim' }, { type: 'feedback' }])
          })
          .push()

        // Test accessing invalid indices
        expect(stepper.sm[999]).toBeUndefined()
        expect(stepper.sm['nonexistent']).toBeUndefined()

        // Test navigating beyond bounds
        stepper.reset()
        for (let i = 0; i < 10; i++) {
          stepper.goNextStep() // Should eventually reach end without error
        }
        /// this is past the EOS
        expect(stepper.goNextStep()).toBeNull() // Should handle going past end gracefully

        // Test navigating backwards beyond start
        stepper.reset()
        expect(stepper.goPrevStep().id).toBe('SOS') // Should handle going before start gracefully

        // Test resetting at various positions
        stepper.goNextStep()
        stepper.goNextStep()
        stepper.reset()
        expect(stepper.datapath).toEqual([{ range: 0, phase: 'parent', id: 0 }, { type: 'stim' }])
        expect(stepper.index).toBe(1)
      })
    })

    describe('complex tests', () => {
      it('should handle nesting after shuffling', async () => {
        const stepper = getCurrentRouteStepper()
        const trials = stepper.table().range(10).shuffle()
        const nestedTable = trials[0].range(3)
        expect(nestedTable.rows).toHaveLength(3)
        for (let i = 0; i < 3; i++) {
          expect(nestedTable.rows[i].data).toEqual({ range: i })
        }
      })

      it('should handle nesting after sampling', async () => {
        const stepper = getCurrentRouteStepper()
        const trials = stepper.table().range(10)
        trials.sample({
          type: 'with-replacement',
          size: 3,
        })
        const nestedTable = trials[0].range(3)
        expect(nestedTable.rows).toHaveLength(3)
        for (let i = 0; i < 3; i++) {
          expect(nestedTable.rows[i].data).toEqual({ range: i })
        }
      })

      it('should handle shuffling at the top level after a nested table created', async () => {
        const stepper = getCurrentRouteStepper()
        const trials = stepper.table().range(10)
        const nestedTable = trials[3].range(3)
        trials.shuffle()
        expect(nestedTable.rows).toHaveLength(3)
        for (let i = 0; i < 3; i++) {
          expect(nestedTable.rows[i].data).toEqual({ range: i })
        }
      })

      it.skip('should raise an error when modifying dimensionality of a table with nested tables', async () => {
        const stepper = getCurrentRouteStepper()
        const trials = stepper.table().range(10)
        const nestedTable = trials[3].range(3)

        // Test sample()
        expect(() => {
          trials.sample({
            type: 'with-replacement',
            size: 1,
          })
        }).toThrow('Cannot sample a table that has nested tables')

        // Test slice()
        expect(() => {
          trials.slice(0, 5)
        }).toThrow('Cannot slice a table that has nested tables')

        // Verify the nested table is still intact
        expect(nestedTable.rows).toHaveLength(3)
        for (let i = 0; i < 3; i++) {
          expect(nestedTable.rows[i]).toEqual({ range: i })
        }
      })

      it('should copy the nested table when repeating', async () => {
        const stepper = getCurrentRouteStepper()
        const trials = stepper.table().range(10)
        const nestedTable = trials[3].range(3)
        trials.repeat(2)

        // Verify that the original nested table is still in place
        expect(trials[3]).toBe(nestedTable)

        // Verify that the repeated row has a different nested table instance
        expect(trials[13]).not.toBe(nestedTable)

        // Verify that the repeated nested table has the same data
        expect(trials[13].rows).toHaveLength(3)
        for (let i = 0; i < 3; i++) {
          expect(trials[13].rows[i].data).toEqual({ range: i })
        }

        // Verify that modifying the repeated nested table doesn't affect the original
        trials[13].rows[0].value = 'modified'
        expect(trials[3].rows[0].value).toBeUndefined()
      })

      it('should allow creating nested tables with repeat and forEach', async () => {
        const stepper = getCurrentRouteStepper()
        const trials = stepper.table().range(10) // allocate 10 units
        expect(trials[0].length).toBe(0)
        trials.forEach((row, i) => {
          row.data = { ...row.data, trial: i }
          row.append([
            { type: 'stim', index: i },
            { type: 'feedback', index: i },
          ])
        })
        trials.shuffle('1234')
        //trials.print()

        expect(trials[0].length).toBe(2)

        // verify that shuffle worked
        expect(trials[0].trial).not.toBe(0) // low probability of being in sequential order esp with this seed

        // After shuffling, the trial property should still exist but will be in a different order
        const trialValues = trials.rowsdata.map((row) => row.trial).sort()
        expect(trialValues).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])

        // Each row should still have its nested table with the correct index
        trials.forEach((row) => {
          expect(row).toBeDefined()
          expect(row.rows).toHaveLength(2)
          expect(row.rows[0].data.index).toBe(row.trial)
          expect(row.rows[1].data.index).toBe(row.trial)
        })
      })

      it('should enforce read-only status after pushing', async () => {
        const stepper = getCurrentRouteStepper()

        // Build a nested trial structure
        const trials = stepper.table()
        trials.append({ phase: 'training' }).push() // this sets trials to read-only

        // This should throw an error because the table is now read-only
        expect(() => {
          trials[0].append([{ type: 'instruction' }])
        }).toThrow('Table is read-only')

        // We should instead create a new table for additional items
        const nestedTrials = stepper
          .table()
          .append([{ type: 'instruction' }, { type: 'practice', id: 1 }, { type: 'practice', id: 2 }])
          .push()

        // Navigation should work as expected
        expect(stepper.datapath).toEqual([{ phase: 'training' }])

        stepper.goNextStep()
        expect(stepper.datapath).toEqual([{ type: 'instruction' }])

        stepper.goNextStep()
        expect(stepper.datapath).toEqual([{ type: 'practice', id: 1 }])

        stepper.goNextStep()
        expect(stepper.datapath).toEqual([{ type: 'practice', id: 2 }])
      })
    })
  })

  describe('stepstate and nestestedtable integration', () => {
    let smilestore

    beforeEach(async () => {
      // Reset mock state
      vi.clearAllMocks()

      // Create a fresh router for each test
      router = createRouter({
        history: createWebHashHistory(),
        routes,
      })

      // Create pinia instance and set it as active
      const pinia = createTestingPinia({
        stubActions: false,
        createSpy: vi.fn,
      })
      setActivePinia(pinia)

      // Mount the test component
      wrapper = mount(TestComponent, {
        global: {
          plugins: [pinia, router],
          stubs: {
            RouterLink: true,
          },
        },
      })

      // Navigate to the first route and wait for it to be ready
      await router.push('/')
      await router.isReady()
      await flushPromises()

      // Get API and smilestore instances
      api = getCurrentRouteAPI()
      smilestore = useSmileStore()

      // Ensure page tracker is registered for the current route
      const currentRoute = router.currentRoute.value
      smilestore.registerStepper(currentRoute.name)
    })

    it('should correctly build and push trials to state machine', async () => {
      const stepper = getCurrentRouteStepper()

      // Build a simple trial structure
      const trials = stepper
        .table()
        .append({ type: 'instruction' })
        .append({ type: 'trial', id: 1 })
        .append({ type: 'trial', id: 2 })
        .push()

      // Verify initial state
      expect(stepper.sm).toBeDefined()
      expect(stepper.index).toBe(1)

      // Verify state machine contains correct trials
      expect(stepper.datapath).toEqual([{ type: 'instruction' }])

      stepper.goNextStep()
      expect(stepper.datapath).toEqual([{ type: 'trial', id: 1 }])

      stepper.goNextStep()
      expect(stepper.datapath).toEqual([{ type: 'trial', id: 2 }])

      // Verify we've reached the end
      stepper.goNextStep()
      expect(stepper.datapath).toStrictEqual([])
    })

    it('should handle nested trial structures', async () => {
      const stepper = getCurrentRouteStepper()

      // Build a nested trial structure
      const trials = stepper.table()
      trials.append({ phase: 'training' }).push() // this item was pushed

      // Add nested trials to the training phase
      // this should fail because trials became read-only

      const moretrials = stepper
        .table()
        .append([{ type: 'instruction' }, { type: 'practice', id: 1 }, { type: 'practice', id: 2 }])

      stepper.addSpec(moretrials)

      // Verify navigation through nested structure
      expect(stepper.datapath).toEqual([{ phase: 'training' }])

      // Push nested trials
      //stepper.addSpec(nestedTrials)

      // Verify nested trials
      stepper.goNextStep()
      expect(stepper.datapath).toEqual([{ type: 'instruction' }])

      stepper.goNextStep()
      expect(stepper.datapath).toEqual([{ type: 'practice', id: 1 }])

      stepper.goNextStep()
      expect(stepper.datapath).toEqual([{ type: 'practice', id: 2 }])
    })

    it.skip('should persist state in smilestore', async () => {
      const stepper = getCurrentRouteStepper()

      // Build and push trials
      const trials = stepper.table().append({ type: 'trial', id: 1 }).append({ type: 'trial', id: 2 })

      stepper.addSpec(trials)

      // Navigate forward
      const firstTrial = stepper.goNextStep()
      expect(firstTrial).toEqual({ type: 'trial', id: 1 })

      // Get current route and verify state is saved
      const currentRoute = router.currentRoute.value
      const pageData = smilestore.getStepper(currentRoute.name)
      expect(pageData).toBeDefined()
      expect(pageData.stepperState).toBeDefined()

      // Create a new stepper instance (simulating page reload)
      const newStepper = getCurrentRouteStepper()

      // Verify state is restored
      const currentTrial = newStepper.next()
      expect(currentTrial).toEqual({ type: 'trial', id: 2 })
    })

    it('should handle reset correctly', async () => {
      const stepper = getCurrentRouteStepper()

      // Build and push trials
      const trials = stepper.table().append({ type: 'trial', id: 1 }).append({ type: 'trial', id: 2 })

      stepper.addSpec(trials)

      // Navigate forward
      stepper.goNextStep()
      stepper.goNextStep()

      // Reset state
      stepper.reset()

      // Verify state machine is reset
      expect(stepper.index).toBe(1)

      // Verify state is cleared from smilestore
      const currentRoute = router.currentRoute.value
      const pageData = smilestore.getStepper(currentRoute.name)
      expect(pageData).toBeDefined()
      //expect(pageData.stepperState).toBeNull()

      // Verify we can navigate from beginning again
      expect(stepper.datapath).toEqual([{ type: 'trial', id: 1 }])
      stepper.goNextStep()
      expect(stepper.datapath).toEqual([{ type: 'trial', id: 2 }])
    })

    // Add test for array input
    it.skip('should accept plain arrays as input', async () => {
      const stepper = getCurrentRouteStepper()

      // Create a plain array of trials
      const trials = [
        { type: 'trial', id: 1 },
        { type: 'trial', id: 2 },
      ]

      // Push trials to state machine
      stepper.addSpec(trials)

      // Verify navigation works
      let currentTrial = stepper.goNextStep()
      expect(currentTrial).toEqual({ type: 'trial', id: 1 })

      currentTrial = stepper.goNextStep()
      expect(currentTrial).toEqual({ type: 'trial', id: 2 })
    })
  })

  describe('navigation methods', () => {
    // tbd
    it('should navigate to the next trial', async () => {
      const stepper = getCurrentRouteStepper()
      stepper.table().append({ type: 'trial', id: 1 }).append({ type: 'trial', id: 2 }).push()
      expect(stepper.datapath).toEqual([{ type: 'trial', id: 1 }])
      stepper.goNextStep()
      expect(stepper.datapath).toEqual([{ type: 'trial', id: 2 }])
      stepper.goNextStep() // do we want to step to null?
      expect(stepper.datapath).toStrictEqual([])
    })
  })

  describe('transaction history', () => {
    it('should generate deterministic transaction IDs', async () => {
      const stepper = getCurrentRouteStepper()

      // First push
      const table1 = stepper.table().append({ type: 'trial', id: 1 })
      const firstHash = table1.tableID
      stepper.addSpec(table1)

      // Second push
      const table2 = stepper.table().append({ type: 'trial', id: 2 })
      const secondHash = table2.tableID
      stepper.addSpec(table2)

      // Verify transaction history format - using base36 format (8 chars)
      expect(stepper.transactionHistory).toHaveLength(2)
      expect(stepper.transactionHistory[0]).toMatch(new RegExp(`${firstHash}-[a-z0-9]{8}`))
      expect(stepper.transactionHistory[1]).toMatch(new RegExp(`${secondHash}-[a-z0-9]{8}`))

      // Verify IDs are different
      const [, firstId] = stepper.transactionHistory[0].split('-')
      const [, secondId] = stepper.transactionHistory[1].split('-')
      expect(firstId).not.toBe(secondId)
    })

    it('should prevent duplicate pushes of same table/transaction', async () => {
      const stepper = getCurrentRouteStepper()

      // Create and push a table
      const table1 = stepper.spec().append({ type: 'trial', id: 1 })
      stepper.addSpec(table1)
      const initialLength = stepper.nrows

      // Try to push identical data in a new table (since original is read-only)
      const table2 = stepper.spec().append({ type: 'trial', id: 1 })
      stepper.addSpec(table2)

      // Verify no new rows were added
      expect(stepper.nrows).toBe(initialLength)
      expect(stepper.transactionHistory).toHaveLength(1)
    })

    it('should handle complex nested table structures in transaction history', async () => {
      const stepper = getCurrentRouteStepper()

      // Create a complex nested table
      const table1 = stepper.table().range(2)
      table1.forEach((row) => {
        row.append([
          { type: 'stim', phase: 1 },
          { type: 'feedback', phase: 2 },
        ])
      })

      // Push and store hash
      const hash1 = table1.tableID
      stepper.addSpec(table1)

      // Create identical structure in a new table
      const table2 = stepper.table().range(2)
      table2.forEach((row) => {
        row.append([
          { type: 'stim', phase: 1 },
          { type: 'feedback', phase: 2 },
        ])
      })

      // Verify identical structure generates same hash
      expect(table2.tableID).toBe(hash1)

      // Push should be skipped due to duplicate hash
      stepper.addSpec(table2)
      expect(stepper.transactionHistory).toHaveLength(1)
      expect(stepper.nrows).toBe(6) // 2 parent rows * (2 child rows + 1 parent data) = 6
    })

    it('should generate consistent table hashes for identical data', async () => {
      const stepper = getCurrentRouteStepper()

      // Create two identical tables
      const table1 = stepper.table().append({ type: 'trial', id: 1 })
      const table2 = stepper.table().append({ type: 'trial', id: 1 })

      // Verify they generate the same hash
      expect(table1.tableID).toBe(table2.tableID)
    })

    it('should allow pushing different data even with same structure', async () => {
      const stepper = getCurrentRouteStepper()

      // Push first table
      const table1 = stepper.table().append({ type: 'trial', id: 1 })
      stepper.addSpec(table1)
      const initialLength = stepper.nrows

      // Push second table with different data
      const table2 = stepper.table().append({ type: 'trial', id: 2 })
      stepper.addSpec(table2)

      // Verify new rows were added
      expect(stepper.nrows).toBe(initialLength + 1)
      expect(stepper.transactionHistory).toHaveLength(2)
    })

    it('should maintain transaction history across resets', async () => {
      const stepper = getCurrentRouteStepper()

      // Push some tables
      const table1 = stepper.table().append({ type: 'trial', id: 1 })
      stepper.addSpec(table1)

      const table2 = stepper.table().append({ type: 'trial', id: 2 })
      stepper.addSpec(table2)

      // Store transaction history
      const history = [...stepper.transactionHistory]

      // Reset stepper
      stepper.reset()

      // Verify history is maintained
      expect(stepper.transactionHistory).toEqual(history)
      expect(stepper.transactionHistory).toHaveLength(2)
    })

    it('should clear transaction history with clear', async () => {
      const stepper = getCurrentRouteStepper()

      // Push some tables
      const table1 = stepper.table().append({ type: 'trial', id: 1 })
      stepper.addSpec(table1)

      const table2 = stepper.table().append({ type: 'trial', id: 2 })
      stepper.addSpec(table2)

      // Verify history exists
      expect(stepper.transactionHistory).toHaveLength(2)

      // Clear state
      stepper.clear()

      // Verify history is cleared
      expect(stepper.transactionHistory).toHaveLength(0)
    })
  })

  describe('Vue component serialization and rehydration', () => {
    // Define test components
    const TestComponent = defineComponent({
      name: 'TestComponent',
      props: {
        message: {
          type: String,
          required: true,
        },
      },
      template: '<div>{{ message }}</div>',
    })

    const NestedComponent = defineComponent({
      name: 'NestedComponent',
      props: {
        items: {
          type: Array,
          required: true,
        },
      },
      template: '<div><div v-for="item in items">{{ item }}</div></div>',
    })

    beforeEach(async () => {
      // Reset mock state
      vi.clearAllMocks()

      // Create a fresh router for each test
      router = createRouter({
        history: createWebHashHistory(),
        routes,
      })

      // Create pinia instance
      const pinia = createTestingPinia({
        stubActions: false,
        createSpy: vi.fn,
      })

      // Create a test component that uses the composable
      const TestWrapper = defineComponent({
        template: `
          <div>
            <router-view></router-view>
          </div>
        `,
      })

      // Create a mock component for routes that uses the composable
      const MockComponent = defineComponent({
        name: 'MockComponent',
        setup() {
          const api = useAPI()
          const stepper = api.useHStepper()
          return { api, stepper }
        },
        template: `<div>Mock Component</div>`,
      })

      // Mount the test wrapper component
      wrapper = mount(TestWrapper, {
        global: {
          plugins: [pinia, router],
          stubs: {
            RouterLink: true,
          },
        },
      })

      // Navigate to the first route and wait for it to be ready
      await router.push('/')
      await router.isReady()
      await flushPromises()

      api = getCurrentRouteAPI()
    })

    it('should serialize and rehydrate a simple component', async () => {
      const stepper = getCurrentRouteStepper()

      // Create a table with a component
      const table = stepper
        .table()
        .append({
          type: TestComponent,
          props: { message: 'Hello World' },
        })
        .push()

      // Verify initial state
      expect(stepper.datapath[0].type).toEqual(TestComponent)
      expect(stepper.datapath[0].props.message).toBe('Hello World')

      // Simulate state serialization by creating a new stepper
      const newStepper = getCurrentRouteStepper()

      // Verify component was rehydrated
      expect(newStepper.datapath[0].type).toEqual(TestComponent)
      expect(newStepper.datapath[0].props.message).toBe('Hello World')
    })

    it('should handle components in nested structures', async () => {
      const stepper = getCurrentRouteStepper()

      // Create a nested table with components at different levels
      const table = stepper
        .table()
        .append({
          type: TestComponent,
          props: { message: 'Parent' },
        })
        .forEach((row) => {
          row.append({
            type: NestedComponent,
            props: { items: ['Child 1', 'Child 2'] },
          })
        })
        .push()

      // Verify initial state
      expect(stepper.datapath[0].type).toEqual(TestComponent)
      expect(stepper.datapath[0].props.message).toBe('Parent')
      expect(stepper.datapath[1].type).toEqual(NestedComponent)
      expect(stepper.datapath[1].props.items).toEqual(['Child 1', 'Child 2'])

      // Simulate state serialization by creating a new stepper
      const newStepper = getCurrentRouteStepper()

      // Verify nested structure was rehydrated
      expect(newStepper.datapath[0].type).toEqual(TestComponent)
      expect(newStepper.datapath[0].props.message).toBe('Parent')
      expect(newStepper.datapath[1].type).toEqual(NestedComponent)
      expect(newStepper.datapath[1].props.items).toEqual(['Child 1', 'Child 2'])
    })

    it('should handle multiple components in the same structure', async () => {
      const stepper = getCurrentRouteStepper()

      // Create a table with multiple components
      const table = stepper
        .table()
        .append({
          type: TestComponent,
          props: { message: 'First' },
        })
        .push()

      // Push additional components separately since they need to be in sequence
      const table2 = stepper
        .table()
        .append({
          type: TestComponent,
          props: { message: 'Second' },
        })
        .append({
          type: NestedComponent,
          props: { items: ['Item 1', 'Item 2'] },
        })
        .push()

      // Verify initial state
      expect(stepper.datapath[0].type).toEqual(TestComponent)
      expect(stepper.datapath[0].props.message).toBe('First')

      // Navigate to next component
      stepper.goNextStep()
      expect(stepper.datapath[0].type).toEqual(TestComponent)
      expect(stepper.datapath[0].props.message).toBe('Second')

      // Navigate to final component
      stepper.goNextStep()
      expect(stepper.datapath[0].type).toEqual(NestedComponent)
      expect(stepper.datapath[0].props.items).toEqual(['Item 1', 'Item 2'])
    })

    it('should handle components with complex props', async () => {
      const stepper = getCurrentRouteStepper()

      // Create a component with complex props
      const ComplexComponent = defineComponent({
        name: 'ComplexComponent',
        props: {
          data: {
            type: Object,
            required: true,
          },
          items: {
            type: Array,
            required: true,
          },
        },
        template: '<div>{{ data.name }} <div v-for="item in items">{{ item }}</div></div>',
      })

      // Create a table with a component having complex props
      const table = stepper
        .table()
        .append({
          type: ComplexComponent,
          props: {
            data: { name: 'Complex', value: 42 },
            items: [
              { id: 1, text: 'One' },
              { id: 2, text: 'Two' },
            ],
          },
        })
        .push()

      // Verify initial state
      expect(stepper.datapath[0].type).toEqual(ComplexComponent)
      expect(stepper.datapath[0].props.data).toEqual({ name: 'Complex', value: 42 })
      expect(stepper.datapath[0].props.items).toEqual([
        { id: 1, text: 'One' },
        { id: 2, text: 'Two' },
      ])

      // Simulate state serialization by creating a new stepper
      const newStepper = getCurrentRouteStepper()

      // Verify complex props were rehydrated
      expect(newStepper.datapath[0].type).toEqual(ComplexComponent)
      expect(newStepper.datapath[0].props.data).toEqual({ name: 'Complex', value: 42 })
      expect(newStepper.datapath[0].props.items).toEqual([
        { id: 1, text: 'One' },
        { id: 2, text: 'Two' },
      ])
    })

    it('should handle missing components gracefully', async () => {
      const stepper = getCurrentRouteStepper()

      // Create a table with a non-existent component
      const table = stepper
        .table()
        .append({
          type: { componentName: 'NonExistentComponent' },
          props: { message: 'Test' },
        })
        .push()

      // Verify initial state
      expect(stepper.datapath[0].type.componentName).toBe('NonExistentComponent')
      expect(stepper.datapath[0].props.message).toBe('Test')

      // Simulate state serialization by creating a new stepper
      const newStepper = getCurrentRouteStepper()

      // Verify the non-existent component data is preserved
      expect(newStepper.datapath[0].type.componentName).toBe('NonExistentComponent')
      expect(newStepper.datapath[0].props.message).toBe('Test')
    })

    it('should maintain component state through navigation', async () => {
      const stepper = getCurrentRouteStepper()

      // Create a table with multiple components
      const table = stepper
        .table()
        .append([
          {
            type: TestComponent,
            props: { message: 'First' },
          },
          {
            type: TestComponent,
            props: { message: 'Second' },
          },
        ])
        .push()

      // Navigate through components
      expect(stepper.datapath[0].props.message).toBe('First')
      stepper.goNextStep()
      expect(stepper.datapath[0].props.message).toBe('Second')

      // Go back
      stepper.goPrevStep()
      expect(stepper.datapath[0].props.message).toBe('First')

      // Simulate state serialization by creating a new stepper
      const newStepper = getCurrentRouteStepper()

      // Verify navigation state was preserved
      expect(newStepper.datapath[0].props.message).toBe('First')
      newStepper.next()
      expect(newStepper.datapath[0].props.message).toBe('Second')
    })
  })

  describe('path field functionality', () => {
    it('should use path field for node identifiers in simple tables', async () => {
      const stepper = getCurrentRouteStepper()

      // Create a table with explicit paths
      const table = stepper
        .table()
        .append([
          { path: 'intro', type: 'instruction' },
          { path: 'practice', type: 'trial' },
          { path: 'main', type: 'trial' },
        ])
        .push()

      // Verify initial state uses the specified path
      expect(stepper.path).toEqual(['intro'])
      expect(stepper.paths).toBe('intro')
      expect(stepper.datapath).toEqual([{ path: 'intro', type: 'instruction' }])

      // Navigate and verify paths
      stepper.goNextStep()
      expect(stepper.path).toEqual(['practice'])
      expect(stepper.paths).toBe('practice')
      expect(stepper.datapath).toEqual([{ path: 'practice', type: 'trial' }])

      stepper.goNextStep()
      expect(stepper.path).toEqual(['main'])
      expect(stepper.paths).toBe('main')
      expect(stepper.datapath).toEqual([{ path: 'main', type: 'trial' }])
    })

    it('should use path field for node identifiers in nested tables', async () => {
      const stepper = getCurrentRouteStepper()

      // Create a nested table structure with explicit paths
      const table = stepper
        .table()
        .append([
          { path: 'block1', type: 'block' },
          { path: 'block2', type: 'block' },
        ])
        .forEach((block) => {
          block.append([
            { path: 'stim', type: 'stimulus' },
            { path: 'feedback', type: 'response' },
          ])
        })
        .push()

      // Verify initial state
      expect(stepper.path).toEqual(['block1', 'stim'])
      expect(stepper.paths).toBe('block1-stim')
      expect(stepper.datapath).toEqual([
        { path: 'block1', type: 'block' },
        { path: 'stim', type: 'stimulus' },
      ])

      // Navigate through the structure and verify paths
      stepper.goNextStep()
      expect(stepper.path).toEqual(['block1', 'feedback'])
      expect(stepper.paths).toBe('block1-feedback')
      expect(stepper.datapath).toEqual([
        { path: 'block1', type: 'block' },
        { path: 'feedback', type: 'response' },
      ])

      stepper.goNextStep()
      expect(stepper.path).toEqual(['block2', 'stim'])
      expect(stepper.paths).toBe('block2-stim')
      expect(stepper.datapath).toEqual([
        { path: 'block2', type: 'block' },
        { path: 'stim', type: 'stimulus' },
      ])

      stepper.goNextStep()
      expect(stepper.path).toEqual(['block2', 'feedback'])
      expect(stepper.paths).toBe('block2-feedback')
      expect(stepper.datapath).toEqual([
        { path: 'block2', type: 'block' },
        { path: 'feedback', type: 'response' },
      ])
    })

    it('should mix explicit paths with default sequential numbering', async () => {
      const stepper = getCurrentRouteStepper()

      // Create a table with mixed path specification
      const table = stepper
        .table()
        .append([
          { path: 'intro', type: 'instruction' },
          { type: 'trial' }, // No path specified
          { path: 'final', type: 'trial' },
        ])
        .push()

      // Verify initial state
      expect(stepper.path).toEqual(['intro'])
      expect(stepper.paths).toBe('intro')
      expect(stepper.datapath).toEqual([{ path: 'intro', type: 'instruction' }])

      // Navigate and verify default numbering is used when path is not specified
      stepper.goNextStep()
      expect(stepper.path).toEqual([1]) // Default sequential numbering
      expect(stepper.paths).toBe('1')
      expect(stepper.datapath).toEqual([{ type: 'trial' }])

      stepper.goNextStep()
      expect(stepper.path).toEqual(['final'])
      expect(stepper.paths).toBe('final')
      expect(stepper.datapath).toEqual([{ path: 'final', type: 'trial' }])
    })
  })
})
