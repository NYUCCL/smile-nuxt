import { randomUUID } from 'node:crypto'
import { defineEventHandler, readBody, createError, setCookie } from 'h3'
import bcrypt from 'bcryptjs'
import { useDB } from '../../utils/db'
import {
  accessForScope,
  passwordForScope,
  cookieNameForScope,
  signSessionToken,
  type Scope,
} from '../../utils/dev-auth'
import { devSessions } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const scope: Scope = body?.scope === 'presentation' ? 'presentation' : 'dev'
  const mode = accessForScope(scope)

  // Nothing to log into when the route is disabled or already public.
  if (mode === 'disabled') {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
  if (mode === 'open') {
    throw createError({ statusCode: 400, statusMessage: 'No login required' })
  }

  const expected = passwordForScope(scope)
  if (!expected) {
    throw createError({ statusCode: 500, statusMessage: 'Password not configured' })
  }

  let isValid: boolean
  if (expected.startsWith('$2')) {
    // Hashed password (bcrypt)
    isValid = await bcrypt.compare(body.password, expected)
  }
  else {
    // Legacy plaintext — still works but log a warning
    console.warn(`[smile] ${scope} password is stored in plaintext. Run \`pnpm smile:hash-password\` to generate a hashed version.`)
    isValid = body.password === expected
  }

  if (!isValid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid password' })
  }

  const db = useDB()
  const id = randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  await db.insert(devSessions).values({
    id,
    expiresAt,
  })

  setCookie(event, cookieNameForScope(scope), signSessionToken(id, scope), {
    httpOnly: true,
    secure: false, // allow HTTP for local preview; deployed behind HTTPS proxy
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })

  return { success: true, scope }
})
