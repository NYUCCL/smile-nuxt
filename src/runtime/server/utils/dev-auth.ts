import { createHmac, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getCookie, createError, type H3Event } from 'h3'
import { useDB } from './db'
import { devSessions } from '../database/schema'

// IMPORTANT: read all of this from process.env at *runtime*, not from
// runtimeConfig. The module bakes runtimeConfig at build time
// (src/module.ts), but on serverless hosts (e.g. Vercel) the env vars are only
// reliably present at request time — so a build-time read sees ''. Reading
// process.env here (like utils/db.ts does for TURSO_DATABASE_URL) makes the
// access controls actually work on deployed sites.

export type AccessMode = 'disabled' | 'password' | 'open'
export type Scope = 'dev' | 'presentation'

// --- Passwords (separate per route) ---

/** Password gating /dev (and the dev data API) when dev access is `password`. */
export function getDevPassword(): string {
  return process.env.SMILE_DEV_PASSWORD || ''
}

/** Password gating /presentation when presentation access is `password`. */
export function getPresentationPassword(): string {
  return process.env.SMILE_PRESENTATION_PASSWORD || ''
}

/** Secret used to sign/verify session + participant tokens, read at runtime. */
export function getAuthSecret(): string {
  return process.env.TURSO_AUTH_TOKEN || process.env.SMILE_DEV_PASSWORD || 'smile-local-dev-key'
}

// --- Access mode resolution (default: disabled / not deployed at all) ---
//
// A route's access is `disabled` unless you opt in. Opting in is implicit:
// just setting that route's password puts it in `password` mode. Setting the
// access var explicitly always wins, and `open` (public, no password) is the
// deliberate "extreme case".

function resolveAccess(explicit: string | undefined, hasPassword: boolean, legacyOpen = false): AccessMode {
  const e = (explicit || '').trim().toLowerCase()
  if (e === 'disabled' || e === 'password' || e === 'open') return e
  if (legacyOpen) return 'open'
  if (hasPassword) return 'password'
  return 'disabled'
}

export function getDevAccess(): AccessMode {
  return resolveAccess(process.env.SMILE_DEV_ACCESS, !!getDevPassword())
}

export function getPresentationAccess(): AccessMode {
  return resolveAccess(
    process.env.SMILE_PRESENTATION_ACCESS,
    !!getPresentationPassword(),
    // Legacy alias: SMILE_PUBLIC_PRESENTATION=true == presentation access `open`.
    process.env.SMILE_PUBLIC_PRESENTATION === 'true',
  )
}

export function accessForScope(scope: Scope): AccessMode {
  return scope === 'presentation' ? getPresentationAccess() : getDevAccess()
}

export function passwordForScope(scope: Scope): string {
  return scope === 'presentation' ? getPresentationPassword() : getDevPassword()
}

export function cookieNameForScope(scope: Scope): string {
  return scope === 'presentation' ? 'smile_presentation_session' : 'smile_dev_session'
}

// --- Scoped, signed session tokens (no DB schema change needed) ---
// Token format: `${sessionId}.${scope}.${hmac(secret, sessionId.scope)}`.
// The scope is signed in, so a presentation token can't be replayed as a dev
// token even though both live in the same dev_sessions table.

export function signSessionToken(id: string, scope: Scope): string {
  const sig = createHmac('sha256', getAuthSecret()).update(`${id}.${scope}`).digest('hex')
  return `${id}.${scope}.${sig}`
}

/** Return the session id if the token is well-formed and validly signed for `scope`. */
function verifyTokenScope(token: string, scope: Scope): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [id, tokenScope, sig] = parts as [string, string, string]
  if (tokenScope !== scope) return null
  const expected = createHmac('sha256', getAuthSecret()).update(`${id}.${tokenScope}`).digest('hex')
  if (sig.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  return id
}

/** The raw session id in a token (no signature check) — for revocation only. */
export function sessionIdFromToken(token: string | undefined): string | null {
  if (!token) return null
  const id = token.split('.')[0]
  return id || null
}

/** Whether the request carries a live, validly-signed session for `scope`. */
export async function hasValidSession(event: H3Event, scope: Scope): Promise<boolean> {
  const token = getCookie(event, cookieNameForScope(scope))
  if (!token) return false
  const id = verifyTokenScope(token, scope)
  if (!id) return false
  const db = useDB()
  const session = await db.select().from(devSessions).where(eq(devSessions.id, id)).get()
  return !!session && session.expiresAt >= new Date()
}

/**
 * Guard for dev-only server endpoints (e.g. the data dashboard). Mirrors the
 * /dev route policy: in local dev anything goes; on a deploy the dev access
 * mode decides — `disabled` hides the endpoint (404), `password` requires a
 * valid dev session (403 otherwise), `open` allows through.
 */
export async function requireDevAuth(event: H3Event): Promise<void> {
  if (import.meta.dev) return

  const mode = getDevAccess()
  if (mode === 'open') return
  // `disabled`, or `password` with no password actually set, means no access.
  if (mode === 'disabled' || !getDevPassword()) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
  if (!(await hasValidSession(event, 'dev'))) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
}
