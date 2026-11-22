import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { reactive } from 'vue'
import cryptoSha256 from 'crypto-js/sha256'
import cryptoBase64 from 'crypto-js/enc-base64'
import cryptoHex from 'crypto-js/enc-hex'
import libraryStringify from 'json-stable-stringify'
import { stableStringify } from '../../../src/runtime/utils/stableStringify.js'
import { sha256Hex, sha256Base64 } from '../../../src/runtime/utils/sha256.js'
import { SmileAPI } from '../../../src/runtime/composables/useAPI.js'

/**
 * Completion codes must not change: researchers compare the code a
 * participant reports with the code computed from the saved data. The code
 * used to be computed with crypto-js and json-stable-stringify. These tests
 * compare the module's own stableStringify and sha256 with those two
 * libraries, which stay installed as devDependencies for this file.
 */

/** computeCompletionCode as it was written with the two libraries. */
function libraryCompletionCode(store) {
  const pageDataFields = {}
  for (const key in store.data) {
    if (key.startsWith('pageData_')) pageDataFields[key] = store.data[key]
  }
  const dataToHash = Object.keys(pageDataFields).length > 0
    ? libraryStringify(pageDataFields)
    : libraryStringify(store.data.studyData)
  const hashDigest = cryptoBase64.stringify(cryptoSha256(dataToHash))
  let endCode = ''
  if (store.cookieState.withdrawn) endCode = 'xx'
  else if (store.cookieState.done) endCode = 'oo'
  return hashDigest.slice(0, 20) + endCode
}

const currentCompletionCode = store => SmileAPI.prototype.computeCompletionCode.call({ store })

const FIXTURES = [
  ['null', null],
  ['true', true],
  ['false', false],
  ['zero', 0],
  ['negative zero', -0],
  ['an integer', 42],
  ['a negative float', -3.25],
  ['a small float', 1e-7],
  ['a large float', 1.7976931348623157e308],
  ['a float past 2^53', 2 ** 53 + 2],
  ['0.1 + 0.2', 0.1 + 0.2],
  ['NaN', Number.NaN],
  ['Infinity', Infinity],
  ['an empty string', ''],
  ['a string', 'hello'],
  ['quotes and backslashes', 'a "quoted" \\ back/slash'],
  ['control characters', 'tab\t newline\n return\r bell\u0007 null\u0000 del\u007F'],
  ['line separators', 'a b c'],
  ['accents and CJK', 'café naïve 日本語 Ωmega'],
  ['emoji', 'thumbs \u{1F44D}\u{1F3FD} family \u{1F468}‍\u{1F469}‍\u{1F467}'],
  ['a lone high surrogate', 'a\uD83Db'],
  ['a lone low surrogate', 'a\uDC00b'],
  ['an empty array', []],
  ['an empty object', {}],
  ['an array of mixed values', [1, 'two', null, true, [3, [4]], { five: 5 }]],
  ['keys out of order', { b: 1, a: 2, c: { z: 1, y: 2, x: [{ q: 1, p: 2 }] } }],
  ['number-like keys', { '10': 'a', '9': 'b', '1': 'c', '01': 'd', '-1': 'e', 'a': 'f' }],
  ['keys that differ by case and by unicode', { 'B': 1, 'a': 2, 'A': 3, 'é': 4, 'e': 5, '\u{1F600}': 6, '￿': 7, '': 8 }],
  ['keys that need escaping', { 'a"b': 1, 'a\\b': 2, 'a\nb': 3, '__proto__x': 4 }],
  ['undefined in an object', { a: undefined, b: 1 }],
  ['a function in an object', { f() { return 1 }, b: 1 }],
  ['a symbol in an object', { s: Symbol('s'), b: 1 }],
  ['only undefined in an object', { a: undefined }],
  ['undefined, a function and a symbol in an array', [undefined, () => 1, Symbol('s'), 1]],
  ['a sparse array', [1, , 3]], // eslint-disable-line no-sparse-arrays
  ['NaN and Infinity inside', { a: Number.NaN, b: [Infinity, -Infinity] }],
  ['a Date', { d: new Date('2026-01-02T03:04:05.678Z') }],
  ['an object with toJSON', { t: { toJSON: () => ({ z: 1, a: [undefined] }) } }],
  ['toJSON that returns undefined', { t: { toJSON: () => undefined }, list: [{ toJSON: () => undefined }] }],
  ['a top-level function', () => 1],
  ['a top-level undefined', undefined],
  ['the same object twice', (() => {
    const shared = { k: [1, 2] }
    return { a: shared, b: shared, c: [shared, shared] }
  })()],
  ['a reactive object', reactive({ b: [1, { d: 1, c: 2 }], a: 'x' })],
  ['an object without a prototype', Object.assign(Object.create(null), { b: 1, a: 2 })],
  ['a Map and a Set (no enumerable keys)', { m: new Map([['a', 1]]), s: new Set([1]) }],
  ['boxed primitives', { n: new Number(3), s: new String('ab'), b: new Boolean(false) }],
  ['page data', {
    pageData_consent: { visit_0: { timestamps: [1700000000000], data: [{ consented: true }] } },
    pageData_task: {
      visit_0: {
        timestamps: [1700000001000, 1700000002500],
        data: [
          { trial: 1, rt: 512.25, response: 'left', correct: true, stimulus: 'images/dog.png' },
          { trial: 2, rt: null, response: undefined, correct: false, comment: 'I wasn\'t sure \u{1F937}' },
        ],
      },
      visit_1: { timestamps: [], data: [] },
    },
  }],
]

// JSON values plus the values JSON.stringify drops or changes.
const anyValue = fc.letrec(tie => ({
  leaf: fc.oneof(
    fc.constant(null),
    fc.constant(undefined),
    fc.boolean(),
    fc.integer(),
    fc.double(),
    fc.string(),
    fc.string({ unit: 'binary' }),
    fc.string({ unit: 'grapheme' }),
    fc.date({ noInvalidDate: true }),
    fc.constant(() => 1),
  ),
  value: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    tie('leaf'),
    fc.array(tie('value'), { maxLength: 6 }),
    fc.sparseArray(tie('value'), { maxLength: 6 }),
    fc.dictionary(fc.oneof(fc.string(), fc.string({ unit: 'binary' })), tie('value'), { maxKeys: 6 }),
  ),
})).value

describe('stableStringify gives the same text as json-stable-stringify', () => {
  for (const [name, value] of FIXTURES) {
    it(name, () => {
      expect(stableStringify(value)).toBe(libraryStringify(value))
    })
  }

  it('any JSON value', () => {
    fc.assert(fc.property(fc.jsonValue(), (value) => {
      expect(stableStringify(value)).toBe(libraryStringify(value))
    }), { numRuns: 2000 })
  })

  it('any JSON value with deep nesting', () => {
    fc.assert(fc.property(fc.jsonValue({ depthSize: 'large', maxDepth: 12 }), (value) => {
      expect(stableStringify(value)).toBe(libraryStringify(value))
    }), { numRuns: 500 })
  })

  it('values with undefined, functions, dates, NaN, sparse arrays and any strings', () => {
    fc.assert(fc.property(anyValue, (value) => {
      expect(stableStringify(value)).toBe(libraryStringify(value))
    }), { numRuns: 2000 })
  })

  it('does not depend on the order keys were added in', () => {
    fc.assert(fc.property(fc.dictionary(fc.string(), fc.jsonValue(), { maxKeys: 8 }), (object) => {
      const reversed = Object.fromEntries(Object.entries(object).reverse())
      expect(stableStringify(reversed)).toBe(stableStringify(object))
    }))
  })

  it('throws a TypeError for an object that contains itself, as the library does', () => {
    const loop = { a: { b: {} } }
    loop.a.b.loop = loop
    expect(() => libraryStringify(loop)).toThrow(TypeError)
    expect(() => stableStringify(loop)).toThrow(TypeError)
  })

  it('throws for a BigInt, as the library does', () => {
    expect(() => libraryStringify({ n: 1n })).toThrow(TypeError)
    expect(() => stableStringify({ n: 1n })).toThrow(TypeError)
  })
})

describe('sha256 gives the same digest as crypto-js and node:crypto', () => {
  const known = [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ]
  for (const [text, hex] of known) {
    it(`the published digest of ${JSON.stringify(text.slice(0, 12))}`, () => {
      expect(sha256Hex(text)).toBe(hex)
    })
  }

  it('one million "a" characters', () => {
    expect(sha256Hex('a'.repeat(1000000))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0')
  })

  it('every length from 0 to 300 (all padding cases)', () => {
    for (let n = 0; n <= 300; n += 1) {
      const text = 'x'.repeat(n)
      expect(sha256Hex(text)).toBe(createHash('sha256').update(text).digest('hex'))
      expect(sha256Hex(text)).toBe(cryptoSha256(text).toString(cryptoHex))
      expect(sha256Base64(text)).toBe(cryptoBase64.stringify(cryptoSha256(text)))
    }
  })

  it('any well-formed string', () => {
    fc.assert(fc.property(fc.string({ unit: 'grapheme', maxLength: 400 }), (text) => {
      expect(sha256Hex(text)).toBe(cryptoSha256(text).toString(cryptoHex))
      expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'))
      expect(sha256Base64(text)).toBe(cryptoBase64.stringify(cryptoSha256(text)))
      expect(sha256Base64(text)).toBe(createHash('sha256').update(text, 'utf8').digest('base64'))
    }), { numRuns: 1000 })
  })

  it('the text of any stringified value, whatever strings it holds', () => {
    fc.assert(fc.property(anyValue, (value) => {
      const text = libraryStringify(value)
      expect(sha256Base64(text ?? '')).toBe(cryptoBase64.stringify(cryptoSha256(text)))
    }), { numRuns: 1000 })
  })
})

describe('computeCompletionCode gives the same code as it did with the libraries', () => {
  const states = [
    { done: false, withdrawn: false },
    { done: true, withdrawn: false },
    { done: false, withdrawn: true },
    { done: true, withdrawn: true },
  ]

  it('the fixtures as page data and as studyData', () => {
    for (const cookieState of states) {
      for (const [, value] of FIXTURES) {
        const withPages = { data: { pageData_a: value, pageData_b: [value], other: 1, studyData: [] }, cookieState }
        expect(currentCompletionCode(withPages)).toBe(libraryCompletionCode(withPages))
        const withStudyData = { data: { studyData: value, other: 1 }, cookieState }
        expect(currentCompletionCode(withStudyData)).toBe(libraryCompletionCode(withStudyData))
      }
    }
  })

  it('no page data and no studyData', () => {
    for (const cookieState of states) {
      const store = { data: {}, cookieState }
      expect(currentCompletionCode(store)).toBe(libraryCompletionCode(store))
    }
    // The base64 SHA-256 of the empty string, with the "completed" ending
    expect(currentCompletionCode({ data: {}, cookieState: states[1] })).toBe('47DEQpj8HBSa+/TImW+5oo')
  })

  it('a fixed code for fixed data', () => {
    const store = {
      data: { pageData_task: { visit_0: { timestamps: [1000], data: [{ response: 'test', rt: 500 }] } } },
      cookieState: { done: true, withdrawn: false },
    }
    expect(currentCompletionCode(store)).toBe(libraryCompletionCode(store))
    expect(currentCompletionCode(store)).toMatch(/^[A-Za-z0-9+/]{20}oo$/)
  })

  it('a reactive store', () => {
    const store = reactive({
      data: { pageData_b: { z: [1, { y: 2, x: 'é' }] }, pageData_a: { k: null } },
      cookieState: { done: true, withdrawn: false },
    })
    expect(currentCompletionCode(store)).toBe(libraryCompletionCode(store))
  })

  it('generated page data', () => {
    const pages = fc.dictionary(
      fc.string({ maxLength: 8 }).map(name => `pageData_${name}`),
      anyValue,
      { maxKeys: 4 },
    )
    fc.assert(fc.property(pages, anyValue, fc.constantFrom(...states), (pageData, studyData, cookieState) => {
      const store = { data: { ...pageData, studyData, recruitmentService: 'web' }, cookieState }
      expect(currentCompletionCode(store)).toBe(libraryCompletionCode(store))
    }), { numRuns: 1500 })
  })
})
