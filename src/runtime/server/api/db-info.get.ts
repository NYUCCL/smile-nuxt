import { eq } from 'drizzle-orm'
import { defineEventHandler, getCookie, createError } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { useDB } from '../utils/db'
import { devSessions } from '../database/schema'

export default defineEventHandler(async (event) => {
  // Allow in dev mode (local development)
  if (!import.meta.dev) {
    const config = useRuntimeConfig()
    // If dev password is configured, require valid dev session
    if (config.smile?.devPassword) {
      const token = getCookie(event, 'smile_dev_session')
      if (!token) {
        throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
      }
      const db = useDB()
      const session = await db.select().from(devSessions).where(eq(devSessions.id, token)).get()
      if (!session || session.expiresAt < new Date()) {
        throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
      }
    }
  }
  const url = process.env.TURSO_DATABASE_URL || 'file:.data/experiment.db'
  const isTurso = url.startsWith('libsql://') || url.startsWith('https://')
  const isLocal = url.startsWith('file:')

  return {
    type: isTurso ? 'Turso' : isLocal ? 'Local SQLite' : 'LibSQL',
    url: isTurso ? url.replace(/\/\/.*@/, '//***@') : url,
  }
})
