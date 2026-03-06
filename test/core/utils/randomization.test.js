/* eslint-disable no-undef */
import seedrandom from 'seedrandom'
import * as random from '@/core/utils/randomization'

describe('Randomization tests', () => {
  beforeEach(() => {
    // Use a fixed seed for deterministic tests
    seedrandom('test-seed', { global: true })
  })

  afterEach(() => {
    seedrandom(undefined, { global: true })
  })

  it('should generate random integers within range', () => {
    const N = 10000
    const randomints = Array(N)
      .fill()
      .map(() => random.randomInt(1, 5))

    // Range check
    expect(Math.max(...randomints)).toBeLessThanOrEqual(5)
    expect(Math.min(...randomints)).toBeGreaterThanOrEqual(1)

    // All values in range should appear (with 10k samples this is near-certain)
    const unique = new Set(randomints)
    expect(unique).toEqual(new Set([1, 2, 3, 4, 5]))

    // Distribution check: each category should be roughly 20% (allow 3% tolerance)
    const counts = {}
    for (const v of randomints) counts[v] = (counts[v] || 0) + 1
    for (let i = 1; i <= 5; i++) {
      expect(counts[i] / N).toBeGreaterThan(0.15)
      expect(counts[i] / N).toBeLessThan(0.25)
    }
  })

  it('should return only integers', () => {
    for (let i = 0; i < 100; i++) {
      const val = random.randomInt(0, 10)
      expect(Number.isInteger(val)).toBe(true)
    }
  })

  it('should shuffle arrays preserving elements', () => {
    const input = [1, 2, 3, 4, 5]
    const result = random.shuffle(input)

    // Should contain all original elements
    expect(result.sort()).toEqual([1, 2, 3, 4, 5])
    // Should not mutate the original
    expect(input).toEqual([1, 2, 3, 4, 5])
  })

  it('should actually reorder elements when shuffling', () => {
    // With a 5-element array and 100 shuffles, identity should be very rare
    const input = [1, 2, 3, 4, 5]
    const results = Array(100)
      .fill()
      .map(() => random.shuffle(input))

    const identityCount = results.filter((r) => r.join(',') === '1,2,3,4,5').length
    // A true shuffle of 5 items has 1/120 chance of identity; with 100 tries
    // we expect ~0-1 identity results, definitely not all 100
    expect(identityCount).toBeLessThan(10)

    // Multiple distinct orderings should appear
    const uniqueOrderings = new Set(results.map((r) => r.join(',')))
    expect(uniqueOrderings.size).toBeGreaterThan(10)
  })

  it('should produce roughly uniform shuffle distribution', () => {
    const N = 6000
    const results = Array(N)
      .fill()
      .map(() => random.shuffle([1, 2, 3]))

    // 3! = 6 permutations, each should appear ~1000 times
    const counts = {}
    for (const r of results) {
      const key = r.join(',')
      counts[key] = (counts[key] || 0) + 1
    }

    expect(Object.keys(counts).length).toBe(6)
    for (const key of Object.keys(counts)) {
      expect(counts[key] / N).toBeGreaterThan(0.1) // >10% (expect ~16.7%)
      expect(counts[key] / N).toBeLessThan(0.25)
    }
  })

  it('should sample without replacement returning unique elements', () => {
    const result = random.sampleWithoutReplacement([1, 2, 3, 4, 5], 3)

    expect(result.length).toBe(3)
    // All elements should be unique
    expect(new Set(result).size).toBe(3)
    // All elements should come from the source array
    for (const v of result) {
      expect([1, 2, 3, 4, 5]).toContain(v)
    }
  })

  it('should sample without replacement with full array returning all elements', () => {
    const result = random.sampleWithoutReplacement([1, 2, 3], 3)
    expect(result.sort()).toEqual([1, 2, 3])
  })

  it('should sample with replacement allowing duplicates', () => {
    // With 1000 samples of size 3 from [1,2,3], some must have duplicates
    const results = Array(1000)
      .fill()
      .map(() => random.sampleWithReplacement([1, 2, 3], 3))

    const hasDuplicates = results.some((r) => new Set(r).size < r.length)
    expect(hasDuplicates).toBe(true)

    // All values should be from the source array
    for (const r of results) {
      for (const v of r) {
        expect([1, 2, 3]).toContain(v)
      }
    }
  })

  it('should sample with replacement respecting weights', () => {
    // Heavily weight the first element
    const N = 1000
    const results = Array(N)
      .fill()
      .map(() => random.sampleWithReplacement(['a', 'b', 'c'], 1, [100, 1, 1]))

    const counts = {}
    for (const [v] of results) counts[v] = (counts[v] || 0) + 1

    // 'a' should dominate (~98% of the time)
    expect(counts['a'] / N).toBeGreaterThan(0.9)
    // 'b' and 'c' should appear rarely
    expect((counts['b'] || 0) / N).toBeLessThan(0.05)
    expect((counts['c'] || 0) / N).toBeLessThan(0.05)
  })

  it('should compute correct cartesian product', () => {
    const combos = random.expandProduct([1, 2], [3, 4], [5, 6])

    expect(combos.length).toBe(8)
    // Verify actual content — all 8 combinations should be present
    const asStrings = combos.map((c) => c.join(',')).sort()
    expect(asStrings).toEqual([
      '1,3,5', '1,3,6', '1,4,5', '1,4,6',
      '2,3,5', '2,3,6', '2,4,5', '2,4,6',
    ])
  })

  it('should compute cartesian product with different sized arrays', () => {
    const combos = random.expandProduct(['a', 'b'], [1, 2, 3])

    expect(combos.length).toBe(6)
    const asStrings = combos.map((c) => c.join(',')).sort()
    expect(asStrings).toEqual([
      'a,1', 'a,2', 'a,3',
      'b,1', 'b,2', 'b,3',
    ])
  })
})
