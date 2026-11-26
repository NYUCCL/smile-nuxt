// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { gzipSync } from 'node:zlib'
import { startServer, gzipped, type TestServer } from './handler-helpers'
import { decodeBody, looksGzipped, throwRefusal } from '../../src/runtime/server/utils/read-body'
import { PARTICIPANT_COOKIE } from '../../src/runtime/server/utils/participant-token'

vi.mock('h3', async () => (await import('./handler-helpers')).loadH3())
vi.mock('nitropack/runtime', async () => (await import('./handler-helpers')).nitroRuntime())

/**
 * Reading a request body (server/utils/read-body.ts): plain text and gzip,
 * the limits, and bodies that can't be read.
 */

const bytes = (text: string) => new TextEncoder().encode(text)

describe('looksGzipped', () => {
  it('is true for gzip output and false for JSON text, short input and nothing', () => {
    expect(looksGzipped(gzipped({ a: 1 }))).toBe(true)
    expect(looksGzipped(bytes('{"a":1}'))).toBe(false)
    expect(looksGzipped(new Uint8Array([0x1F]))).toBe(false)
    expect(looksGzipped(new Uint8Array([0x1F, 0x8C]))).toBe(false)
    expect(looksGzipped(new Uint8Array())).toBe(false)
  })
})

describe('decodeBody', () => {
  it('returns plain bytes as text, whatever their size', async () => {
    expect(await decodeBody(bytes('{"a":"é😀"}'))).toEqual({ ok: true, text: '{"a":"é😀"}' })
    expect(await decodeBody(new Uint8Array())).toEqual({ ok: true, text: '' })
  })

  it('unzips gzip to the same text', async () => {
    const text = JSON.stringify({ data: { words: 'é😀 '.repeat(20000) } })
    expect(await decodeBody(gzipped(text))).toEqual({ ok: true, text })
  })

  it('unzips gzip of nothing to an empty text', async () => {
    expect(await decodeBody(new Uint8Array(gzipSync(Buffer.alloc(0))))).toEqual({ ok: true, text: '' })
  })

  it('refuses with 413 as soon as the unzipped text passes the limit', async () => {
    // 50 MB of zeros is about 50 KB gzipped
    const bomb = new Uint8Array(gzipSync(Buffer.alloc(50_000_000)))
    expect(bomb.length).toBeLessThan(100_000)
    const result = await decodeBody(bomb, 1_000_000)
    expect(result).toEqual({ ok: false, status: 413, message: 'The request body is over the 1000000 byte limit when unzipped' })
  })

  it('accepts unzipped text of exactly the limit and refuses one byte more', async () => {
    const zipped = gzipped('x'.repeat(1000))
    expect((await decodeBody(zipped, 1000)).ok).toBe(true)
    expect((await decodeBody(zipped, 999)).ok).toBe(false)
  })

  it('refuses with 400 gzip that is cut short, or is not gzip after its first two bytes', async () => {
    const cut = gzipped('x'.repeat(5000)).slice(0, 20)
    expect(await decodeBody(cut)).toEqual({ ok: false, status: 400, message: 'The request body is gzip that could not be unzipped' })
    const fake = new Uint8Array([0x1F, 0x8B, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(await decodeBody(fake)).toMatchObject({ ok: false, status: 400 })
  })
})

describe('throwRefusal', () => {
  const thrown = (fn: () => never) => {
    try {
      fn()
    }
    catch (err) {
      return err as { statusCode: number, statusMessage: string, data?: unknown }
    }
  }

  it('marks a 400 and a 413 as the route\'s own', () => {
    expect(thrown(() => throwRefusal({ ok: false, status: 400, message: 'bad' }))).toMatchObject({ statusCode: 400, statusMessage: 'bad', data: { smile: 'refused' } })
    expect(thrown(() => throwRefusal({ ok: false, status: 413, message: 'big' }))).toMatchObject({ statusCode: 413, data: { smile: 'refused' } })
  })

  it('does not mark other statuses, and passes on what it is given', () => {
    expect(thrown(() => throwRefusal({ ok: false, status: 409, message: 'old' }, { rev: 4 }))).toMatchObject({ statusCode: 409, data: { rev: 4 } })
    expect(thrown(() => throwRefusal({ ok: false, status: 404, message: 'gone' }))!.data).toBeUndefined()
    expect(thrown(() => throwRefusal({ ok: false, status: 400, message: 'bad' }, { more: 1 }))!.data).toEqual({ smile: 'refused', more: 1 })
  })
})

describe('readBodyText, through the save route', () => {
  let server: TestServer
  beforeEach(async () => {
    vi.stubEnv('SMILE_AUTH_SECRET', '')
    vi.stubEnv('SMILE_DEV_PASSWORD', '')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    server = await startServer()
  })
  afterEach(() => {
    server.close()
    vi.restoreAllMocks()
  })

  it('answers 400 when the body stops arriving part of the way through', async () => {
    const browser = server.browser()
    const { id } = (await browser.post('/api/participants', { data: { seed: 1 } })).body
    const broken = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes('{"rev": 1, "data": {'))
        controller.error(new Error('connection reset'))
      },
    })
    const response = await server.fetch(new Request(`http://localhost/api/participants/${id}`, {
      method: 'PATCH',
      body: broken,
      headers: { cookie: `${PARTICIPANT_COOKIE}=${browser.cookies.get(PARTICIPANT_COOKIE)}` },
      duplex: 'half',
    } as RequestInit))
    expect(response.status).toBe(400)
    expect((await response.json()).statusMessage).toBe('The request body could not be read')
    // The row is as it was
    expect((await browser.get(`/api/participants/${id}`)).body).toEqual({ data: { seed: 1 }, rev: 0, resume: null })
  })

  it('refuses a gzipped body that is small on the wire and over the limit unzipped', async () => {
    const browser = server.browser()
    const { id } = (await browser.post('/api/participants', { data: { seed: 1 } })).body
    const text = `{"rev":1,"data":{"big":"${'x'.repeat(20_000_100)}"}}`
    const zipped = gzipped(text)
    expect(zipped.length).toBeLessThan(100_000)
    const reply = await browser.patch(`/api/participants/${id}`, zipped)
    expect(reply.status).toBe(413)
    expect(reply.body.data).toEqual({ smile: 'refused' })
    expect((await browser.get(`/api/participants/${id}`)).body.rev).toBe(0)
  })

  it('stores a gzipped record that is larger unzipped than the wire limit', async () => {
    const browser = server.browser()
    const { id } = (await browser.post('/api/participants', { data: {} })).body
    const big = 'abcdefghij'.repeat(600_000) // 6 MB as text, a few KB gzipped
    const reply = await browser.patch(`/api/participants/${id}`, gzipped({ rev: 1, data: { big } }))
    expect(reply.body).toEqual({ success: true, rev: 1 })
    expect((await browser.get(`/api/participants/${id}`)).body.data.big.length).toBe(6_000_000)
  })
})
