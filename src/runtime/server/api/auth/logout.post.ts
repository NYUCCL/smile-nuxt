import { eq } from 'drizzle-orm'
import { defineEventHandler, getCookie, deleteCookie } from 'h3'
import { useDB } from '../../utils/db'
import { cookieNameForScope, sessionIdFromToken, type Scope } from '../../utils/dev-auth'
import { devSessions } from '../../database/schema'

// Log out of both scopes — clears whichever session cookies are present.
export default defineEventHandler(async (event) => {
  const db = useDB()
  for (const scope of ['dev', 'presentation'] as Scope[]) {
    const name = cookieNameForScope(scope)
    const id = sessionIdFromToken(getCookie(event, name))
    if (id) {
      await db.delete(devSessions).where(eq(devSessions.id, id))
    }
    deleteCookie(event, name, { path: '/' })
  }

  return { success: true }
})
