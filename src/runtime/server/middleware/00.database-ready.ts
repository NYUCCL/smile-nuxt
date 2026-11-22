import { defineEventHandler, getRequestURL, createError } from 'h3'
import { databaseReady } from '../utils/db'

/**
 * API requests wait until the database has every migration (a cold start
 * can receive a request before the migrate plugin finishes). Runs before the
 * other middleware (file order), which read the database too.
 */
export default defineEventHandler(async (event) => {
  if (!getRequestURL(event).pathname.startsWith('/api/')) return
  try {
    await databaseReady()
  }
  catch (err) {
    console.error('[SMILE] Database setup failed:', err)
    // 503: the client's sync loop retries it
    throw createError({ statusCode: 503, statusMessage: 'Database not ready' })
  }
})
