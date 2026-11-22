import { describe, it, expect, afterEach, vi } from 'vitest'
import { uuidv4, formatUUIDv4 } from '../../../src/runtime/utils/uuid.js'

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function manyAreUniqueAndValid(count = 2000) {
  const seen = new Set()
  for (let i = 0; i < count; i += 1) {
    const id = uuidv4()
    expect(id).toMatch(V4)
    seen.add(id)
  }
  expect(seen.size).toBe(count)
}

describe('uuidv4', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a version-4 UUID: 36 characters, version 4, variant 8/9/a/b', () => {
    const id = uuidv4()
    expect(id).toHaveLength(36)
    expect(id).toMatch(V4)
    expect(id[14]).toBe('4')
    expect('89ab').toContain(id[19])
  })

  it('does not repeat', () => {
    manyAreUniqueAndValid()
  })

  it('uses crypto.randomUUID when there is one', () => {
    const randomUUID = vi.fn(() => '11111111-2222-4333-8444-555555555555')
    const getRandomValues = vi.fn()
    vi.stubGlobal('crypto', { randomUUID, getRandomValues })
    expect(uuidv4()).toBe('11111111-2222-4333-8444-555555555555')
    expect(randomUUID).toHaveBeenCalledTimes(1)
    expect(getRandomValues).not.toHaveBeenCalled()
  })

  it('uses crypto.getRandomValues when there is no randomUUID (a plain http page)', () => {
    const real = globalThis.crypto
    const getRandomValues = vi.fn(array => real.getRandomValues(array))
    vi.stubGlobal('crypto', { getRandomValues })
    const random = vi.spyOn(Math, 'random')
    manyAreUniqueAndValid(500)
    expect(getRandomValues).toHaveBeenCalledTimes(500)
    expect(getRandomValues.mock.calls[0][0]).toBeInstanceOf(Uint8Array)
    expect(getRandomValues.mock.calls[0][0]).toHaveLength(16)
    expect(random).not.toHaveBeenCalled()
    random.mockRestore()
  })

  it('uses Math.random when there is no crypto object', () => {
    vi.stubGlobal('crypto', undefined)
    const random = vi.spyOn(Math, 'random')
    manyAreUniqueAndValid(500)
    expect(random).toHaveBeenCalledTimes(500 * 16)
    random.mockRestore()
  })

  it('formats the bytes in order and sets the version and variant bits', () => {
    expect(formatUUIDv4(new Uint8Array(16))).toBe('00000000-0000-4000-8000-000000000000')
    expect(formatUUIDv4(new Uint8Array(16).fill(0xFF))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
    expect(formatUUIDv4(Uint8Array.from({ length: 16 }, (_, i) => i))).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f')
  })
})
