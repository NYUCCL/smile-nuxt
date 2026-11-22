import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../../src/runtime/server/database/schema'
import { MIGRATIONS } from '../../src/runtime/server/database/migrations'
import { runMigrations } from '../../src/runtime/server/utils/migrate'

/** A real SQLite file in a temp directory, with a drizzle handle on it */
export function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'smile-db-'))
  const url = `file:${join(dir, 'test.db')}`
  const clients: Client[] = []
  const open = () => {
    const client = createClient({ url })
    clients.push(client)
    return { client, db: drizzle(client, { schema }) }
  }
  const first = open()
  return {
    ...first,
    url,
    /** Another connection to the same file */
    open,
    close() {
      for (const c of clients) c.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

/** A migrated database with one project and one participant ('p1') */
export async function seededDatabase() {
  const t = tempDatabase()
  await runMigrations(t.db, MIGRATIONS)
  const now = new Date()
  await t.db.insert(schema.projects).values({ id: 'proj', owner: 'o', repo: 'r', branch: 'main', mode: 'test', createdAt: now })
  await t.db.insert(schema.participants).values({ id: 'p1', projectId: 'proj', data: { seed: 1 }, createdAt: now, updatedAt: now })
  return t
}

export { schema, MIGRATIONS }
