import { readRawBody, getRequestHeader, createError, type H3Event } from 'h3'
import { MAX_BODY_BYTES, MAX_TEXT_BYTES, type Refusal } from './participant-save'
import { REFUSED } from '../../shared/save-answers.js'

const GZIP_1 = 0x1F
const GZIP_2 = 0x8B

/** Whether the bytes start with gzip's two marker bytes. JSON text never does. */
export function looksGzipped(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === GZIP_1 && bytes[1] === GZIP_2
}

/**
 * The bytes of a request body as text. A gzip body is unzipped: the browser
 * gzips the saves it sends (core/sync/compress.js). It is recognised by its
 * first two bytes, so no header is needed to tell the two apart.
 *
 * Unzipping uses the web's DecompressionStream, which Node and the edge
 * runtimes both have and which doesn't hold the thread while it works. The
 * unzipped text has the same size limit as a plain body: reading stops as
 * soon as it is passed, so a small body can't unpack into a huge one.
 * Never throws.
 */
export async function decodeBody(bytes: Uint8Array, limit = MAX_TEXT_BYTES): Promise<{ ok: true, text: string } | Refusal> {
  if (!looksGzipped(bytes)) return { ok: true, text: new TextDecoder().decode(bytes) }
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const unzip = new DecompressionStream('gzip')
    const writer = unzip.writable.getWriter()
    // Errors arrive through the reader; these are here so none goes unhandled
    writer.write(bytes as Uint8Array<ArrayBuffer>).catch(() => {})
    writer.close().catch(() => {})
    reader = unzip.readable.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > limit) {
        reader.cancel().catch(() => {})
        return { ok: false, status: 413, message: `The request body is over the ${limit} byte limit when unzipped` }
      }
      chunks.push(value)
    }
    const all = new Uint8Array(total)
    let at = 0
    for (const chunk of chunks) {
      all.set(chunk, at)
      at += chunk.length
    }
    return { ok: true, text: new TextDecoder().decode(all) }
  }
  catch {
    reader?.cancel().catch(() => {})
    return { ok: false, status: 400, message: 'The request body is gzip that could not be unzipped' }
  }
}

/**
 * The request body as text, or undefined when there is none. Refuses (413) a
 * body whose declared length is over the limit before reading it.
 */
export async function readBodyText(event: H3Event): Promise<string | undefined> {
  const declared = Number(getRequestHeader(event, 'content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: `The request body is over the ${MAX_BODY_BYTES} byte limit`, data: { smile: REFUSED } })
  }
  let bytes: Uint8Array | undefined
  try {
    bytes = await readRawBody(event, false)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'The request body could not be read' })
  }
  if (bytes === undefined) return undefined
  // What came over the wire, gzipped or not (the host's own limit, here too
  // so a local server refuses what a deployed one would)
  if (bytes.length > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: `The request body is over the ${MAX_BODY_BYTES} byte limit`, data: { smile: REFUSED } })
  }
  const decoded = await decodeBody(bytes)
  if (!decoded.ok) throwRefusal(decoded)
  return decoded.text
}

/** Throws the h3 error for a refused body */
export function throwRefusal(refusal: Refusal, extra?: Record<string, unknown>): never {
  // A 400 or 413 from here carries the route's mark, so the browser can tell
  // it from one made by something on the way (shared/save-answers.js)
  const own = refusal.status === 400 || refusal.status === 413 ? { smile: REFUSED } : undefined
  const data = own || extra ? { ...own, ...extra } : undefined
  throw createError({ statusCode: refusal.status, statusMessage: refusal.message, data })
}
