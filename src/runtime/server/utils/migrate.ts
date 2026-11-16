import { sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import type { useDB } from './db'
import type { BundledMigration } from '../database/migrations'

type DB = ReturnType<typeof useDB>

/**
 * Applies the bundled migrations a database doesn't have yet.
 *
 * - A migration counts as applied when its tag is recorded (or, for rows
 *   written before tags were recorded or by `drizzle-kit migrate`, its hash or
 *   timestamp). So one merged out of order is still applied.
 * - Each migration runs in one transaction with the row that records it: it
 *   applies fully or not at all, and a second server starting at the same
 *   time waits, sees it recorded, and skips it.
 *
 * @returns the tags applied by this call
 */
export async function runMigrations(db: DB, migrations: BundledMigration[]): Promise<string[]> {
  await applyLegacyRename(db)
  await ensureMigrationsTable(db)
  await bootstrapExistingDb(db, migrations)
  await backfillTags(db, migrations)

  const applied: string[] = []
  for (const migration of migrations) {
    for (let attempt = 1; ; attempt++) {
      if (await isApplied(db, migration)) break
      try {
        const ran = await db.transaction(async (tx) => {
          // Checked again inside the write lock: another server may have
          // applied it while this one waited.
          if (await isApplied(tx as unknown as DB, migration)) return false
          for (const stmt of migration.sql.split('--> statement-breakpoint')) {
            const trimmed = stmt.trim()
            if (trimmed) await tx.run(sql.raw(trimmed))
          }
          await tx.run(sql`
            INSERT INTO __drizzle_migrations (hash, created_at, tag)
            VALUES (${hashMigration(migration.sql)}, ${migration.when}, ${migration.tag})
          `)
          return true
        }, { behavior: 'immediate' })
        if (ran) applied.push(migration.tag)
        break
      }
      catch (err) {
        // Another server holds the write lock (it is probably applying this
        // same migration): wait and look again.
        if (isLockError(err) && attempt < LOCK_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, 250 * attempt))
          continue
        }
        if (await isApplied(db, migration)) break
        throw new Error(`[SMILE] Migration ${migration.tag} failed and was rolled back: ${err instanceof Error ? err.message : err}`, { cause: err })
      }
    }
  }
  return applied
}

const LOCK_ATTEMPTS = 8

function isLockError(err: unknown): boolean {
  let e: unknown = err
  for (let i = 0; i < 5 && e; i++) {
    const text = `${(e as { code?: string }).code ?? ''} ${(e as Error).message ?? ''}`
    if (/busy|locked/i.test(text)) return true
    e = (e as { cause?: unknown }).cause
  }
  return false
}

/**
 * participants.project_ref → project_id, for databases created before the
 * rename (commit d9f3d58).
 */
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
    // table doesn't exist yet: a fresh database
  }
}

async function ensureMigrationsTable(db: DB) {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at INTEGER,
      tag TEXT
    )
  `)
  const columns = (await db.all(sql`PRAGMA table_info(__drizzle_migrations)`) as Array<{ name: string }>).map(c => c.name)
  if (!columns.includes('tag')) {
    try {
      await db.run(sql`ALTER TABLE __drizzle_migrations ADD COLUMN tag TEXT`)
    }
    catch (err) {
      // another server added it at the same moment
      const now = (await db.all(sql`PRAGMA table_info(__drizzle_migrations)`) as Array<{ name: string }>).map(c => c.name)
      if (!now.includes('tag')) throw err
    }
  }
}

/**
 * A database whose tables were created by hand, before migrations were
 * recorded, already has what the first migration creates: record that one
 * (only) as applied. Later migrations then run normally.
 */
async function bootstrapExistingDb(db: DB, migrations: BundledMigration[]) {
  const baseline = migrations[0]
  if (!baseline) return
  const recorded = await db.all(sql`SELECT 1 FROM __drizzle_migrations LIMIT 1`)
  if (recorded.length > 0) return

  const projectsExists = await db.all(sql`
    SELECT name FROM sqlite_master WHERE type='table' AND name='projects'
  `)
  if (projectsExists.length === 0) return // a fresh database

  // One statement, so two servers starting together record it once
  await db.run(sql`
    INSERT INTO __drizzle_migrations (hash, created_at, tag)
    SELECT ${hashMigration(baseline.sql)}, ${baseline.when}, ${baseline.tag}
    WHERE NOT EXISTS (SELECT 1 FROM __drizzle_migrations)
  `)
  console.log(`[SMILE] Existing database: recorded ${baseline.tag} as applied`)
}

/**
 * Rows recorded before tags (or by `drizzle-kit migrate`) get their tag, found
 * by hash or timestamp.
 */
async function backfillTags(db: DB, migrations: BundledMigration[]) {
  const untagged = await db.all(sql`SELECT 1 FROM __drizzle_migrations WHERE tag IS NULL LIMIT 1`)
  if (untagged.length === 0) return
  for (const migration of migrations) {
    await db.run(sql`
      UPDATE __drizzle_migrations SET tag = ${migration.tag}
      WHERE tag IS NULL AND (hash = ${hashMigration(migration.sql)} OR created_at = ${migration.when})
    `)
  }
}

async function isApplied(db: DB, migration: BundledMigration): Promise<boolean> {
  const rows = await db.all(sql`
    SELECT 1 FROM __drizzle_migrations
    WHERE tag = ${migration.tag}
       OR (tag IS NULL AND (hash = ${hashMigration(migration.sql)} OR created_at = ${migration.when}))
    LIMIT 1
  `)
  return rows.length > 0
}

export function hashMigration(sqlContent: string): string {
  return createHash('sha256').update(sqlContent).digest('hex')
}
