/**
 * @fileoverview The parts of utils/randomization.js that
 * randomization.test.js doesn't reach: the edges of sampling, the size
 * warning of expandProduct, and the fake-data distributions.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import seedrandom from 'seedrandom'
import * as random from '../../../src/runtime/utils/randomization.js'

const { fakerDistributions } = random

describe('randomization: edges and fake data', () => {
  beforeEach(() => {
    seedrandom('randomization-more', { global: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    seedrandom(undefined, { global: true })
  })

  describe('randomInt', () => {
    it('includes both ends', () => {
      const seen = new Set()
      for (let i = 0; i < 500; i++) seen.add(random.randomInt(2, 4))
      expect([...seen].sort()).toEqual([2, 3, 4])
    })

    it('rounds the bounds inward when they are not integers', () => {
      for (let i = 0; i < 200; i++) {
        const n = random.randomInt(1.2, 3.8)
        expect(n).toBeGreaterThanOrEqual(2)
        expect(n).toBeLessThanOrEqual(3)
      }
    })

    it('returns the one value when min equals max', () => {
      expect(random.randomInt(7, 7)).toBe(7)
    })
  })

  describe('shuffle', () => {
    it('returns a new array and leaves the one it was given alone', () => {
      const input = [1, 2, 3, 4, 5, 6, 7, 8]
      const copy = [...input]
      const out = random.shuffle(input)
      expect(out).not.toBe(input)
      expect(input).toEqual(copy)
    })

    it('handles an empty array and a single element', () => {
      expect(random.shuffle([])).toEqual([])
      expect(random.shuffle(['only'])).toEqual(['only'])
    })

    it('gives the same order for the same seed', () => {
      seedrandom('fixed', { global: true })
      const a = random.shuffle([1, 2, 3, 4, 5, 6])
      seedrandom('fixed', { global: true })
      expect(random.shuffle([1, 2, 3, 4, 5, 6])).toEqual(a)
    })
  })

  describe('sampleWithoutReplacement', () => {
    it('logs an error and returns every element when asked for more than there are', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const out = random.sampleWithoutReplacement([1, 2, 3], 5)
      expect(error).toHaveBeenCalledWith('sample size larger than array length')
      expect([...out].sort()).toEqual([1, 2, 3])
    })

    it('does not log when the size fits', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(random.sampleWithoutReplacement([1, 2, 3], 3)).toHaveLength(3)
      expect(random.sampleWithoutReplacement([1, 2, 3], 0)).toEqual([])
      expect(error).not.toHaveBeenCalled()
    })
  })

  describe('sampleWithReplacement', () => {
    it('returns an empty sample for a size of zero, with or without weights', () => {
      expect(random.sampleWithReplacement([1, 2], 0)).toEqual([])
      expect(random.sampleWithReplacement([1, 2], 0, [1, 1])).toEqual([])
    })

    it('never picks an element whose weight is zero', () => {
      const out = random.sampleWithReplacement(['a', 'b', 'c'], 300, [1, 0, 1])
      expect(out).toHaveLength(300)
      expect(out).not.toContain('b')
      expect(new Set(out)).toEqual(new Set(['a', 'c']))
    })

    it('picks by the cumulative weight', () => {
      const draws = [0.0, 0.24, 0.26, 0.74, 0.76, 0.999]
      vi.spyOn(Math, 'random').mockImplementation(() => draws.shift())
      // weights 1:2:1 → a below 0.25, b up to 0.75, c above
      expect(random.sampleWithReplacement(['a', 'b', 'c'], 6, [1, 2, 1])).toEqual(['a', 'a', 'b', 'b', 'c', 'c'])
    })

    it('returns the last element, not undefined, when rounding leaves the weights summing to under 1', () => {
      // These weights, normalized and added up, give 0.9999999999999998;
      // Math.random() can return 0.9999999999999999.
      const weights = [5, 9, 4, 8, 3, 7, 2, 6]
      const total = weights.reduce((a, b) => a + b, 0)
      expect(weights.map(w => w / total).reduce((a, b) => a + b, 0)).toBeLessThan(0.9999999999999999)
      vi.spyOn(Math, 'random').mockReturnValue(0.9999999999999999)
      const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
      expect(random.sampleWithReplacement(items, 2, weights)).toEqual(['h', 'h'])
    })
  })

  describe('expandProduct', () => {
    it('warns when the product has more than 1000 combinations', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const ten = Array.from({ length: 10 }, (_, i) => i)
      const eleven = Array.from({ length: 11 }, (_, i) => i)
      expect(random.expandProduct(ten, ten, eleven)).toHaveLength(1100)
      expect(warn).toHaveBeenCalledTimes(1)
    })

    it('does not warn at exactly 1000', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const ten = Array.from({ length: 10 }, (_, i) => i)
      expect(random.expandProduct(ten, ten, ten)).toHaveLength(1000)
      expect(warn).not.toHaveBeenCalled()
    })

    it('is empty when one of the arrays is empty', () => {
      expect(random.expandProduct([1, 2], [])).toEqual([])
    })
  })

  describe('fakerDistributions', () => {
    const many = (fn, n = 4000) => Array.from({ length: n }, () => fn().val)
    const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length
    const sd = (xs) => {
      const m = mean(xs)
      return Math.sqrt(mean(xs.map(x => (x - m) ** 2)))
    }

    it('every value is marked as fake', () => {
      expect(fakerDistributions.rnorm(0, 1).type).toBe('fake')
      expect(fakerDistributions.runif(0, 1).type).toBe('fake')
      expect(fakerDistributions.rbinom(3, 0.5).type).toBe('fake')
      expect(fakerDistributions.rexGaussian(1, 1, 1).type).toBe('fake')
      expect(fakerDistributions.rchoice([1]).type).toBe('fake')
    })

    it('rnorm has the mean and standard deviation asked for', () => {
      const xs = many(() => fakerDistributions.rnorm(50, 5))
      expect(mean(xs)).toBeGreaterThan(49.5)
      expect(mean(xs)).toBeLessThan(50.5)
      expect(sd(xs)).toBeGreaterThan(4.6)
      expect(sd(xs)).toBeLessThan(5.4)
    })

    it('rnorm draws again when Math.random returns 0 (the log of 0 is not finite)', () => {
      const draws = [0, 0.5, 0, 0.25]
      vi.spyOn(Math, 'random').mockImplementation(() => draws.shift())
      const { val } = fakerDistributions.rnorm(10, 2)
      expect(Number.isFinite(val)).toBe(true)
      // u = 0.5, v = 0.25: cos(pi / 2) is 0 (to rounding), so the value is the mean
      expect(val).toBeCloseTo(10, 10)
      expect(draws).toEqual([])
    })

    it('runif stays in its range and is centred on the middle', () => {
      const xs = many(() => fakerDistributions.runif(10, 20))
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(10)
      expect(Math.max(...xs)).toBeLessThan(20)
      expect(mean(xs)).toBeGreaterThan(14.7)
      expect(mean(xs)).toBeLessThan(15.3)
    })

    it('rbinom counts successes out of n', () => {
      expect(fakerDistributions.rbinom(10, 0).val).toBe(0)
      expect(fakerDistributions.rbinom(10, 1).val).toBe(10)
      expect(fakerDistributions.rbinom(0, 0.5).val).toBe(0)
      const xs = many(() => fakerDistributions.rbinom(20, 0.25), 2000)
      expect(xs.every(x => Number.isInteger(x) && x >= 0 && x <= 20)).toBe(true)
      expect(mean(xs)).toBeGreaterThan(4.6)
      expect(mean(xs)).toBeLessThan(5.4)
    })

    it('rexGaussian has mean mu + tau', () => {
      const xs = many(() => fakerDistributions.rexGaussian(300, 20, 100))
      expect(mean(xs)).toBeGreaterThan(390)
      expect(mean(xs)).toBeLessThan(410)
    })

    it('rchoice returns one of the options, and each of them over many draws', () => {
      const seen = new Set(many(() => fakerDistributions.rchoice(['x', 'y', 'z']), 300))
      expect(seen).toEqual(new Set(['x', 'y', 'z']))
    })

    it('rchoice throws for an empty array or something that is not an array', () => {
      expect(() => fakerDistributions.rchoice([])).toThrow('rchoice requires a non-empty array of options')
      expect(() => fakerDistributions.rchoice('abc')).toThrow('rchoice requires a non-empty array of options')
      expect(() => fakerDistributions.rchoice()).toThrow('rchoice requires a non-empty array of options')
    })

    it('render replaces each function in a trial with what it returns, and keeps the rest', () => {
      const trial = { rt: () => ({ val: 512, type: 'fake' }), stimulus: 'red', n: 3 }
      const out = fakerDistributions.render(trial)
      expect(out).toBe(trial)
      expect(out).toEqual({ rt: { val: 512, type: 'fake' }, stimulus: 'red', n: 3 })
    })

    it('render does not look inside nested objects', () => {
      const inner = () => 1
      expect(fakerDistributions.render({ nested: { f: inner } }).nested.f).toBe(inner)
    })
  })
})
