/**
 * @fileoverview JSON text with object keys in sorted order.
 */

/**
 * Converts a value to JSON text whose object keys are sorted (by UTF-16 code
 * unit, the default Array sort), so two objects with the same content give
 * the same text whatever order their keys were added in. No whitespace.
 *
 * The output is the same as the json-stable-stringify package called with no
 * options (test/core/utils/completionCodeParity.test.js compares the two):
 * - a value with a toJSON() method is replaced by what it returns (a Date
 *   becomes its ISO string)
 * - undefined, a function or a symbol is left out of an object and is null
 *   in an array; at the top level the result is undefined
 * - NaN and Infinity are null
 * - an object that contains itself throws a TypeError
 * @param {*} value - The value to convert
 * @returns {string|undefined} The JSON text
 */
export function stableStringify(value) {
  const ancestors = []

  function walk(node) {
    if (node && typeof node.toJSON === 'function') node = node.toJSON()
    if (node === undefined) return undefined
    if (typeof node !== 'object' || node === null) return JSON.stringify(node)

    if (Array.isArray(node)) {
      const items = []
      for (let i = 0; i < node.length; i += 1) items.push(walk(node[i]) || 'null')
      return `[${items.join(',')}]`
    }

    if (ancestors.includes(node)) throw new TypeError('Converting circular structure to JSON')
    ancestors.push(node)
    const members = []
    for (const key of Object.keys(node).sort()) {
      const text = walk(node[key])
      if (!text) continue
      members.push(`${JSON.stringify(key)}:${text}`)
    }
    ancestors.splice(ancestors.indexOf(node), 1)
    return `{${members.join(',')}}`
  }

  return walk(value)
}

export default stableStringify
