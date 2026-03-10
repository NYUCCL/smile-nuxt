import { eq } from 'drizzle-orm'
import { getCookie, createError, type H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { useDB } from './db'
import { devSessions } from '../database/schema'

/**
 * Verify that the request has a valid dev session.
 * Throws 403 if not authorized.
 * In local dev mode (import.meta.dev), auth is skipped.
 */
export async function requireDevAuth(event: H3Event): Promise<void> {
  // Local development — no auth needed
  if (import.meta.dev) {
    return
  }

  const config = useRuntimeConfig()

  // No dev password configured — allow through
  if (!config.smile?.devPassword) {
    return
  }

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
