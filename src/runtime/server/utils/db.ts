import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import * as schema from '../database/schema'

let _db: ReturnType<typeof drizzle> | null = null

export function useDB() {
  if (!_db) {
    const url = process.env.TURSO_DATABASE_URL || 'file:.data/experiment.db'

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
