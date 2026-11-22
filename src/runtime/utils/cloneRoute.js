/**
 * @fileoverview Deep copy for route configuration objects.
 */

/**
 * Whether a value is an object created by an object literal, `new Object()`
 * or `Object.create(null)`.
 * @param {unknown} value - The value to check
 * @returns {boolean} True for a plain object
 */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Copies a route configuration. Plain objects and arrays are copied at every
 * depth (own enumerable string and symbol keys). Every other value is kept by
 * reference: functions (lazy component loaders, guards), class instances,
 * Dates, Maps, Sets and primitives. A component written as a plain options
 * object is a plain object, so it is copied and its functions are shared with
 * the original. An object reached twice, or through a cycle, is copied once.
 * @param {*} value - The route (or any value inside one)
 * @returns {*} The copy
 */
export function cloneRoute(value) {
  return copy(value, new Map())
}

/**
 * @param {*} value - The value to copy
 * @param {Map<object, object>} copies - Originals already copied, and their copies
 * @returns {*} The copy
 */
function copy(value, copies) {
  const isArray = Array.isArray(value)
  if (!isArray && !isPlainObject(value)) return value
  if (copies.has(value)) return copies.get(value)

  if (isArray) {
    const out = Array.from({ length: value.length })
    copies.set(value, out)
    for (let i = 0; i < value.length; i += 1) out[i] = copy(value[i], copies)
    return out
  }

  const out = {}
  copies.set(value, out)
  for (const key of Object.keys(value)) out[key] = copy(value[key], copies)
  for (const symbol of Object.getOwnPropertySymbols(value)) {
    if (Object.prototype.propertyIsEnumerable.call(value, symbol)) out[symbol] = copy(value[symbol], copies)
  }
  return out
}

export default cloneRoute
