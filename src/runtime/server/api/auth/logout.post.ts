import { eq } from 'drizzle-orm'
import { defineEventHandler, getCookie, deleteCookie } from 'h3'
import { useDB } from '../../utils/db'
import { devSessions } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const token = getCookie(event, 'smile_dev_session')
  if (token) {
    const db = useDB()
    await db.delete(devSessions).where(eq(devSessions.id, token))
  }

  deleteCookie(event, 'smile_dev_session', { path: '/' })

  return { success: true }
})
