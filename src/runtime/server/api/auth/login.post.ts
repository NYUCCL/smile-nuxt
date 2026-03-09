import { randomUUID } from 'node:crypto'
import { defineEventHandler, readBody, createError, setCookie } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import bcrypt from 'bcryptjs'
import { useDB } from '../../utils/db'
import { devSessions } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const config = useRuntimeConfig()
  const devPassword = config.smile?.devPassword

  if (!devPassword) {
    throw createError({ statusCode: 500, statusMessage: 'Dev password not configured' })
  }

  let isValid: boolean
  if (devPassword.startsWith('$2')) {
    // Hashed password (bcrypt)
    isValid = await bcrypt.compare(body.password, devPassword)
  }
  else {
    // Legacy plaintext — still works but log a warning
    console.warn('[smile] Dev password is stored in plaintext. Run `pnpm smile:hash-password` to generate a hashed version.')
    isValid = body.password === devPassword
  }

  if (!isValid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid password' })
  }

  const db = useDB()
  const token = randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  await db.insert(devSessions).values({
    id: token,
    expiresAt,
  })

  setCookie(event, 'smile_dev_session', token, {
    httpOnly: true,
    secure: false, // allow HTTP for local preview; deployed behind HTTPS proxy
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })

  return { success: true }
})
