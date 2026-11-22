/**
 * @fileoverview Random (version 4) UUIDs without a library.
 */

/**
 * Formats 16 bytes as a version-4 UUID string. Sets the version and variant
 * bits on the bytes it is given.
 * @param {Uint8Array|number[]} bytes - 16 random bytes
 * @returns {string} A UUID such as "3b241101-e2bb-4255-8caf-4136c566a962"
 */
export function formatUUIDv4(bytes) {
  bytes[6] = (bytes[6] & 0x0F) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3F) | 0x80 // variant 10xx
  let hex = ''
  for (let i = 0; i < 16; i += 1) hex += (bytes[i] & 0xFF).toString(16).padStart(2, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Returns a random version-4 UUID. Uses crypto.randomUUID() when the page has
 * it (browsers only provide it on https and localhost), otherwise builds one
 * from crypto.getRandomValues(), and from Math.random() only when there is no
 * crypto object at all.
 * @returns {string} A version-4 UUID
 */
export function uuidv4() {
  const crypto = globalThis.crypto
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()
  if (typeof crypto?.getRandomValues === 'function') return formatUUIDv4(crypto.getRandomValues(new Uint8Array(16)))
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  return formatUUIDv4(bytes)
}

export default uuidv4
