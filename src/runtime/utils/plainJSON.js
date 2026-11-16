/**
 * @fileoverview toPlainJSON: turns any value into plain JSON without throwing.
 *
 * Every value an experiment records passes through here (plans/sync_engine.md,
 * "Bad data, layer by layer"), so that nothing a participant does and nothing
 * an experiment records can stop saving. Values JSON can't hold are converted
 * or replaced, and each change that loses or alters data is reported as a
 * warning `{ path, issue }`.
 */
import { isRef, toRaw } from 'vue'

export const MAX_DEPTH = 64
export const MAX_STRING = 1_000_000

/** A path segment for a key: `a.b`, `a[0]` */
function child(path, key) {
  if (typeof key === 'number') return `${path}[${key}]`
  return path ? `${path}.${key}` : key
}

function typeName(value) {
  try {
    const proto = Object.getPrototypeOf(value)
    return proto?.constructor?.name || 'Object'
  }
  catch {
    return 'Object'
  }
}

function isDomNode(value) {
  try {
    return typeof value.nodeType === 'number' && typeof value.nodeName === 'string'
  }
  catch {
    return false
  }
}

function isVueComponent(value) {
  try {
    return typeof value.render === 'function'
      || typeof value.setup === 'function'
      || (typeof value.template === 'string' && 'name' in value)
  }
  catch {
    return false
  }
}

function isPlainPrototype(value) {
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}

/** Replaces lone UTF-16 surrogates with U+FFFD */
function wellFormed(str) {
  if (typeof str.isWellFormed === 'function') {
    return str.isWellFormed() ? str : str.toWellFormed()
  }
  return str.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�')
}

function errorText(err) {
  try {
    return err instanceof Error ? err.message : String(err)
  }
  catch {
    return 'unknown error'
  }
}

/** Sets a key on a plain object, keeping `__proto__` as ordinary data */
function setKey(out, key, value) {
  if (key === '__proto__') {
    Object.defineProperty(out, key, { value, enumerable: true, writable: true, configurable: true })
  }
  else {
    out[key] = value
  }
}

/**
 * Converts any value to plain JSON (objects, arrays, strings, finite numbers,
 * booleans, null). Never throws.
 *
 * | Value | Becomes |
 * |---|---|
 * | undefined, functions, symbols | dropped from objects, `null` in arrays |
 * | NaN, ±Infinity | `null` |
 * | BigInt | its decimal string |
 * | Date | ISO string (invalid: `null`) |
 * | Map / Set | an object / an array |
 * | typed arrays, ArrayBuffer | an array of numbers |
 * | circular reference | `"[Circular]"` |
 * | Vue refs and reactive objects | their plain value |
 * | DOM nodes, Vue components, opaque objects | `"[Unserializable: <type>]"` |
 * | a getter, Proxy or toJSON that throws | `"[Error: <message>]"` |
 * | nesting deeper than 64 | `"[Too deep]"` |
 * | a string over 1 MB | cut, ending `"…[truncated N chars]"` |
 * | lone UTF-16 surrogates | U+FFFD |
 *
 * Keys are kept as given (including `.`, `/`, `[`, `]`, `*` and `__proto__`),
 * and nested arrays are kept.
 *
 * @param {*} value - Anything
 * @param {object} [options]
 * @param {string} [options.path] - Path of `value`, used in warnings
 * @param {(warning: {path: string, issue: string}) => void} [options.warn] - Called for each change that loses or alters data
 * @param {number} [options.maxDepth] - Default 64
 * @param {number} [options.maxString] - Default 1 000 000 characters
 * @returns {*} Plain JSON. `undefined` only if `value` was undefined, a function or a symbol.
 */
export function toPlainJSON(value, options = {}) {
  const {
    path = '',
    warn = () => {},
    maxDepth = MAX_DEPTH,
    maxString = MAX_STRING,
  } = options
  const ancestors = new Set()

  const note = (p, issue) => {
    try {
      warn({ path: p || '(root)', issue })
    }
    catch {
      // a broken warn callback must not stop cleaning
    }
  }

  // Returns undefined for values that are dropped (undefined, functions, symbols)
  function clean(v, p, depth) {
    try {
      switch (typeof v) {
        case 'string':
          if (v.length > maxString) {
            note(p, `string of ${v.length} characters cut to ${maxString}`)
            return wellFormed(v.slice(0, maxString)) + `…[truncated ${v.length - maxString} chars]`
          }
          {
            const fixed = wellFormed(v)
            if (fixed !== v) note(p, 'lone UTF-16 surrogate replaced')
            return fixed
          }
        case 'number':
          if (Number.isFinite(v)) return v
          note(p, `${v} stored as null`)
          return null
        case 'boolean':
          return v
        case 'bigint':
          note(p, 'BigInt stored as a string')
          return v.toString()
        case 'undefined':
          return undefined
        case 'function':
          note(p, 'function dropped')
          return undefined
        case 'symbol':
          note(p, 'symbol dropped')
          return undefined
      }
      if (v === null) return null

      // An object
      if (depth >= maxDepth) {
        note(p, `nested deeper than ${maxDepth}`)
        return '[Too deep]'
      }
      if (isRef(v)) return clean(v.value, p, depth)
      const raw = toRaw(v)
      if (ancestors.has(raw)) {
        note(p, 'circular reference')
        return '[Circular]'
      }
      ancestors.add(raw)
      try {
        return cleanObject(raw, p, depth)
      }
      finally {
        ancestors.delete(raw)
      }
    }
    catch (err) {
      note(p, `threw while reading: ${errorText(err)}`)
      return `[Error: ${errorText(err)}]`
    }
  }

  function cleanArrayLike(items, p, depth) {
    const out = Array.from({ length: items.length })
    for (let i = 0; i < items.length; i++) {
      let item
      try {
        item = items[i]
      }
      catch (err) {
        note(child(p, i), `threw while reading: ${errorText(err)}`)
        out[i] = `[Error: ${errorText(err)}]`
        continue
      }
      const c = clean(item, child(p, i), depth + 1)
      out[i] = c === undefined ? null : c
    }
    return out
  }

  function cleanEntries(entries, p, depth) {
    const out = {}
    for (const [key, val] of entries) {
      const c = clean(val, child(p, key), depth + 1)
      if (c !== undefined) setKey(out, key, c)
    }
    return out
  }

  function cleanObject(v, p, depth) {
    if (Array.isArray(v)) return cleanArrayLike(v, p, depth)

    if (v instanceof Date) {
      const t = v.getTime()
      if (Number.isNaN(t)) {
        note(p, 'invalid Date stored as null')
        return null
      }
      return v.toISOString()
    }
    if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
      return cleanArrayLike(Array.from(v), p, depth)
    }
    if (v instanceof ArrayBuffer) return Array.from(new Uint8Array(v))
    if (v instanceof Map) {
      const entries = []
      for (const [k, val] of v) {
        const name = typeof k === 'string'
          ? k
          : (k !== null && typeof k === 'object') || typeof k === 'function' ? `[${typeName(k)}]` : String(k)
        entries.push([name, val])
      }
      return cleanEntries(entries, p, depth)
    }
    if (v instanceof Set) return cleanArrayLike(Array.from(v), p, depth)
    if (v instanceof RegExp) return v.toString()
    if (v instanceof Error) return cleanEntries([['name', v.name], ['message', v.message]], p, depth)

    if (isDomNode(v)) {
      note(p, `${typeName(v)} not stored`)
      return `[Unserializable: ${typeName(v)}]`
    }
    if (isVueComponent(v)) {
      const name = (() => {
        try {
          return v.name || v.__name || 'anonymous'
        }
        catch {
          return 'anonymous'
        }
      })()
      note(p, `Vue component ${name} not stored`)
      return `[Unserializable: Vue component ${name}]`
    }

    // Honor toJSON (dayjs, Luxon, Decimal, ...) as JSON.stringify would
    if (typeof v.toJSON === 'function') {
      let j
      try {
        j = v.toJSON()
      }
      catch (err) {
        note(p, `toJSON threw: ${errorText(err)}`)
        return `[Error: ${errorText(err)}]`
      }
      if (j !== v) return clean(j, p, depth)
    }

    const keys = Object.keys(v)
    if (keys.length === 0 && !isPlainPrototype(v)) {
      note(p, `${typeName(v)} has no plain fields`)
      return `[Unserializable: ${typeName(v)}]`
    }
    const out = {}
    for (const key of keys) {
      let val
      try {
        val = v[key]
      }
      catch (err) {
        note(child(p, key), `threw while reading: ${errorText(err)}`)
        setKey(out, key, `[Error: ${errorText(err)}]`)
        continue
      }
      const c = clean(val, child(p, key), depth + 1)
      if (c !== undefined) setKey(out, key, c)
    }
    return out
  }

  return clean(value, path, 0)
}

/**
 * JSON text for `value`: plain `JSON.stringify` when it works (fast), else
 * `toPlainJSON` first. Never throws.
 * @param {*} value
 * @param {object} [options] - Passed to toPlainJSON on the fallback path
 * @returns {{ text: string, cleaned: boolean }} `cleaned` when the fallback ran
 */
export function safeStringify(value, options = {}) {
  try {
    const text = JSON.stringify(value)
    if (text !== undefined) return { text, cleaned: false }
  }
  catch {
    // fall through to the cleaned copy
  }
  try {
    return { text: JSON.stringify(toPlainJSON(value, options) ?? null), cleaned: true }
  }
  catch {
    return { text: 'null', cleaned: true }
  }
}

/**
 * `value` itself when it serializes, else a cleaned copy. For request bodies
 * that are serialized later (by $fetch). Never throws.
 * @param {*} value
 * @param {object} [options] - Passed to toPlainJSON on the fallback path
 * @returns {*} `value`, or its cleaned copy
 */
export function sendable(value, options = {}) {
  try {
    if (JSON.stringify(value) !== undefined) return value
  }
  catch {
    // fall through
  }
  return toPlainJSON(value, options) ?? null
}

export const MAX_WARNINGS = 100

/**
 * Adds warnings to a record's `smileWarnings` list: one entry per path and
 * issue, with a count, at most MAX_WARNINGS entries (later new ones are only
 * counted in the last entry).
 * @param {object} data - The record (store.data)
 * @param {Array<{path: string, issue: string}>} warnings
 */
export function addWarnings(data, warnings) {
  if (!warnings?.length || !data || typeof data !== 'object') return
  if (!Array.isArray(data.smileWarnings)) data.smileWarnings = []
  const list = data.smileWarnings
  for (const w of warnings) {
    const found = list.find(e => e && e.path === w.path && e.issue === w.issue)
    if (found) {
      found.count = (Number(found.count) || 0) + 1
    }
    else if (list.length < MAX_WARNINGS) {
      list.push({ path: w.path, issue: w.issue, count: 1, first: Date.now() })
    }
    else {
      const last = list[list.length - 1]
      if (last?.path !== '(more)') list.push({ path: '(more)', issue: 'further warnings not listed', count: 1, first: Date.now() })
      else last.count += 1
    }
  }
}
