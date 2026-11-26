// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { sql } from 'drizzle-orm'
import { startServer, type TestServer } from './handler-helpers'
import { MIGRATIONS } from './db-helpers'
import { BACKFILL_TAG } from '../../src/runtime/server/utils/migrate'

vi.mock('h3', async () => (await import('./handler-helpers')).loadH3())
vi.mock('nitropack/runtime', async () => (await import('./handler-helpers')).nitroRuntime())

/**
 * Opening the database when a server starts (server/utils/db.ts), the
 * plugin that starts it (plugins/migrate.ts) and the middleware that makes
 * API requests wait for it (middleware/00.database-ready.ts).
 */

type DbModule = typeof import('../../src/runtime/server/utils/db')

let dir: string
let log: MockInstance
let warn: MockInstance
let error: MockInstance
const opened: DbModule[] = []

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'smile-dbtest-'))
  log = vi.spyOn(console, 'log').mockImplementation(() => {})
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('TURSO_AUTH_TOKEN', '')
})
afterEach(() => {
  for (const mod of opened.splice(0)) {
    try {
      ;(mod.useDB() as unknown as { $client: { close: () => void } }).$client.close()
    }
    catch {
      // never opened
    }
  }
  rmSync(dir, { recursive: true, force: true })
  vi.doUnmock('../../src/runtime/server/utils/migrate')
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** utils/db.ts loaded fresh (as a server that has just started), on this database */
async function freshDbModule(url: string): Promise<DbModule> {
  vi.stubEnv('TURSO_DATABASE_URL', url)
  vi.resetModules()
  const mod = await import('../../src/runtime/server/utils/db')
  opened.push(mod)
  return mod
}

const logged = (spy: MockInstance) => spy.mock.calls.map(call => String(call[0]))
const fileUrl = (...parts: string[]) => `file:${join(dir, ...parts)}`

/** A database as the first migration left it, with two participants saved by the code of that time */
async function databaseFromBeforeTheSyncEngine(url: string) {
  const client = createClient({ url })
  for (const stmt of MIGRATIONS[0]!.sql.split('--> statement-breakpoint')) {
    if (stmt.trim()) await client.execute(stmt)
  }
  await client.execute(`INSERT INTO projects (id, owner, repo, branch, mode, created_at) VALUES ('proj', 'o', 'r', 'main', 'live', 1)`)
  for (const [id, data] of [['a', { consented: true, done: true }], ['b', { consented: true, done: false }]] as const) {
    await client.execute({ sql: 'INSERT INTO participants (id, project_id, data, created_at, updated_at) VALUES (?, ?, ?, 5, 10)', args: [id, 'proj', JSON.stringify(data)] })
  }
  client.close()
}

describe('databaseReady', () => {
  it('makes the folder, applies every migration, and says so', async () => {
    const url = fileUrl('nested', 'deeper', 'experiment.db')
    const { databaseReady, useDB } = await freshDbModule(url)
    await databaseReady()

    expect(existsSync(join(dir, 'nested', 'deeper', 'experiment.db'))).toBe(true)
    const tags = (await useDB().all<{ tag: string }>(sql`SELECT tag FROM __drizzle_migrations ORDER BY id`)).map(r => r.tag)
    for (const migration of MIGRATIONS) expect(tags).toContain(migration.tag)

    const lines = logged(log)
    for (const migration of MIGRATIONS) expect(lines).toContain(`[SMILE] Applied migration ${migration.tag}`)
    expect(lines).toContain(`[SMILE] Database initialized (Local SQLite: ${url}) — applied ${MIGRATIONS.length} new migration(s)`)
  })

  it('puts a local database in WAL mode with a busy timeout, also after the migrations ran', async () => {
    const { databaseReady, useDB } = await freshDbModule(fileUrl('experiment.db'))
    await databaseReady()
    // The migrations ran in transactions, which give the client a new connection:
    // the settings must hold on the connection in use now
    const mode = await useDB().all<{ journal_mode: string }>(sql`PRAGMA journal_mode`)
    expect(mode[0]!.journal_mode).toBe('wal')
    const timeout = await useDB().all<Record<string, number>>(sql`PRAGMA busy_timeout`)
    expect(Object.values(timeout[0]!)[0]).toBe(5000)
  })

  it('gives every caller the same promise and runs the setup once', async () => {
    const { databaseReady } = await freshDbModule(fileUrl('experiment.db'))
    const first = databaseReady()
    const second = databaseReady()
    expect(second).toBe(first)
    await Promise.all([first, second])
    await databaseReady()
    expect(logged(log).filter(line => line.includes('Database initialized'))).toHaveLength(1)
  })

  it('on a database that has every migration, applies nothing and says "up to date"', async () => {
    const url = fileUrl('experiment.db')
    await (await freshDbModule(url)).databaseReady()
    log.mockClear()
    await (await freshDbModule(url)).databaseReady()
    const lines = logged(log)
    expect(lines.some(line => line.includes('Applied migration'))).toBe(false)
    expect(lines).toContain(`[SMILE] Database initialized (Local SQLite: ${url}) — up to date`)
  })

  it('useDB returns one connection per server', async () => {
    const { useDB } = await freshDbModule(fileUrl('experiment.db'))
    expect(useDB()).toBe(useDB())
  })

  it('fills the status columns of rows from before the sync engine after it resolves, and says how many', async () => {
    const url = fileUrl('old.db')
    await databaseFromBeforeTheSyncEngine(url)
    const { databaseReady, useDB } = await freshDbModule(url)
    await databaseReady()
    await vi.waitFor(() => {
      expect(logged(log)).toContain('[SMILE] Filled the status columns of 2 participants saved before the sync engine')
    })
    const rows = await useDB().all<{ id: string, done: number, consented: number }>(sql`SELECT id, done, consented FROM participants ORDER BY id`)
    expect(rows).toEqual([{ id: 'a', done: 1, consented: 1 }, { id: 'b', done: 0, consented: 1 }])
    const marker = await useDB().all<{ hash: string }>(sql`SELECT hash FROM __drizzle_migrations WHERE tag = ${BACKFILL_TAG}`)
    expect(marker[0]!.hash).toBe('done')
  })

  it('does not say it filled anything when there were no older rows', async () => {
    const { databaseReady, useDB } = await freshDbModule(fileUrl('experiment.db'))
    await databaseReady()
    await vi.waitFor(async () => {
      const marker = await useDB().all<{ hash: string }>(sql`SELECT hash FROM __drizzle_migrations WHERE tag = ${BACKFILL_TAG}`)
      expect(marker[0]?.hash).toBe('done')
    })
    expect(logged(log).some(line => line.includes('Filled the status columns'))).toBe(false)
  })

  it('resolves and warns when the fill of older rows fails', async () => {
    vi.doMock('../../src/runtime/server/utils/migrate', async (original) => {
      const actual = await original<typeof import('../../src/runtime/server/utils/migrate')>()
      return { ...actual, backfillStatusColumns: () => Promise.reject(new Error('disk full')) }
    })
    const { databaseReady } = await freshDbModule(fileUrl('experiment.db'))
    await expect(databaseReady()).resolves.toBeUndefined()
    await vi.waitFor(() => {
      expect(logged(warn).some(line => line.includes('Could not fill the status columns of older rows'))).toBe(true)
    })
  })

  it('goes on, with a warning, when WAL mode cannot be set', async () => {
    const { databaseReady, useDB } = await freshDbModule(fileUrl('experiment.db'))
    const db = useDB()
    const run = db.run.bind(db)
    vi.spyOn(db, 'run').mockImplementation(((query: Parameters<typeof run>[0]) => {
      const text = JSON.stringify((query as unknown as { queryChunks?: unknown }).queryChunks ?? '')
      if (text.includes('journal_mode')) return Promise.reject(new Error('read-only file system'))
      return run(query)
    }) as typeof db.run)
    await expect(databaseReady()).resolves.toBeUndefined()
    expect(logged(warn).some(line => line.includes('Could not enable WAL mode'))).toBe(true)
    expect(logged(log).some(line => line.includes('Database initialized'))).toBe(true)
  })

  it('rejects when the database cannot be opened, and tries again on the next call', async () => {
    // A folder cannot be made under a file
    const { databaseReady } = await freshDbModule('file:/dev/null/smile/experiment.db')
    await expect(databaseReady()).rejects.toThrow()
    await expect(databaseReady()).rejects.toThrow()
    // The address is read again at each attempt until a connection is made
    vi.stubEnv('TURSO_DATABASE_URL', fileUrl('experiment.db'))
    await expect(databaseReady()).resolves.toBeUndefined()
  })

  it('rejects with the migration\'s name when a migration fails, and applies it on a later call once it can', async () => {
    const url = fileUrl('experiment.db')
    // A table the second migration creates already exists: its CREATE TABLE fails
    const client = createClient({ url })
    await client.execute('CREATE TABLE console_logs (id INTEGER PRIMARY KEY)')
    const { databaseReady, useDB } = await freshDbModule(url)
    await expect(databaseReady()).rejects.toThrow(/Migration 0001_sync_engine failed and was rolled back/)
    await client.execute('DROP TABLE console_logs')
    client.close()
    await expect(databaseReady()).resolves.toBeUndefined()
    const tags = (await useDB().all<{ tag: string }>(sql`SELECT tag FROM __drizzle_migrations`)).map(r => r.tag)
    expect(tags).toContain('0001_sync_engine')
  })
})

describe('the migrate plugin (plugins/migrate.ts)', () => {
  const loadPlugin = async () => (await import('../../src/runtime/server/plugins/migrate')).default as unknown as () => void

  it('starts the database setup when the server starts, without waiting for it', async () => {
    const { databaseReady, useDB } = await freshDbModule(fileUrl('experiment.db'))
    const plugin = await loadPlugin()
    expect(plugin()).toBeUndefined()
    await databaseReady()
    const tables = (await useDB().all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table'`)).map(r => r.name)
    expect(tables).toContain('participants')
    expect(logged(log).filter(line => line.includes('Database initialized'))).toHaveLength(1)
  })

  it('logs a failure and does not throw or leave a rejection unhandled', async () => {
    await freshDbModule('file:/dev/null/smile/experiment.db')
    const plugin = await loadPlugin()
    expect(() => plugin()).not.toThrow()
    await vi.waitFor(() => {
      expect(logged(error)).toContain('[SMILE] Database setup failed:')
    })
  })
})

describe('API requests wait for the database (middleware/00.database-ready.ts)', () => {
  let server: TestServer | undefined
  afterEach(() => {
    server?.close()
    server = undefined
  })

  it('the first API request of a cold start finds the tables', async () => {
    server = await startServer({ migrate: false })
    const reply = await server.browser().post('/api/participants', { data: { first: true } })
    expect(reply.status).toBe(200)
  })

  it('requests arriving together during a cold start all succeed', async () => {
    server = await startServer({ migrate: false })
    const replies = await Promise.all([1, 2, 3, 4, 5].map(n => server!.browser().post('/api/participants', { data: { n } })))
    expect(replies.map(r => r.status)).toEqual([200, 200, 200, 200, 200])
  })

  it('answers 503 while the database cannot be set up, and works once it can', async () => {
    server = await startServer({ migrate: false })
    const good = server.url
    vi.stubEnv('TURSO_DATABASE_URL', 'file:/dev/null/smile/experiment.db')
    const browser = server.browser()
    const reply = await browser.post('/api/participants', { data: {} })
    expect(reply.status).toBe(503)
    expect(reply.body.statusMessage).toBe('Database not ready')
    expect(reply.body.data).toBeUndefined() // not one of the save route's own answers: the browser retries it
    expect(logged(error)).toContain('[SMILE] Database setup failed:')

    vi.stubEnv('TURSO_DATABASE_URL', good)
    expect((await browser.post('/api/participants', { data: {} })).status).toBe(200)
  })

  it('does not hold up, or fail, requests that are not for the API', async () => {
    server = await startServer({ migrate: false })
    vi.stubEnv('TURSO_DATABASE_URL', 'file:/dev/null/smile/experiment.db')
    expect((await server.browser().get('/welcome')).status).toBe(200)
    expect(error).not.toHaveBeenCalled()
    vi.stubEnv('TURSO_DATABASE_URL', server.url)
  })
})
