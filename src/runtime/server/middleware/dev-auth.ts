import { eq } from 'drizzle-orm'
import { useDB } from '../utils/db'
import { devSessions } from '../database/schema'

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname

  // Only gate /dev, /presentation, and /info paths
  const gated = path.startsWith('/dev/') || path === '/dev'
    || path.startsWith('/presentation/') || path === '/presentation'
    || path === '/info'
  if (!gated) {
    return
  }

  // Allow auth API endpoints through (login, session check, logout)
  if (path.startsWith('/api/auth')) {
    return
  }

  // Allow the login page itself
  if (path === '/dev-login') {
    return
  }

  // Check if dev password is configured — if not, allow through (local dev without auth)
  const config = useRuntimeConfig()
  if (!config.smile?.devPassword) {
    return
  }

  // In development mode, skip auth gate (developer is already local)
  if (import.meta.dev) {
    return
  }

  // Check session cookie
  const token = getCookie(event, 'smile_dev_session')
  if (!token) {
    return sendRedirect(event, '/dev-login')
  }

  const db = useDB()
  const session = await db.select().from(devSessions).where(eq(devSessions.id, token)).get()

  if (!session || session.expiresAt < new Date()) {
    return sendRedirect(event, '/dev-login')
  }
})
