/**
 * Gzip for the bodies the sync loop sends. Every send carries the whole
 * record, and a record is repetitive JSON (the same keys in every trial), so
 * it shrinks several times over: less upload on a slow or metered connection,
 * and a send that finishes sooner.
 *
 * The server recognises a gzip body by its first two bytes
 * (server/utils/read-body.ts), so nothing depends on a header surviving the
 * way there.
 */

/** Bodies shorter than this are sent as they are: nothing to gain. */
export const COMPRESS_MIN_LENGTH = 1024

/**
 * The text, gzipped. Never throws.
 * @param {string} text - The body
 * @param {object} [env] - For tests: the stream constructors to use
 * @returns {Promise<Uint8Array|null>} Null when the browser can't (no
 *   CompressionStream), when it fails, or when the result isn't smaller: the
 *   caller then sends the text
 */
export async function gzipText(text, env = globalThis) {
  try {
    if (typeof text !== 'string' || text.length < COMPRESS_MIN_LENGTH) return null
    const { CompressionStream, Blob, Response } = env
    if (typeof CompressionStream !== 'function' || typeof Blob !== 'function' || typeof Response !== 'function') return null
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
    // A gzip stream starts 1f 8b; anything else is not what the server expects
    if (bytes.length < 2 || bytes[0] !== 0x1F || bytes[1] !== 0x8B) return null
    if (bytes.length >= text.length) return null
    return bytes
  }
  catch {
    return null
  }
}
