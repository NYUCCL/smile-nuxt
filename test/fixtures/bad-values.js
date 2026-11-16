/**
 * Values experiment code might record that plain JSON can't hold, or that
 * today's checks refuse (plans/sync_engine.md, "Bad data, layer by layer").
 *
 * Every layer's tests use this list: the record functions, stepper state,
 * the snapshot, the server. Each entry builds a fresh value (`make()`), so a
 * test can change it, and cycles are made anew each time.
 *
 * `make()` returns an object to record (`{ value: ... }` for most), since
 * recordPageData() takes an object. `topLevel: true` entries are the value
 * itself, for functions that take any value.
 */
import { defineComponent, reactive, ref } from 'vue'

function circularObject() {
  const a = { name: 'a' }
  a.self = a
  return { value: a }
}

function circularArray() {
  const arr = [1, 2]
  arr.push(arr)
  return { value: arr }
}

function circularThroughTwo() {
  const a = { name: 'a' }
  const b = { name: 'b', a }
  a.b = b
  return { value: a }
}

/** The same object twice is not a cycle; both copies must be kept. */
function sharedReference() {
  const shared = { x: 1 }
  return { first: shared, second: shared }
}

function deeplyNested(depth) {
  let v = { leaf: true }
  for (let i = 0; i < depth; i++) v = { child: v }
  return { value: v }
}

function manyKeys(n) {
  const o = {}
  for (let i = 0; i < n; i++) o[`k${i}`] = i
  return { value: o }
}

function throwingGetter() {
  const o = { ok: 1 }
  Object.defineProperty(o, 'bad', {
    enumerable: true,
    get() { throw new Error('getter exploded') },
  })
  return { value: o }
}

function throwingProxy() {
  const fail = () => {
    throw new Error('proxy trap exploded')
  }
  const p = new Proxy({}, {
    get: fail, set: fail, has: fail, ownKeys: fail, getOwnPropertyDescriptor: fail,
    defineProperty: fail, deleteProperty: fail, getPrototypeOf: fail,
  })
  return { value: p }
}

function throwingToJSON() {
  return {
    value: {
      toJSON() {
        throw new Error('toJSON exploded')
      },
    },
  }
}

class WithPrivate {
  #secret = 1
  visible = 2
  method() { return this.#secret }
}

const SomeComponent = defineComponent({ name: 'SomeComponent', render: () => null })

export const BAD_VALUES = [
  // Missing and non-data values
  { name: 'undefined value', make: () => ({ value: undefined }) },
  { name: 'function value', make: () => ({ value: () => 1 }) },
  { name: 'symbol value', make: () => ({ value: Symbol('s') }) },
  { name: 'symbol key', make: () => ({ [Symbol('k')]: 1, ok: true }) },

  // Numbers
  { name: 'NaN', make: () => ({ value: Number.NaN }) },
  { name: 'Infinity', make: () => ({ value: Infinity }) },
  { name: '-Infinity', make: () => ({ value: -Infinity }) },
  { name: '-0', make: () => ({ value: -0 }) },
  { name: 'BigInt', make: () => ({ value: 10n }) },
  { name: 'BigInt in an array', make: () => ({ value: [1, 2n, 3] }) },

  // Built-in objects
  { name: 'Date', make: () => ({ value: new Date('2026-01-02T03:04:05Z') }) },
  { name: 'invalid Date', make: () => ({ value: new Date('nope') }) },
  { name: 'Map', make: () => ({ value: new Map([['a', 1]]) }) },
  { name: 'Set', make: () => ({ value: new Set([1, 2]) }) },
  { name: 'typed array', make: () => ({ value: new Uint8Array([1, 2, 3]) }) },
  { name: 'ArrayBuffer', make: () => ({ value: new ArrayBuffer(4) }) },
  { name: 'RegExp', make: () => ({ value: /ab+c/gi }) },
  { name: 'Error', make: () => ({ value: new Error('boom') }) },
  { name: 'class instance with private field', make: () => ({ value: new WithPrivate() }) },
  { name: 'Object.create(null)', make: () => ({ value: Object.assign(Object.create(null), { a: 1 }) }) },
  { name: 'frozen object', make: () => ({ value: Object.freeze({ a: Object.freeze([1]) }) }) },

  // References
  { name: 'circular object', make: circularObject },
  { name: 'circular array', make: circularArray },
  { name: 'cycle through two objects', make: circularThroughTwo },
  { name: 'shared (not circular) reference', make: sharedReference },

  // Things a view might hold
  { name: 'Vue reactive object', make: () => ({ value: reactive({ a: 1, nested: { b: 2 } }) }) },
  { name: 'Vue ref', make: () => ({ value: ref(5) }) },
  { name: 'Vue component', make: () => ({ value: SomeComponent }) },
  { name: 'DOM node', make: () => ({ value: document.createElement('div') }) },
  { name: 'event-like object holding a DOM node', make: () => ({ value: { key: 'a', target: document.createElement('input') } }) },

  // Hostile objects
  { name: 'getter that throws', make: throwingGetter },
  { name: 'Proxy that throws on every trap', make: throwingProxy },
  { name: 'toJSON that throws', make: throwingToJSON },

  // Keys
  { name: 'keys with . / [ ] *', make: () => ({ 'a.b': 1, 'c/d': 2, 'e[0]': 3, 'f*': 4 }) },
  { name: '__proto__ key', make: () => JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}') },
  { name: 'constructor key', make: () => ({ constructor: 'x', ok: 1 }) },
  { name: 'empty key', make: () => ({ '': 1 }) },

  // Arrays
  { name: 'nested arrays', make: () => ({ matrix: [[1, 2], [3, 4]] }) },
  { name: 'sparse array', make: () => ({ value: [1, , 3] }) }, // eslint-disable-line no-sparse-arrays

  // Strings
  { name: 'lone UTF-16 surrogate', make: () => ({ value: 'a\uD800b' }) },
  { name: 'emoji and combining marks', make: () => ({ value: '\u{1F469}\u{1F3FD}\u200D\u{1F52C} e\u0301 \u0000 \u2028' }) },

  // Size and depth
  { name: 'deep nesting (200)', make: () => deeplyNested(200) },
  { name: 'deep nesting (20 000)', make: () => deeplyNested(20_000), slow: true },
  { name: 'object with 10 000 keys', make: () => manyKeys(10_000) },
  { name: 'array of 100 000 numbers', make: () => ({ value: Array.from({ length: 100_000 }, (_, i) => i) }) },
  { name: '2 MB string', make: () => ({ value: 'x'.repeat(2_000_000) }), slow: true },
]

/** Values passed as the whole argument, not inside an object */
export const BAD_TOP_LEVEL = [
  { name: 'null', make: () => null },
  { name: 'undefined', make: () => undefined },
  { name: 'a string', make: () => 'just text' },
  { name: 'a number', make: () => 42 },
  { name: 'an array', make: () => [1, 2, 3] },
  { name: 'a function', make: () => () => 1 },
  { name: 'BigInt', make: () => 1n },
]

/**
 * Does `value` survive being sent and read back? This is the property every
 * saved value must have: JSON.stringify doesn't throw, and parsing the result
 * gives something that stringifies to the same text.
 */
export function isPlainJSON(value) {
  try {
    const text = JSON.stringify(value)
    if (text === undefined) return false
    return JSON.stringify(JSON.parse(text)) === text
  }
  catch {
    return false
  }
}
