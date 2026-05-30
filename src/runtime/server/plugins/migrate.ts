import { defineNitroPlugin } from 'nitropack/runtime'
import { sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { useDB } from '../utils/db'
import { MIGRATIONS } from '../database/migrations'

type DB = ReturnType<typeof useDB>

export default defineNitroPlugin(async () => {
  const db = useDB()

  // Legacy: rename participants.project_ref → project_id for databases that
  // pre-date the rename (created before commit d9f3d58). New DBs skip this.
  await applyLegacyRename(db)

  // Ensure __drizzle_migrations exists, then bootstrap existing hand-rolled
  // tables by recording all current migrations as already applied.
  await ensureMigrationsTable(db)
  await bootstrapExistingDb(db)

  // Apply any pending migrations
  const applied = await applyPendingMigrations(db)

  logDatabaseInfo(applied)
})

async function applyLegacyRename(db: DB) {
  try {
    const tableInfo = await db.all(sql`PRAGMA table_info(participants)`)
    const columns = (tableInfo as Array<{ name: string }>).map(c => c.name)
    if (columns.includes('project_ref') && !columns.includes('project_id')) {
      await db.run(sql`ALTER TABLE participants RENAME COLUMN project_ref TO project_id`)
      console.log('[SMILE] Migrated participants.project_ref → project_id')
    }
  }
  catch {
    // table doesn't exist yet — fresh DB
  }
}

async function ensureMigrationsTable(db: DB) {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at INTEGER
    )
  `)
}

async function bootstrapExistingDb(db: DB) {
  const recorded = await db.all(sql`SELECT 1 FROM __drizzle_migrations LIMIT 1`)
  if (recorded.length > 0) return

  const projectsExists = await db.all(sql`
    SELECT name FROM sqlite_master WHERE type='table' AND name='projects'
  `)
  if (projectsExists.length === 0) return // fresh DB — let migrate run normally

  for (const migration of MIGRATIONS) {
    const hash = hashMigration(migration.sql)
    await db.run(sql`
      INSERT INTO __drizzle_migrations (hash, created_at) VALUES (${hash}, ${migration.when})
    `)
  }
  console.log(`[SMILE] Bootstrapped existing database with ${MIGRATIONS.length} migration(s)`)
}

async function applyPendingMigrations(db: DB): Promise<number> {
  const rows = await db.all(sql`
    SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1
  `) as Array<{ created_at: number }>
  const lastApplied = rows[0] ? Number(rows[0].created_at) : 0

  let count = 0
  for (const migration of MIGRATIONS) {
    if (migration.when <= lastApplied) continue

    const statements = migration.sql.split('--> statement-breakpoint')
    for (const stmt of statements) {
      const trimmed = stmt.trim()
      if (trimmed) await db.run(sql.raw(trimmed))
    }

    const hash = hashMigration(migration.sql)
    await db.run(sql`
      INSERT INTO __drizzle_migrations (hash, created_at) VALUES (${hash}, ${migration.when})
    `)
    console.log(`[SMILE] Applied migration ${migration.tag}`)
    count++
  }
  return count
}

function hashMigration(sqlContent: string): string {
  return createHash('sha256').update(sqlContent).digest('hex')
}

function logDatabaseInfo(appliedCount: number) {
  const dbUrl = process.env.TURSO_DATABASE_URL || 'file:.data/experiment.db'
  const isTurso = dbUrl.startsWith('libsql://') || dbUrl.startsWith('https://')
  const dbType = isTurso ? 'Turso' : 'Local SQLite'
  const displayUrl = isTurso ? dbUrl.replace(/\/\/.*@/, '//***@') : dbUrl
  const status = appliedCount > 0 ? `applied ${appliedCount} new migration(s)` : 'up to date'
  console.log(`[SMILE] Database initialized (${dbType}: ${displayUrl}) — ${status}`)
}
