/**
 * Gets random integer between min (inclusive) and max (inclusive)
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (inclusive)
 * @returns {number} Random integer between min and max
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (Math.floor(max) - Math.ceil(min) + 1) + Math.ceil(min))
}

/**
 * Shuffles array in place using Fisher-Yates algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} New shuffled array
 */
export function shuffle(array) {
  const arrayCopy = array.slice(0)
  for (let i = arrayCopy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = arrayCopy[i]
    arrayCopy[i] = arrayCopy[j]
    arrayCopy[j] = temp
  }
  return arrayCopy
}

/**
 * Samples elements from array without replacement
 * @param {Array} array - Array to sample from
 * @param {number} sampleSize - Number of elements to sample
 * @returns {Array} Array of sampled elements
 */
export function sampleWithoutReplacement(array, sampleSize) {
  if (sampleSize > array.length) {
    console.error('sample size larger than array length')
  }
  return shuffle(array).slice(0, sampleSize)
}

/**
 * Samples elements from array with replacement, optionally using weights
 * @param {Array} array - Array to sample from
 * @param {number} sampleSize - Number of elements to sample
 * @param {Array<number>} [weights] - Optional array of weights for weighted sampling
 * @returns {Array} Array of sampled elements
 */
export function sampleWithReplacement(array, sampleSize, weights = undefined) {
  // if weights are not provided, normal sample with replacement
  if (!weights) {
    const sample = []
    let s = sampleSize
    while (s > 0) {
      sample.push(array[randomInt(0, array.length - 1)])
      s -= 1
    }
    return sample
  }

  // if weights are provided, sample with replacement with weights
  // normalize weights array -- get sum of all weights
  const sumOfWeights = weights.reduce((a, b) => a + b, 0)
  // divide each weight by the sum of all weights
  const normalizedWeights = weights.map((weight) => weight / sumOfWeights)

  const sample = []
  let s = sampleSize
  while (s > 0) {
    const random = Math.random()
    let i = 0
    let sum = normalizedWeights[i]
    while (random > sum) {
      i += 1
      sum += normalizedWeights[i]
    }
    sample.push(array[i])
    s -= 1
  }
  return sample
}

/**
 * Computes Cartesian product of input arrays
 * @param {...Array} arr - Arrays to compute product of
 * @returns {Array} Array containing all combinations
 */
export function expandProduct(...arr) {
  // get length of each sub array in arr
  const lengths = arr.map((x) => x.length)
  // get product of lengths
  const product = lengths.reduce((a, b) => a * b, 1)
  if (product > 1000) {
    console.warn("That's a whole lot of combinations! Are you sure you want to do that?")
  }
  return arr.reduce((a, b) => a.flatMap((d) => b.map((e) => [d, e].flat())))
}

/**
 * Collection of functions for generating random values from different distributions
 * @namespace
 */
export const fakerDistributions = {
  /**
   * Generates random number from normal distribution
   * @param {number} mean - Mean of distribution
   * @param {number} sd - Standard deviation of distribution
   * @returns {{val: number, type: string}} Object containing random value and type
   */
  rnorm: (mean, sd) => {
    let u = 0,
      v = 0
    while (u === 0) u = Math.random()
    while (v === 0) v = Math.random()
    return {
      val: mean + sd * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v),
      type: 'fake',
    }
  },

  /**
   * Generates random number from uniform distribution
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {{val: number, type: string}} Object containing random value and type
   */
  runif: (min, max) => ({
    val: Math.random() * (max - min) + min,
    type: 'fake',
  }),

  /**
   * Generates random number from binomial distribution
   * @param {number} n - Number of trials
   * @param {number} p - Probability of success
   * @returns {{val: number, type: string}} Object containing random value and type
   */
  rbinom: (n, p) => ({
    val: Array(n)
      .fill(0)
      .reduce((acc) => acc + (Math.random() < p ? 1 : 0), 0),
    type: 'fake',
  }),

  /**
   * Generates random number from ex-Gaussian distribution
   * @param {number} mu - Mean of normal component
   * @param {number} sigma - Standard deviation of normal component
   * @param {number} tau - Rate parameter of exponential component
   * @returns {{val: number, type: string}} Object containing random value and type
   */
  rexGaussian: (mu, sigma, tau) => {
    const x = distributions.rnorm(0, 1).val
    const z = distributions.runif(0, 1).val
    return {
      val: mu + sigma * x + tau * -Math.log(z),
      type: 'fake',
    }
  },

  /**
   * Randomly selects an element from an array of options
   * @param {Array} options - Array of options to choose from
   * @returns {{val: *, type: string}} Object containing selected value and type
   * @throws {Error} If options array is empty or not an array
   */
  rchoice: (options) => {
    if (!Array.isArray(options) || options.length === 0) {
      throw new Error('rchoice requires a non-empty array of options')
    }
    const index = Math.floor(Math.random() * options.length)
    return {
      val: options[index],
      type: 'fake',
    }
  },

  /**
   * Evaluates any function values in a trial object
   * @param {Object} trial - Trial object potentially containing function values
   * @returns {Object} Trial object with functions evaluated
   */
  render: (trial) => {
    for (let [key, value] of Object.entries(trial)) {
      if (typeof value === 'function') {
        trial[key] = value()
      }
    }
    return trial
  },
}
