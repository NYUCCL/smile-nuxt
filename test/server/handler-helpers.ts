import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { vi } from 'vitest'

/**
 * Runs the server's handlers and middleware as Nitro does, without Nitro:
 * an h3 app with the middleware in file order and the handlers on the
 * routes their file paths give them, called with web Requests. Cookies,
 * status codes and error bodies are h3's own.
 *
 * Every test file that uses this needs two mocks at its top (vi.mock is per
 * file):
 *
 *   vi.mock('h3', async () => (await import('./handler-helpers')).loadH3())
 *   vi.mock('nitropack/runtime', async () => (await import('./handler-helpers')).nitroRuntime())
 *
 * The first is there because this repo's node_modules has h3 2 at its top
 * (another package's dependency), while Nitro runs the handlers with its own
 * h3 1. The tests use Nitro's.
 */

/** The h3 that nitropack depends on (the one a built server runs) */
export async function loadH3() {
  const here = createRequire(import.meta.url)
  const nitro = createRequire(here.resolve('nitropack/package.json'))
  const dir = dirname(nitro.resolve('h3/package.json'))
  const mod = await import(/* @vite-ignore */ join(dir, 'dist/index.mjs'))
  return { ...mod }
}

/** What the project's runtime config says about the project; tests change it */
// Kept on globalThis: vi.resetModules gives the mock its own copy of this file
type ProjectConfig = { owner?: string, repo?: string, branch?: string }
const shared = globalThis as { __smileTestProjectConfig?: ProjectConfig }
export const projectConfig: ProjectConfig = (shared.__smileTestProjectConfig ??= {})

/** Stands in for 'nitropack/runtime' */
export function nitroRuntime() {
  return {
    useRuntimeConfig: () => ({ public: { smile: { ...projectConfig } } }),
    defineNitroPlugin: (fn: unknown) => fn,
  }
}

type Handler = (_request: Request) => Promise<Response>

/** The server a test talks to (see startServer) */
export type TestServer = Awaited<ReturnType<typeof startServer>>
/** A browser: sends requests and keeps the cookies it is given */
export type Browser = ReturnType<typeof makeBrowser>

export interface Reply {
  status: number
  headers: Headers
  /** The body parsed as JSON, or the text when it isn't JSON */
  body: any // eslint-disable-line @typescript-eslint/no-explicit-any
  text: string
}

/** A body gzipped as the browser does it (core/sync/compress.js) */
export function gzipped(value: unknown): Uint8Array {
  return new Uint8Array(gzipSync(Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))))
}

/**
 * Starts a server on a new, empty SQLite file in a temp directory. Modules
 * are loaded fresh (utils/db.ts keeps one connection per module instance),
 * so call this in beforeEach and `close()` in afterEach.
 */
export async function startServer(options: {
  docs?: boolean
  /** false: leave the database unmigrated until the first API request (default: migrate at start, as the Nitro plugin does) */
  migrate?: boolean
  /** More routes: [method, path, handler file under src/runtime/server] */
  routes?: ['get' | 'post' | 'patch', string, string][]
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'smile-server-'))
  const url = `file:${join(dir, 'test.db')}`
  vi.stubEnv('TURSO_DATABASE_URL', url)
  vi.stubEnv('TURSO_AUTH_TOKEN', '')
  vi.resetModules()

  const h3 = await import('h3') as unknown as typeof import('h3')
  const load = async (path: string) => (await import(/* @vite-ignore */ `../../src/runtime/server/${path}`)).default
  const app = h3.createApp()
  // Middleware, in Nitro's order (by file name)
  app.use(await load('middleware/00.database-ready.ts'))
  app.use(await load('middleware/dev-auth.ts'))
  app.use(await load('middleware/participant-auth.ts'))

  const router = h3.createRouter()
  router.post('/api/participants', await load('api/participants/index.post.ts'))
  router.get('/api/participants/:id', await load('api/participants/[id].get.ts'))
  router.patch('/api/participants/:id', await load('api/participants/[id].patch.ts'))
  router.patch('/api/participants/:id/private', await load('api/participants/[id]/private.patch.ts'))
  router.post('/api/participants/:id/private', await load('api/participants/[id]/private.post.ts'))
  router.post('/api/auth/login', await load('api/auth/login.post.ts'))
  router.post('/api/auth/logout', await load('api/auth/logout.post.ts'))
  router.get('/api/auth/session', await load('api/auth/session.get.ts'))
  router.get('/api/qr', await load('api/qr.get.ts'))
  router.get('/api/db-info', await load('api/db-info.get.ts'))
  router.get('/api/projects', await load('api/projects/index.get.ts'))
  router.get('/api/projects/:id/participants', await load('api/projects/[id]/participants.get.ts'))
  router.get('/api/projects/:id/participants/:participantId', await load('api/projects/[id]/participants/[participantId].get.ts'))
  // Pages the dev-auth middleware guards (the pages themselves are Nuxt's)
  for (const path of ['/dev', '/dev/**', '/presentation', '/presentation/**', '/welcome', '/dev-login', '/devices', '/presentations']) {
    router.get(path, h3.defineEventHandler(() => 'page'))
  }
  if (options.docs) router.get('/__smile/docs/**', await load('dev/docs.ts'))
  for (const [method, path, file] of options.routes ?? []) router[method](path, await load(file))
  app.use(router)

  const handle: Handler = h3.toWebHandler(app)
  const { useDB, databaseReady } = await import('../../src/runtime/server/utils/db')
  if (options.migrate !== false) await databaseReady()

  return {
    /** The database's file URL */
    url,
    /** The server's own drizzle handle (utils/db.ts) */
    get db() {
      return useDB()
    },
    /** A browser: sends requests and keeps the cookies it is given */
    browser: () => makeBrowser(handle),
    /** Sends one web Request to the server as it is */
    fetch: handle,
    close() {
      try {
        ;(useDB() as unknown as { $client: { close: () => void } }).$client.close()
      }
      catch {
        // already closed
      }
      rmSync(dir, { recursive: true, force: true })
      vi.unstubAllEnvs()
    },
  }
}

function makeBrowser(handle: Handler) {
  const cookies = new Map<string, string>()
  /** The Set-Cookie lines of the last reply */
  let lastSetCookies: string[] = []

  async function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Reply> {
    const h: Record<string, string> = { ...headers }
    const init: RequestInit = { method, headers: h }
    if (cookies.size && h.cookie === undefined) h.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ')
    if (body !== undefined) {
      if (body instanceof Uint8Array) init.body = body as Uint8Array<ArrayBuffer>
      else if (typeof body === 'string') init.body = body
      else {
        init.body = JSON.stringify(body)
        h['content-type'] ??= 'application/json'
      }
    }
    const response = await handle(new Request(`http://localhost${path}`, init))
    lastSetCookies = response.headers.getSetCookie()
    for (const line of lastSetCookies) {
      const [pair, ...attrs] = line.split(';').map(s => s.trim())
      const at = pair!.indexOf('=')
      const name = pair!.slice(0, at)
      const value = pair!.slice(at + 1)
      const gone = value === '' || attrs.some(a => /^max-age=0$/i.test(a))
      if (gone) cookies.delete(name)
      else cookies.set(name, value)
    }
    const text = await response.text()
    let parsed: unknown = text
    try {
      parsed = JSON.parse(text)
    }
    catch {
      // not JSON
    }
    return { status: response.status, headers: response.headers, body: parsed, text }
  }

  return {
    cookies,
    get lastSetCookies() {
      return lastSetCookies
    },
    request,
    get: (path: string, headers?: Record<string, string>) => request('GET', path, undefined, headers),
    post: (path: string, body?: unknown, headers?: Record<string, string>) => request('POST', path, body, headers),
    patch: (path: string, body?: unknown, headers?: Record<string, string>) => request('PATCH', path, body, headers),
  }
}
