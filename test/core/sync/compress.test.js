import { describe, it, expect } from 'vitest'
import { gunzipSync } from 'node:zlib'
import fc from 'fast-check'
import { gzipText, COMPRESS_MIN_LENGTH } from '../../../src/runtime/core/sync/compress.js'
import { decodeBody } from '../../../src/runtime/server/utils/read-body'
import { MAX_TEXT_BYTES } from '../../../src/runtime/server/utils/participant-save'

const record = n => JSON.stringify({
  rev: 7,
  data: { pageData_task: { visit_0: { data: Array.from({ length: n }, (_, i) => ({ trial: i, stimulus: 'table', response: 'f', rt: 500 + i, correct: true })) } } },
})

describe('gzipText (the browser side)', () => {
  it('gzips a record to a fraction of its size, and the server reads the same text back', async () => {
    const text = record(300)
    const bytes = await gzipText(text)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect([bytes[0], bytes[1]]).toEqual([0x1F, 0x8B])
    expect(bytes.length).toBeLessThan(text.length / 4)
    expect(await decodeBody(bytes)).toEqual({ ok: true, text })
  })

  it('keeps every character: emoji, other scripts, control characters, lone surrogates as JSON escapes', async () => {
    const text = JSON.stringify({ a: '😀 naïve 日本語 \u0000  \uD800', pad: 'x'.repeat(COMPRESS_MIN_LENGTH) })
    const bytes = await gzipText(text)
    expect(await decodeBody(bytes)).toEqual({ ok: true, text })
  })

  it('returns null for a short body, and for anything that is not text', async () => {
    expect(await gzipText('{"rev":1}')).toBeNull()
    for (const bad of [undefined, null, 5, {}, [], new Uint8Array(5000)]) expect(await gzipText(bad)).toBeNull()
  })

  it('returns null when the result would not be smaller', async () => {
    // Random characters from a large alphabet don't compress
    let s = ''
    for (let i = 0; i < 3000; i++) s += String.fromCharCode(0x4E00 + Math.floor(Math.random() * 20000))
    const bytes = await gzipText(s)
    if (bytes) expect(bytes.length).toBeLessThan(s.length)
  })

  it('returns null, without throwing, in a browser that cannot compress or whose compression fails', async () => {
    const text = record(50)
    expect(await gzipText(text, {})).toBeNull()
    expect(await gzipText(text, { ...globalThis, CompressionStream: undefined })).toBeNull()
    class Throws {
      constructor() {
        throw new Error('no')
      }
    }
    class NoBytes {
      arrayBuffer() {
        return Promise.reject(new Error('no'))
      }
    }
    expect(await gzipText(text, { ...globalThis, CompressionStream: Throws })).toBeNull()
    // Something that produces bytes that are not gzip
    expect(await gzipText(text, { ...globalThis, CompressionStream: TransformStream })).toBeNull()
    expect(await gzipText(text, { ...globalThis, Response: NoBytes })).toBeNull()
  })

  it('any text comes back the same (fast-check)', async () => {
    await fc.assert(fc.asyncProperty(fc.string({ minLength: 0, maxLength: 5000, unit: 'binary' }), async (s) => {
      const text = JSON.stringify({ s, pad: 'ab'.repeat(COMPRESS_MIN_LENGTH) })
      const bytes = await gzipText(text)
      const sent = bytes ?? new TextEncoder().encode(text)
      expect(await decodeBody(sent)).toEqual({ ok: true, text })
    }), { numRuns: 100 })
  })
})

describe('decodeBody (the server side)', () => {
  const enc = s => new TextEncoder().encode(s)

  it('reads plain text as it is, the empty body included', async () => {
    expect(await decodeBody(enc('{"rev":1,"data":{}}'))).toEqual({ ok: true, text: '{"rev":1,"data":{}}' })
    expect(await decodeBody(new Uint8Array(0))).toEqual({ ok: true, text: '' })
    expect(await decodeBody(enc('é😀'))).toEqual({ ok: true, text: 'é😀' })
  })

  it('reads a view into a larger buffer correctly', async () => {
    const whole = enc('xx{"a":1}yy')
    expect(await decodeBody(whole.subarray(2, 9))).toEqual({ ok: true, text: '{"a":1}' })
  })

  it('refuses (400) bytes that start like gzip and are not, or are cut short', async () => {
    expect(await decodeBody(new Uint8Array([0x1F, 0x8B]))).toMatchObject({ ok: false, status: 400 })
    expect(await decodeBody(new Uint8Array([0x1F, 0x8B, 8, 0, 1, 2, 3, 4, 5, 6, 7, 8]))).toMatchObject({ ok: false, status: 400 })
    const bytes = await gzipText(record(100))
    expect(await decodeBody(bytes.subarray(0, bytes.length - 10))).toMatchObject({ ok: false, status: 400 })
    const damaged = bytes.slice()
    damaged[Math.floor(damaged.length / 2)] ^= 0xFF
    const res = await decodeBody(damaged)
    // Damage is either caught by gzip's checksum or gives other text; never a throw
    expect(res.ok === false ? res.status : 200).toBeOneOf([400, 200])
  })

  it('refuses (413) a small body that unzips to more than the limit', async () => {
    const { gzipSync } = await import('node:zlib')
    const bomb = gzipSync(Buffer.alloc(MAX_TEXT_BYTES + 1, 0x20))
    expect(bomb.length).toBeLessThan(40_000)
    expect(await decodeBody(bomb)).toMatchObject({ ok: false, status: 413 })
    const fits = gzipSync(Buffer.alloc(MAX_TEXT_BYTES, 0x20))
    expect((await decodeBody(fits)).ok).toBe(true)
  })

  it('never throws, whatever the bytes (fast-check)', async () => {
    await fc.assert(fc.asyncProperty(fc.uint8Array({ maxLength: 300 }), fc.boolean(), async (bytes, gz) => {
      const input = gz ? new Uint8Array([0x1F, 0x8B, ...bytes]) : bytes
      const res = await decodeBody(input)
      expect(typeof res.ok).toBe('boolean')
    }), { numRuns: 300 })
  })

  it('stops reading at the limit it is given', async () => {
    const { gzipSync } = await import('node:zlib')
    const body = gzipSync(Buffer.from('x'.repeat(5000)))
    expect(await decodeBody(body, 4999)).toMatchObject({ ok: false, status: 413 })
    expect(await decodeBody(body, 5000)).toEqual({ ok: true, text: 'x'.repeat(5000) })
  })

  it('what the browser sends is what node unzips', async () => {
    const text = record(20)
    expect(gunzipSync(await gzipText(text)).toString('utf8')).toBe(text)
  })
})
