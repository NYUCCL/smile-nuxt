import { defineEventHandler, getRequestURL, sendRedirect, createError } from 'h3'
import { accessForScope, passwordForScope, hasValidSession, type Scope } from '../utils/dev-auth'

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname

  // Only gate /dev and /presentation paths. (/dev-login and /api/auth/* don't
  // match these prefixes, so they pass through and the login flow works.)
  const isDevPath = path.startsWith('/dev/') || path === '/dev'
  const isPresentationPath = path.startsWith('/presentation/') || path === '/presentation'
  if (!isDevPath && !isPresentationPath) {
    return
  }

  // Local development: the tools are always available, no password.
  if (import.meta.dev) {
    return
  }

  const scope: Scope = isDevPath ? 'dev' : 'presentation'
  const mode = accessForScope(scope)

  // Public — the deliberate "extreme case".
  if (mode === 'open') {
    return
  }

  // Not deployed at all (the default), or `password` mode with no password
  // actually configured: behave as if the route doesn't exist.
  if (mode === 'disabled' || !passwordForScope(scope)) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  // Password mode — require a valid session for this scope.
  if (await hasValidSession(event, scope)) {
    return
  }

  const loginUrl = `/dev-login?redirect=${encodeURIComponent(path)}&scope=${scope}`
  return sendRedirect(event, loginUrl)
})
