import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia } from 'pinia'
import { createTestingPinia } from '@pinia/testing'
import Stepper from '@/core/stepper/Stepper'

describe('StepperProxy', () => {
  let proxy
  let pinia

  beforeEach(() => {
    // Create pinia instance and set it as active
    pinia = createTestingPinia({ stubActions: true })
    setActivePinia(pinia)

    // Create a new Stepper instance which will be wrapped by StepperProxy

    // // Add some test states
    // stepper.append([
    //   { id: 'state1', data: 'state1' },
    //   { id: 'state2', data: 'state2' },
    //   { id: 'state3', data: 'state3' },
    // ])

    // // Add some test nodes
    // stepper.push('node1', { id: 'node1' })
    // stepper.push('node2', { id: 'node2' })

    // // Add some test properties and methods
    // stepper.someProperty = 'value'
    // stepper.someMethod = () => 'method result'
  })

  describe('array-like access', () => {
    let stepper
    beforeEach(() => {
      stepper = new Stepper({ id: '/' })
      stepper.push('state1')
      stepper.push('state2')
      stepper.push('state3')
    })

    it('should handle positive indices at depth 0', () => {
      // The proxy is automatically created by the Stepper constructor
      expect(stepper.depth).toBe(0)
      expect(stepper[0].id).toBe('state1')

      expect(stepper[1].id).toBe('state2')
      expect(stepper[2].id).toBe('state3')
    })

    it('should handle negative indices at depth 0', () => {
      // Negative indices are adjusted relative to array length
      expect(stepper[-1].id).toBe('state3')
      expect(stepper[-2].id).toBe('state2')
      expect(stepper[-3].id).toBe('state1')
      expect(stepper[-4]).toBeUndefined()
    })

    it('should return undefined for out of bounds indices', () => {
      expect(stepper[3]).toBeUndefined()
      expect(stepper[-4]).toBeUndefined()
    })

    it('should handle string number indices', () => {
      // String numbers are converted to actual numbers
      expect(stepper['0'].id).toBe('state1')
      expect(stepper['1'].id).toBe('state2')
      expect(stepper['-1'].id).toBe('state3')
    })
  })

  describe('property access', () => {
    let stepper
    beforeEach(() => {
      stepper = new Stepper({ id: '/' })
      stepper.push('state1')
      stepper.push('state2')
      stepper.push('state3')

      // Add test properties and methods
      stepper.someProperty = 'value'
      stepper.someMethod = () => 'method result'
    })
    it('should access properties of the target object', () => {
      expect(stepper.someProperty).toBe('value')
    })

    it('should access methods of the target object', () => {
      expect(stepper.someMethod()).toBe('method result')
    })

    it('should return undefined for non-existent properties', () => {
      expect(stepper.nonExistentProperty).toBeUndefined()
    })
  })

  describe('node access', () => {
    let stepper
    beforeEach(() => {
      stepper = new Stepper({ id: '/' })
      // Add test nodes
      stepper.push('node1', { id: 'node1' })
      stepper.push('node2', { id: 'node2' })
    })

    it('should access nodes through getNode method', () => {
      expect(stepper.node1.data).toEqual({ id: 'node1' })
      expect(stepper.node2.data).toEqual({ id: 'node2' })
    })

    it('should return undefined for non-existent nodes', () => {
      expect(stepper.nonExistentNode).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('should handle empty states array', () => {
      const emptyStepper = new Stepper({ id: '/', parent: null })
      expect(emptyStepper[0]).toBeUndefined()
      expect(emptyStepper[-1]).toBeUndefined()
    })

    it('should handle non-string/number properties', () => {
      const stepper = new Stepper({ id: '/' })
      const symbol = Symbol('test')
      expect(stepper[symbol]).toBeUndefined()
    })
  })
})
