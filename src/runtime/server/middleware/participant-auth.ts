import { createHmac, timingSafeEqual } from 'node:crypto'
import { defineEventHandler, getCookie, deleteCookie, getRequestURL, createError } from 'h3'
import { getAuthSecret, hasValidSession } from '../utils/dev-auth'

const TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60 // 7 days

function verifyParticipantToken(token: string, expectedId: string, secret: string): boolean {
  // Token format: uuid.issuedAt.signature
  const parts = token.split('.')
  if (parts.length !== 3) return false

  const cookieId = parts[0]!
  const issuedAtStr = parts[1]!
  const cookieSig = parts[2]!
  if (cookieId !== expectedId) return false

  // Check expiry
  const issuedAt = Number(issuedAtStr)
  if (Number.isNaN(issuedAt)) return false
  const age = Math.floor(Date.now() / 1000) - issuedAt
  if (age < 0 || age > TOKEN_MAX_AGE_SECONDS) return false

  // Verify HMAC signature
  const expectedSig = createHmac('sha256', secret).update(`${cookieId}.${issuedAtStr}`).digest('hex')
  if (cookieSig.length !== expectedSig.length) return false

  return timingSafeEqual(Buffer.from(cookieSig), Buffer.from(expectedSig))
}

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname

  // Only gate /api/participants/<id> and /api/participants/<id>/**
  // POST /api/participants (creation) has no ID segment, so it passes through
  const match = path.match(/^\/api\/participants\/([^/]+)/)
  if (!match) {
    return
  }

  const pathId = match[1]!
  const secret = getAuthSecret()

  // Check signed participant cookie (fast path, no DB query)
  const participantToken = getCookie(event, 'smile_participant')
  if (participantToken && verifyParticipantToken(participantToken, pathId, secret)) {
    return
  }

  // A valid dev session may access any participant (dev tools / dashboard).
  if (await hasValidSession(event, 'dev')) {
    return
  }

  // Clear the stale/invalid participant cookie
  deleteCookie(event, 'smile_participant', { path: '/' })

  throw createError({
    statusCode: 403,
    statusMessage: 'Forbidden: participant token mismatch',
  })
})
