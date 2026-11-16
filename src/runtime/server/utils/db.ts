import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { sql } from 'drizzle-orm'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import * as schema from '../database/schema'
import { MIGRATIONS } from '../database/migrations'
import { runMigrations } from './migrate'

let _db: ReturnType<typeof drizzle> | null = null

function databaseUrl() {
  return process.env.TURSO_DATABASE_URL || 'file:.data/experiment.db'
}

export function useDB() {
  if (!_db) {
    const url = databaseUrl()

    // Ensure the directory exists for local file-based SQLite
    if (url.startsWith('file:')) {
      const filePath = url.slice(5)
      mkdirSync(dirname(filePath), { recursive: true })
    }

    const client = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
    _db = drizzle(client, { schema })
  }
  return _db
}

let _ready: Promise<void> | null = null

/**
 * Resolves once the database has every migration. Started by the migrate
 * plugin when the server starts, and awaited by the API middleware, so a
 * request that arrives during a cold start waits for the schema rather than
 * failing on a missing column. A failed attempt is tried again on the next
 * call.
 */
export function databaseReady(): Promise<void> {
  if (!_ready) {
    _ready = prepareDatabase().catch((err) => {
      _ready = null
      throw err
    })
  }
  return _ready
}

async function prepareDatabase() {
  const db = useDB()
  await configureLocalSqlite(db)
  const applied = await runMigrations(db, MIGRATIONS)
  for (const tag of applied) console.log(`[SMILE] Applied migration ${tag}`)
  logDatabaseInfo(applied.length)
}

/**
 * Local file databases only (not Turso): WAL lets readers (a DB viewer, the
 * e2e tests) and the server's writes proceed without "database is locked",
 * and busy_timeout makes the server wait briefly for a lock instead of failing.
 */
async function configureLocalSqlite(db: ReturnType<typeof useDB>) {
  if (!databaseUrl().startsWith('file:')) return
  try {
    await db.run(sql`PRAGMA journal_mode = WAL`)
    await db.run(sql`PRAGMA busy_timeout = 5000`)
  }
  catch (err) {
    console.warn('[SMILE] Could not enable WAL mode for the local database:', err)
  }
}

function logDatabaseInfo(appliedCount: number) {
  const dbUrl = databaseUrl()
  const isTurso = dbUrl.startsWith('libsql://') || dbUrl.startsWith('https://')
  const dbType = isTurso ? 'Turso' : 'Local SQLite'
  const displayUrl = isTurso ? dbUrl.replace(/\/\/.*@/, '//***@') : dbUrl
  const status = appliedCount > 0 ? `applied ${appliedCount} new migration(s)` : 'up to date'
  console.log(`[SMILE] Database initialized (${dbType}: ${displayUrl}) — ${status}`)
}
