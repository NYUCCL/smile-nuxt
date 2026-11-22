import { createHmac, timingSafeEqual } from 'node:crypto'
import { setCookie, getRequestProtocol, type H3Event } from 'h3'

/**
 * The participant's token: `id.issuedAt.signature` in the httpOnly cookie
 * `smile_participant`. It lets a browser read and save its own row and no
 * other.
 *
 * It lasts as long as the browser's own cookies for the study (30 days,
 * COOKIE_MAX_AGE in stores/smilestore.js) and is issued again when it is more
 * than a day old, so it runs out 30 days after the participant's last
 * request, not 30 days after they started.
 */
export const PARTICIPANT_COOKIE = 'smile_participant'
export const TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
const RENEW_AFTER_SECONDS = 24 * 60 * 60
// Function instances' clocks differ a little: a token may look as if it was
// issued this far in the future
const CLOCK_SKEW_SECONDS = 300

const nowSeconds = () => Math.floor(Date.now() / 1000)

export function signParticipantToken(id: string, secret: string, issuedAt = nowSeconds()): string {
  const sig = createHmac('sha256', secret).update(`${id}.${issuedAt}`).digest('hex')
  return `${id}.${issuedAt}.${sig}`
}

/**
 * Checks a token for a participant id.
 * @returns `valid`, and `renew` when the token is old enough to issue again
 */
export function checkParticipantToken(token: string, expectedId: string, secret: string): { valid: boolean, renew: boolean } {
  const no = { valid: false, renew: false }
  const parts = token.split('.')
  if (parts.length !== 3) return no
  const [cookieId, issuedAtStr, cookieSig] = parts as [string, string, string]
  if (cookieId !== expectedId) return no

  const issuedAt = Number(issuedAtStr)
  if (Number.isNaN(issuedAt)) return no
  const age = nowSeconds() - issuedAt
  if (age < -CLOCK_SKEW_SECONDS || age > TOKEN_MAX_AGE_SECONDS) return no

  const expectedSig = createHmac('sha256', secret).update(`${cookieId}.${issuedAtStr}`).digest('hex')
  if (cookieSig.length !== expectedSig.length) return no
  if (!timingSafeEqual(Buffer.from(cookieSig), Buffer.from(expectedSig))) return no
  return { valid: true, renew: age > RENEW_AFTER_SECONDS }
}

/** Sets the participant's cookie to a token issued now. */
export function setParticipantCookie(event: H3Event, id: string, secret: string): void {
  setCookie(event, PARTICIPANT_COOKIE, signParticipantToken(id, secret), {
    httpOnly: true,
    secure: getRequestProtocol(event, { xForwardedProto: true }) === 'https', // HTTPS-only on deploys; plain HTTP still works locally
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_MAX_AGE_SECONDS,
  })
}
