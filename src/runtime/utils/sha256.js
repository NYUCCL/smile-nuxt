/**
 * @fileoverview Synchronous SHA-256 (FIPS 180-4) of a string. The Web Crypto
 * digest is asynchronous and missing on plain http pages; this one is neither.
 */

// The first 32 bits of the fractional parts of the cube roots of the first 64 primes.
const K = new Uint32Array([
  0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
  0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
  0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
  0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
  0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
  0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
  0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
  0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2,
])

/**
 * Encodes a string as UTF-8 bytes. A surrogate without its pair is encoded
 * as U+FFFD, as TextEncoder does.
 * @param {string} text - The string
 * @returns {Uint8Array} Its UTF-8 bytes
 */
export function utf8Bytes(text) {
  const bytes = []
  for (let i = 0; i < text.length; i += 1) {
    let code = text.codePointAt(i)
    if (code > 0xFFFF) i += 1
    else if (code >= 0xD800 && code <= 0xDFFF) code = 0xFFFD
    if (code < 0x80) {
      bytes.push(code)
    }
    else if (code < 0x800) {
      bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F))
    }
    else if (code < 0x10000) {
      bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F))
    }
    else {
      bytes.push(0xF0 | (code >> 18), 0x80 | ((code >> 12) & 0x3F), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F))
    }
  }
  return Uint8Array.from(bytes)
}

/**
 * Computes the SHA-256 digest of a string's UTF-8 bytes.
 * @param {string} text - The string to hash
 * @returns {Uint8Array} The 32 digest bytes
 */
export function sha256Bytes(text) {
  const message = utf8Bytes(String(text))
  const bitLength = message.length * 8

  // Padding: a 1 bit, zeros, then the message length in bits as 64 bits,
  // big-endian, so that the total length is a multiple of 64 bytes.
  const paddedLength = (((message.length + 8) >> 6) + 1) << 6
  const padded = new Uint8Array(paddedLength)
  padded.set(message)
  padded[message.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000))
  view.setUint32(paddedLength - 4, bitLength >>> 0)

  const h = new Uint32Array([
    0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19,
  ])
  const w = new Uint32Array(64)

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let t = 0; t < 16; t += 1) w[t] = view.getUint32(offset + t * 4)
    for (let t = 16; t < 64; t += 1) {
      const x = w[t - 15]
      const y = w[t - 2]
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0
    }

    let a = h[0]
    let b = h[1]
    let c = h[2]
    let d = h[3]
    let e = h[4]
    let f = h[5]
    let g = h[6]
    let hh = h[7]

    for (let t = 0; t < 64; t += 1) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + K[t] + w[t]) | 0
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) | 0
      hh = g
      g = f
      f = e
      e = (d + t1) | 0
      d = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }

    h[0] += a
    h[1] += b
    h[2] += c
    h[3] += d
    h[4] += e
    h[5] += f
    h[6] += g
    h[7] += hh
  }

  const digest = new Uint8Array(32)
  const out = new DataView(digest.buffer)
  for (let i = 0; i < 8; i += 1) out.setUint32(i * 4, h[i])
  return digest
}

/**
 * SHA-256 of a string as 64 lowercase hex characters.
 * @param {string} text - The string to hash
 * @returns {string} The digest in hex
 */
export function sha256Hex(text) {
  let hex = ''
  for (const byte of sha256Bytes(text)) hex += byte.toString(16).padStart(2, '0')
  return hex
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/**
 * SHA-256 of a string in standard base64 (the +/ alphabet, = padding): 44
 * characters.
 * @param {string} text - The string to hash
 * @returns {string} The digest in base64
 */
export function sha256Base64(text) {
  const bytes = sha256Bytes(text)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    const triple = (bytes[i] << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0)
    out += BASE64_CHARS[(triple >> 18) & 63] + BASE64_CHARS[(triple >> 12) & 63]
    out += b1 === undefined ? '=' : BASE64_CHARS[(triple >> 6) & 63]
    out += b2 === undefined ? '=' : BASE64_CHARS[triple & 63]
  }
  return out
}

export default sha256Hex
