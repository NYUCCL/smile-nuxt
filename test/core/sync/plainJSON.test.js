import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { reactive, ref, defineComponent } from 'vue'
import {
  toPlainJSON, safeStringify, sendable, addWarnings, MAX_WARNINGS,
} from '../../../src/runtime/utils/plainJSON.js'
import { BAD_VALUES, BAD_TOP_LEVEL, isPlainJSON } from '../../fixtures/bad-values.js'

/**
 * toPlainJSON (plans/sync_engine.md, "Bad data, layer by layer"): any value
 * in, plain JSON out, never a throw.
 */

function cleanWithWarnings(value, path) {
  const warnings = []
  const out = toPlainJSON(value, { path, warn: w => warnings.push(w) })
  return { out, warnings }
}

describe('toPlainJSON: every value in the corpus', () => {
  for (const bad of [...BAD_VALUES, ...BAD_TOP_LEVEL]) {
    it(bad.name, () => {
      let out
      expect(() => {
        out = toPlainJSON(bad.make())
      }).not.toThrow()
      if (out !== undefined) expect(isPlainJSON(out)).toBe(true)
    })
  }
})

describe('toPlainJSON: what each value becomes', () => {
  const cases = [
    ['undefined in an object is dropped', { a: undefined, b: 1 }, { b: 1 }],
    ['a function in an object is dropped', { f: () => 1, b: 1 }, { b: 1 }],
    ['a symbol in an object is dropped', { s: Symbol('s'), b: 1 }, { b: 1 }],
    ['undefined, functions, symbols in an array become null', [undefined, () => 1, Symbol('s')], [null, null, null]],
    ['NaN and Infinity become null', { a: Number.NaN, b: Infinity, c: -Infinity }, { a: null, b: null, c: null }],
    ['a BigInt becomes its decimal string', { n: 12345678901234567890n }, { n: '12345678901234567890' }],
    ['a Date becomes an ISO string', { d: new Date('2026-01-02T03:04:05Z') }, { d: '2026-01-02T03:04:05.000Z' }],
    ['an invalid Date becomes null', { d: new Date('nope') }, { d: null }],
    ['a Map becomes an object', { m: new Map([['a', 1], [2, 'b']]) }, { m: { a: 1, 2: 'b' } }],
    ['a Set becomes an array', { s: new Set([1, 'x']) }, { s: [1, 'x'] }],
    ['a typed array becomes an array of numbers', { t: new Float32Array([0.5, 2]) }, { t: [0.5, 2] }],
    ['an ArrayBuffer becomes its bytes', { b: new Uint8Array([7, 8]).buffer }, { b: [7, 8] }],
    ['a RegExp becomes its source', { r: /ab+c/gi }, { r: '/ab+c/gi' }],
    ['an Error becomes its name and message', { e: new TypeError('bad') }, { e: { name: 'TypeError', message: 'bad' } }],
    ['nested arrays are kept', { m: [[1, 2], [3, [4]]] }, { m: [[1, 2], [3, [4]]] }],
    ['keys with . / [ ] * are kept', { 'a.b': 1, 'c/d': 2, 'e[0]': 3, 'f*': 4 }, { 'a.b': 1, 'c/d': 2, 'e[0]': 3, 'f*': 4 }],
    ['a sparse array gets null in the holes', [1, , 3], [1, null, 3]], // eslint-disable-line no-sparse-arrays
    ['a lone surrogate becomes U+FFFD', 'a\uD800b', 'a�b'],
    ['an emoji pair is kept', '\u{1F469}\u{1F3FD}', '\u{1F469}\u{1F3FD}'],
  ]
  for (const [name, input, expected] of cases) {
    it(name, () => {
      expect(toPlainJSON(input)).toEqual(expected)
    })
  }

  it('a circular reference becomes "[Circular]"', () => {
    const a = { name: 'a' }
    a.self = a
    expect(toPlainJSON(a)).toEqual({ name: 'a', self: '[Circular]' })
    const arr = [1]
    arr.push(arr)
    expect(toPlainJSON(arr)).toEqual([1, '[Circular]'])
  })

  it('the same object twice is kept twice (it is not a cycle)', () => {
    const shared = { x: 1 }
    expect(toPlainJSON({ first: shared, second: [shared, shared] }))
      .toEqual({ first: { x: 1 }, second: [{ x: 1 }, { x: 1 }] })
  })

  it('Vue refs and reactive objects become their plain values', () => {
    const state = reactive({ a: 1, nested: { b: [2, 3] } })
    expect(toPlainJSON({ r: ref(5), s: state, nestedRef: ref({ deep: ref('x') }) }))
      .toEqual({ r: 5, s: { a: 1, nested: { b: [2, 3] } }, nestedRef: { deep: 'x' } })
  })

  it('a cycle through a reactive object is still found', () => {
    const state = reactive({ name: 'a' })
    state.self = state
    expect(toPlainJSON(state)).toEqual({ name: 'a', self: '[Circular]' })
  })

  it('DOM nodes and Vue components become markers', () => {
    const Comp = defineComponent({ name: 'Trial', render: () => null })
    expect(toPlainJSON({ el: document.createElement('div'), c: Comp }))
      .toEqual({ el: '[Unserializable: HTMLDivElement]', c: '[Unserializable: Vue component Trial]' })
  })

  it('a class instance keeps its plain fields; one with none becomes a marker', () => {
    class Point {
      constructor() {
        this.x = 1
        this.y = 2
      }
    }
    class Opaque {
      #hidden = 1
      get hidden() { return this.#hidden }
    }
    expect(toPlainJSON({ p: new Point(), o: new Opaque() }))
      .toEqual({ p: { x: 1, y: 2 }, o: '[Unserializable: Opaque]' })
  })

  it('a getter that throws becomes "[Error: ...]" and the rest is kept', () => {
    const o = { ok: 1 }
    Object.defineProperty(o, 'bad', {
      enumerable: true,
      get() {
        throw new Error('nope')
      },
    })
    expect(toPlainJSON(o)).toEqual({ ok: 1, bad: '[Error: nope]' })
  })

  it('a Proxy that throws on every trap becomes "[Error: ...]"', () => {
    const fail = () => {
      throw new Error('trap')
    }
    const p = new Proxy({}, { get: fail, ownKeys: fail, getPrototypeOf: fail, has: fail, getOwnPropertyDescriptor: fail })
    expect(toPlainJSON({ p, ok: true })).toEqual({ p: '[Error: trap]', ok: true })
  })

  it('toJSON is used, and one that throws becomes "[Error: ...]"', () => {
    expect(toPlainJSON({ d: { toJSON: () => ({ when: 'now' }) } })).toEqual({ d: { when: 'now' } })
    const throws = {
      toJSON() {
        throw new Error('tj')
      },
    }
    expect(toPlainJSON({ d: throws })).toEqual({ d: '[Error: tj]' })
  })

  it('a toJSON that returns a BigInt or a cycle is cleaned too', () => {
    const cyc = { a: 1 }
    cyc.me = cyc
    expect(toPlainJSON({ x: { toJSON: () => 5n }, y: { toJSON: () => cyc } }))
      .toEqual({ x: '5', y: { a: 1, me: '[Circular]' } })
  })

  it('nesting deeper than 64 becomes "[Too deep]"', () => {
    let v = { leaf: true }
    for (let i = 0; i < 100; i++) v = { child: v }
    const out = toPlainJSON(v)
    let node = out
    let depth = 0
    while (node && typeof node === 'object') {
      node = node.child
      depth += 1
    }
    expect(node).toBe('[Too deep]')
    expect(depth).toBe(64)
  })

  it('20 000 levels of nesting does not overflow the stack', () => {
    let v = { leaf: true }
    for (let i = 0; i < 20_000; i++) v = { child: v }
    expect(() => toPlainJSON(v)).not.toThrow()
  })

  it('a string over 1 MB is cut and says so', () => {
    const out = toPlainJSON('x'.repeat(1_000_010))
    expect(out.startsWith('x'.repeat(1000))).toBe(true)
    expect(out.endsWith('…[truncated 10 chars]')).toBe(true)
  })

  it('a __proto__ key is stored as data and pollutes nothing', () => {
    const input = JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}')
    const out = toPlainJSON(input)
    expect(Object.keys(out)).toEqual(['__proto__', 'ok'])
    expect(JSON.parse(JSON.stringify(out)).ok).toBe(1)
    expect(JSON.stringify(out)).toBe('{"__proto__":{"polluted":true},"ok":1}')
    expect(({}).polluted).toBeUndefined()
    expect(out.polluted).toBeUndefined()
  })

  it('a constructor key is plain data', () => {
    expect(toPlainJSON({ constructor: 'x', ok: 1 })).toEqual({ constructor: 'x', ok: 1 })
  })

  it('Object.create(null) and frozen objects are read normally', () => {
    expect(toPlainJSON(Object.assign(Object.create(null), { a: 1 }))).toEqual({ a: 1 })
    expect(toPlainJSON(Object.freeze({ a: Object.freeze([1]) }))).toEqual({ a: [1] })
  })

  it('the input is never changed', () => {
    const input = { n: 1n, d: new Date(0), list: [Number.NaN] }
    toPlainJSON(input)
    expect(input.n).toBe(1n)
    expect(input.d).toBeInstanceOf(Date)
    expect(Number.isNaN(input.list[0])).toBe(true)
  })
})

describe('toPlainJSON: warnings', () => {
  it('names the path of each change', () => {
    const cyc = { a: 1 }
    cyc.me = cyc
    const { warnings } = cleanWithWarnings({ trial: { rt: Number.NaN, list: [1, 2n], cyc, f: () => 1 } }, 'pageData_x')
    expect(warnings).toEqual([
      { path: 'pageData_x.trial.rt', issue: 'NaN stored as null' },
      { path: 'pageData_x.trial.list[1]', issue: 'BigInt stored as a string' },
      { path: 'pageData_x.trial.cyc.me', issue: 'circular reference' },
      { path: 'pageData_x.trial.f', issue: 'function dropped' },
    ])
  })

  it('says nothing for plain JSON, undefined, Dates, Maps and Sets', () => {
    const { warnings } = cleanWithWarnings({ a: 1, b: undefined, d: new Date(0), m: new Map(), s: new Set([1]), arr: [[1]] })
    expect(warnings).toEqual([])
  })

  it('a warn callback that throws does not stop cleaning', () => {
    const out = toPlainJSON({ n: 1n }, {
      warn: () => {
        throw new Error('bad callback')
      },
    })
    expect(out).toEqual({ n: '1' })
  })

  it('the root is named "(root)" when no path is given', () => {
    expect(cleanWithWarnings(Number.NaN).warnings).toEqual([{ path: '(root)', issue: 'NaN stored as null' }])
  })
})

describe('toPlainJSON: properties', () => {
  const anything = fc.anything({
    withBigInt: true,
    withBoxedValues: true,
    withDate: true,
    withMap: true,
    withSet: true,
    withNullPrototype: true,
    withObjectString: true,
    withSparseArray: true,
    withTypedArray: true,
    withUnicodeString: true,
  })

  it('never throws, and the result is always plain JSON', () => {
    fc.assert(fc.property(anything, (value) => {
      const out = toPlainJSON(value)
      return out === undefined || isPlainJSON(out)
    }), { numRuns: 500 })
  })

  it('plain JSON comes back equal', () => {
    fc.assert(fc.property(fc.jsonValue(), (value) => {
      expect(toPlainJSON(value)).toEqual(value)
    }), { numRuns: 500 })
  })

  it('cleaning twice gives the same as cleaning once', () => {
    fc.assert(fc.property(anything, (value) => {
      const once = toPlainJSON(value)
      expect(toPlainJSON(once)).toEqual(once)
    }), { numRuns: 300 })
  })

  it('matches JSON.stringify wherever JSON.stringify works and keeps all the data', () => {
    // On plain objects/arrays of strings, finite numbers, booleans and null
    // (with undefined sprinkled in), the result is what JSON would give.
    const value = fc.letrec(tie => ({
      node: fc.oneof(
        { depthSize: 'small' },
        fc.string(), fc.double({ noNaN: true, noDefaultInfinity: true }), fc.boolean(), fc.constant(null),
        fc.array(tie('node')), fc.dictionary(fc.string(), fc.option(tie('node'), { nil: undefined })),
      ),
    })).node
    fc.assert(fc.property(value, (v) => {
      expect(JSON.stringify(toPlainJSON(v))).toBe(JSON.stringify(v))
    }), { numRuns: 300 })
  })
})

describe('safeStringify and sendable', () => {
  it('use plain JSON.stringify when it works', () => {
    const v = { a: [1, 'b'] }
    expect(safeStringify(v)).toEqual({ text: '{"a":[1,"b"]}', cleaned: false })
    expect(sendable(v)).toBe(v)
  })

  it('fall back to a cleaned copy when it throws', () => {
    const v = { n: 1n }
    expect(safeStringify(v)).toEqual({ text: '{"n":"1"}', cleaned: true })
    expect(sendable(v)).toEqual({ n: '1' })
  })

  for (const bad of BAD_VALUES.filter(b => !b.slow)) {
    it(`always give something sendable: ${bad.name}`, () => {
      const value = { data: bad.make(), good: 'kept' }
      const { text } = safeStringify(value)
      expect(JSON.parse(text).good).toBe('kept')
      expect(JSON.parse(JSON.stringify(sendable(value))).good).toBe('kept')
    })
  }

  it('undefined and functions give "null", not undefined', () => {
    expect(safeStringify(undefined).text).toBe('null')
    expect(safeStringify(() => 1).text).toBe('null')
    expect(sendable(undefined)).toBe(null)
  })
})

describe('addWarnings', () => {
  it('counts repeats of the same path and issue', () => {
    const data = {}
    addWarnings(data, [{ path: 'a', issue: 'x' }, { path: 'a', issue: 'x' }, { path: 'b', issue: 'x' }])
    addWarnings(data, [{ path: 'a', issue: 'x' }])
    expect(data.smileWarnings.map(({ path, issue, count }) => ({ path, issue, count }))).toEqual([
      { path: 'a', issue: 'x', count: 3 },
      { path: 'b', issue: 'x', count: 1 },
    ])
  })

  it('stops listing new ones at the cap and counts the rest', () => {
    const data = {}
    const many = Array.from({ length: MAX_WARNINGS + 50 }, (_, i) => ({ path: `p${i}`, issue: 'x' }))
    addWarnings(data, many)
    expect(data.smileWarnings).toHaveLength(MAX_WARNINGS + 1)
    expect(data.smileWarnings.at(-1)).toMatchObject({ path: '(more)', count: 50 })
  })

  it('replaces a smileWarnings that is not a list', () => {
    const data = { smileWarnings: 'oops' }
    addWarnings(data, [{ path: 'a', issue: 'x' }])
    expect(data.smileWarnings).toHaveLength(1)
  })

  it('the result is plain JSON', () => {
    const data = {}
    addWarnings(data, [{ path: 'a', issue: 'x' }])
    expect(isPlainJSON(data)).toBe(true)
  })
})
