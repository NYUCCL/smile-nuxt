/* eslint-disable no-undef */
import * as random from '@/core/utils/randomization'

describe('Randomization tests', () => {
  it('should generate random integers', () => {
    const randomints = Array(10000)
      .fill()
      .map((element) => random.randomInt(1, 5))

    // numbers should be between 1 and 5
    expect(Math.max(...randomints)).toBeLessThanOrEqual(5)
    expect(Math.min(...randomints)).toBeGreaterThanOrEqual(1)

    // // roughly equal numbers per category
    // const counts = {};
    // for (let i = 0; i < randomints.length; i++) {
    //     counts[randomints[i]] = 1 + (counts[randomints[i]] || 0);
    // }
    // // shouldn't be off by more than 100? this is arbitrary and could fail sometimes
    // expect(Math.abs(counts[1]-(10000/5))).toBeLessThanOrEqual(100)
    // expect(Math.abs(counts[2]-(10000/5))).toBeLessThanOrEqual(100)
    // expect(Math.abs(counts[3]-(10000/5))).toBeLessThanOrEqual(100)
    // expect(Math.abs(counts[4]-(10000/5))).toBeLessThanOrEqual(100)
    // expect(Math.abs(counts[5]-(10000/5))).toBeLessThanOrEqual(100)
  })

  it('should shuffle arrays', () => {
    const randomarrays = Array(10000)
      .fill()
      .map((element) => random.shuffle([1, 2, 3]))

    // each array in randomarrays should have 1, 2, and 3 (in any order)
    for (let i = 0; i < randomarrays.length; i++) {
      expect(randomarrays[i].includes(1)).toBe(true)
      expect(randomarrays[i].includes(2)).toBe(true)
      expect(randomarrays[i].includes(3)).toBe(true)
    }

    // // numbers of each shuffling order should be about equal
    // const counts = {};
    // for (let i = 0; i < randomarrays.length; i++) {
    //     counts[randomarrays[i]] = 1 + (counts[randomarrays[i]] || 0);
    // }

    // // again, 100 is very arbitrary here
    // expect(Math.abs(counts["1,2,3"]-(10000/6))).toBeLessThanOrEqual(100)
    // expect(Math.abs(counts["1,3,2"]-(10000/6))).toBeLessThanOrEqual(100)
    // expect(Math.abs(counts["2,1,3"]-(10000/6))).toBeLessThanOrEqual(100)
    // expect(Math.abs(counts["2,3,1"]-(10000/6))).toBeLessThanOrEqual(100)
    // expect(Math.abs(counts["3,1,2"]-(10000/6))).toBeLessThanOrEqual(100)
    // expect(Math.abs(counts["3,2,1"]-(10000/6))).toBeLessThanOrEqual(100)
  })

  it('should sample without replacement', () => {
    const randomarrays = Array(10000)
      .fill()
      .map((element) => random.sampleWithoutReplacement([1, 2, 3], 3))

    // since sampling is without replacement, 3 samples should give you all three numbers
    // each array in randomarrays should have 1, 2, and 3 (in any order)
    for (let i = 0; i < randomarrays.length; i++) {
      expect(randomarrays[i].includes(1)).toBe(true)
      expect(randomarrays[i].includes(2)).toBe(true)
      expect(randomarrays[i].includes(3)).toBe(true)
    }
  })

  it('should sample with replacement', () => {
    const randomarrays = Array(10000)
      .fill()
      .map((element) => random.sampleWithReplacement([1, 2, 3], 3))

    // since sampling is with replacement, at least one of these has to be true
    for (let i = 0; i < randomarrays.length; i++) {
      expect([randomarrays[i].includes(1), randomarrays[i].includes(2), randomarrays[i].includes(3)]).toContain(true)
    }

    // there should be no number other than 1, 2, or 3
    for (let i = 0; i < randomarrays.length; i++) {
      expect(Math.max(...randomarrays[i])).toBeLessThanOrEqual(3)
      expect(Math.min(...randomarrays[i])).toBeGreaterThanOrEqual(1)
    }
  })

  it('should get cartesian product of arrays', () => {
    const combos = random.expandProduct([1, 2], [3, 4], [5, 6])
    // should have 8 combos
    expect(combos.length).toBe(8)

    const combos2 = random.expandProduct([1, 2, 3, 4], [3, 4, 7, 10], [5, 6])
    // should have 32 combos
    expect(combos2.length).toBe(32)
  })
})
