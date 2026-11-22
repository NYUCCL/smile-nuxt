import { describe, it, expect, vi, afterEach } from 'vitest'
import { signParticipantToken, checkParticipantToken, TOKEN_MAX_AGE_SECONDS } from '../../src/runtime/server/utils/participant-token'

const SECRET = 'test-secret'
const now = () => Math.floor(Date.now() / 1000)
const DAY = 24 * 60 * 60

describe('the participant token', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is valid for the participant it was signed for, and for no other', () => {
    const token = signParticipantToken('p1', SECRET)
    expect(checkParticipantToken(token, 'p1', SECRET)).toEqual({ valid: true, renew: false })
    expect(checkParticipantToken(token, 'p2', SECRET).valid).toBe(false)
    expect(checkParticipantToken(token, 'p1', 'another-secret').valid).toBe(false)
  })

  it('lasts 30 days, like the browser\'s cookies for the study', () => {
    expect(TOKEN_MAX_AGE_SECONDS).toBe(30 * DAY)
    expect(checkParticipantToken(signParticipantToken('p1', SECRET, now() - 29 * DAY), 'p1', SECRET).valid).toBe(true)
    expect(checkParticipantToken(signParticipantToken('p1', SECRET, now() - 31 * DAY), 'p1', SECRET).valid).toBe(false)
  })

  it('asks to be issued again once it is more than a day old', () => {
    expect(checkParticipantToken(signParticipantToken('p1', SECRET, now() - 60), 'p1', SECRET).renew).toBe(false)
    expect(checkParticipantToken(signParticipantToken('p1', SECRET, now() - 2 * DAY), 'p1', SECRET)).toEqual({ valid: true, renew: true })
  })

  it('allows a few minutes between servers\' clocks, and no more', () => {
    expect(checkParticipantToken(signParticipantToken('p1', SECRET, now() + 120), 'p1', SECRET).valid).toBe(true)
    expect(checkParticipantToken(signParticipantToken('p1', SECRET, now() + 3600), 'p1', SECRET).valid).toBe(false)
  })

  it('refuses anything that is not a token, without throwing', () => {
    for (const bad of ['', 'p1', 'p1.123', 'p1.abc.def', 'p1.123.456.789', `p1.${now()}.zz`, `p1.${now()}.${'a'.repeat(64)}`]) {
      expect(checkParticipantToken(bad, 'p1', SECRET)).toEqual({ valid: false, renew: false })
    }
  })
})
