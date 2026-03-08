import { eq } from 'drizzle-orm'
import { defineEventHandler, getCookie } from 'h3'
import { useDB } from '../../utils/db'
import { devSessions } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const token = getCookie(event, 'smile_dev_session')
  if (!token) {
    return { authenticated: false }
  }

  const db = useDB()
  const session = await db.select().from(devSessions).where(eq(devSessions.id, token)).get()

  if (!session || session.expiresAt < new Date()) {
    return { authenticated: false }
  }

  return { authenticated: true }
})
