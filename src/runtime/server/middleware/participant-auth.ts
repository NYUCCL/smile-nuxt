import { defineEventHandler, getCookie, deleteCookie, getRequestURL, createError } from 'h3'
import { getAuthSecret, hasValidSession } from '../utils/dev-auth'
import { PARTICIPANT_COOKIE, checkParticipantToken, setParticipantCookie } from '../utils/participant-token'
import { BAD_TOKEN } from '../../shared/save-answers.js'

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
  const participantToken = getCookie(event, PARTICIPANT_COOKIE)
  if (participantToken) {
    const check = checkParticipantToken(participantToken, pathId, secret)
    if (check.valid) {
      // Issued again once a day, so it lasts 30 days from the last request
      if (check.renew) setParticipantCookie(event, pathId, secret)
      return
    }
  }

  // A valid dev session may access any participant (dev tools / dashboard).
  if (await hasValidSession(event, 'dev')) {
    return
  }

  // Clear the stale/invalid participant cookie
  deleteCookie(event, PARTICIPANT_COOKIE, { path: '/' })

  // `data.smile` tells the browser this 403 is ours (shared/save-answers.js)
  throw createError({
    statusCode: 403,
    statusMessage: 'Forbidden: participant token mismatch',
    data: { smile: BAD_TOKEN },
  })
})
