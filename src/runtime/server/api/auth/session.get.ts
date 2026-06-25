import { defineEventHandler, getQuery } from 'h3'
import { hasValidSession, type Scope } from '../../utils/dev-auth'

export default defineEventHandler(async (event) => {
  const scope: Scope = getQuery(event).scope === 'presentation' ? 'presentation' : 'dev'
  return { authenticated: await hasValidSession(event, scope), scope }
})
