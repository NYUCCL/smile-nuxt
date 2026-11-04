/**
 * GET /_smile/dev-config: the project's build and deploy settings, for the
 * dev tools' build settings page.
 *
 * Dev server only: module.ts registers it with addDevServerHandler() when
 * nuxt.options.dev is true, so it runs in the Nuxt process and is never part
 * of a build (it isn't under runtime/server/, which every build scans).
 * Read-only, takes no parameters, reads a fixed list of env files in the
 * project's env directory, and never returns a secret's value.
 */
import { readBuildConfig, type ReadOptions } from './read'

export const DEV_CONFIG_ROUTE = '/_smile/dev-config'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** The hostname of a Host header ("localhost:3000" -> "localhost", "[::1]:3000" -> "[::1]"). */
export function hostName(host: string | null | undefined): string {
  const h = (host || '').trim().toLowerCase()
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1)
  return h.split(':')[0] || ''
}

/**
 * Whether a Host is one the dev server is meant to be reached at: localhost,
 * or a name in Vite's server.allowedHosts (the same rule Vite uses against
 * DNS rebinding; true allows any, a leading "." allows subdomains).
 */
export function isAllowedHost(host: string | null | undefined, allowedHosts: string[] | true | undefined): boolean {
  const name = hostName(host)
  if (!name) return false
  if (LOCAL_HOSTS.has(name) || name.endsWith('.localhost')) return true
  if (allowedHosts === true) return true
  return (allowedHosts || []).some((a) => {
    const n = a.toLowerCase()
    return n.startsWith('.') ? name === n.slice(1) || name.endsWith(n) : name === n
  })
}

export interface DevConfigRequest {
  method: string
  host: string | null | undefined
}

/**
 * The route's logic, separate from the server API so it can be unit tested.
 * Answers only at the names the dev server is meant to be reached at, so a
 * page on another site can't read it through a DNS-rebound name.
 */
export function handleDevConfig(
  req: DevConfigRequest,
  opts: () => ReadOptions,
  allowedHosts?: string[] | true,
): { status: number, body: unknown } {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return { status: 405, body: { error: 'Read-only: only GET is supported.' } }
  }
  if (!isAllowedHost(req.host, allowedHosts)) {
    return { status: 403, body: { error: 'Open the dev tools at localhost (or a name in vite.server.allowedHosts) to see the build settings.' } }
  }
  try {
    return { status: 200, body: readBuildConfig(opts()) }
  }
  catch {
    // No details: an error message could quote a file's contents.
    return { status: 500, body: { error: 'Could not read the project\'s settings.' } }
  }
}

interface PortableEvent {
  req: Request
  res: { status: number, headers: Headers }
}

/** The handler in Nuxt's portable server API (works on Nitro 2 and 3). */
export function createDevConfigHandler(opts: () => ReadOptions, allowedHosts?: () => string[] | true | undefined) {
  return (event: PortableEvent) => {
    const { status, body } = handleDevConfig(
      { method: event.req.method, host: event.req.headers.get('host') },
      opts,
      allowedHosts?.(),
    )
    event.res.status = status
    event.res.headers.set('cache-control', 'no-store')
    return body
  }
}
