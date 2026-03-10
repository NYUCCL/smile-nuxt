import { defineNitroPlugin } from 'nitropack/runtime'
import { useDB } from '../utils/db'
import { sql } from 'drizzle-orm'
import { projects as _projects, participants as _participants, privateData as _privateData, devSessions as _devSessions } from '../database/schema'

export default defineNitroPlugin(async () => {
  const db = useDB()

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      branch TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'live',
      created_at INTEGER NOT NULL
    )
  `)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      data TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS private_data (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL REFERENCES participants(id),
      data TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS dev_sessions (
      id TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    )
  `)

  // Migration: rename project_ref → project_id for existing databases
  // SQLite doesn't support RENAME COLUMN in older versions, so we check if the old column exists
  try {
    const tableInfo = await db.all(sql`PRAGMA table_info(participants)`)
    const columns = (tableInfo as Array<{ name: string }>).map(c => c.name)
    if (columns.includes('project_ref') && !columns.includes('project_id')) {
      await db.run(sql`ALTER TABLE participants RENAME COLUMN project_ref TO project_id`)
      console.log('[SMILE] Migrated participants.project_ref → project_id')
    }
  }
  catch {
    // PRAGMA or rename not supported — column already correct or fresh DB
  }

  console.log('[SMILE] Database tables initialized')
})
