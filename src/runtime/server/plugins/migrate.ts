import { useDB } from '../utils/db'
import { sql } from 'drizzle-orm'
import { participants as _participants, privateData as _privateData, devSessions as _devSessions } from '../database/schema'

export default defineNitroPlugin(async () => {
  const db = useDB()

  // Create tables if they don't exist (simple migration for SQLite)
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      project_ref TEXT NOT NULL,
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

  console.log('[SMILE] Database tables initialized')
})
