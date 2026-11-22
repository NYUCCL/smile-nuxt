import { createClient } from '@libsql/client'

/**
 * The database the dev server under test writes to, opened the way the
 * server opens it (src/runtime/server/utils/db.ts): TURSO_DATABASE_URL and
 * TURSO_AUTH_TOKEN when set, otherwise the local file. So the same suite
 * runs against a Turso test database by setting the two variables.
 */
export const TEST_DB_URL = process.env.TURSO_DATABASE_URL || 'file:.data/experiment.db'
export const TEST_DB_IS_LOCAL = TEST_DB_URL.startsWith('file:')

export function openTestDB() {
  return createClient({ url: TEST_DB_URL, authToken: process.env.TURSO_AUTH_TOKEN })
}
