import { randomUUID } from 'node:crypto'
import { useDB } from '../../utils/db'
import { devSessions } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const config = useRuntimeConfig()
  const devPassword = config.smile?.devPassword

  if (!devPassword) {
    throw createError({ statusCode: 500, statusMessage: 'Dev password not configured' })
  }

  if (body.password !== devPassword) {
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
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })

  return { success: true }
})
