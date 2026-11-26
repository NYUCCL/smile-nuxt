// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core'
import { tempDatabase, schema, MIGRATIONS } from './db-helpers'
import { runMigrations } from '../../src/runtime/server/utils/migrate'

/**
 * The schema the code queries with (server/database/schema.ts) against the
 * tables the migrations make. A column added to one and not the other shows
 * up here, not as a failed query on a deployed server.
 */

let t: ReturnType<typeof tempDatabase>
beforeAll(async () => {
  t = tempDatabase()
  await runMigrations(t.db, MIGRATIONS)
})
afterAll(() => t.close())

const rows = async (sql: string) => (await t.client.execute(sql)).rows as unknown as Record<string, unknown>[]

const tables = Object.values(schema).map(table => getTableConfig(table as SQLiteTable))

describe('schema.ts and the migrations agree', () => {
  it('describes the six tables', () => {
    expect(tables.map(table => table.name).sort()).toEqual(['console_logs', 'dev_sessions', 'interaction_chunks', 'participants', 'private_data', 'projects'].sort())
  })

  for (const table of tables) {
    describe(table.name, () => {
      it('has the same columns, with the same NOT NULL and primary key', async () => {
        const inDatabase = await rows(`PRAGMA table_info(${table.name})`)
        expect(inDatabase.map(c => c.name).sort()).toEqual(table.columns.map(c => c.name).sort())
        for (const column of table.columns) {
          const actual = inDatabase.find(c => c.name === column.name)!
          // SQLite reports notnull 0 for an INTEGER PRIMARY KEY, which can't be null anyway
          if (!column.primary) expect(Boolean(actual.notnull), `${column.name} NOT NULL`).toBe(column.notNull)
          expect(Boolean(actual.pk), `${column.name} primary key`).toBe(column.primary)
          expect(String(actual.type).toLowerCase(), `${column.name} type`).toBe(column.getSQLType().toLowerCase())
        }
      })

      it('has the same foreign keys', async () => {
        const inDatabase = (await rows(`PRAGMA foreign_key_list(${table.name})`))
          .map(fk => `${fk.from} -> ${fk.table}.${fk.to} on delete ${String(fk.on_delete).toLowerCase()}`).sort()
        const inSchema = table.foreignKeys.map((fk) => {
          const ref = fk.reference()
          return `${ref.columns[0]!.name} -> ${getTableConfig(ref.foreignTable).name}.${ref.foreignColumns[0]!.name} on delete ${fk.onDelete ?? 'no action'}`
        }).sort()
        expect(inDatabase).toEqual(inSchema)
      })

      it('has the same indexes, on the same columns', async () => {
        const list = (await rows(`PRAGMA index_list(${table.name})`)).filter(index => index.origin === 'c')
        const inDatabase: string[] = []
        for (const index of list) {
          const columns = (await rows(`PRAGMA index_info(${index.name})`)).map(c => c.name)
          inDatabase.push(`${index.name}${index.unique ? ' unique' : ''}: ${columns.join(', ')}`)
        }
        const inSchema = table.indexes.map(index =>
          `${index.config.name}${index.config.unique ? ' unique' : ''}: ${index.config.columns.map(c => (c as { name: string }).name).join(', ')}`)
        expect(inDatabase.sort()).toEqual(inSchema.sort())
      })
    })
  }

  it('deleting a participant deletes their console logs and interaction chunks when foreign keys are enforced', async () => {
    const now = new Date()
    await t.client.execute('PRAGMA foreign_keys = ON')
    await t.db.insert(schema.projects).values({ id: 'proj', owner: 'o', repo: 'r', branch: 'main', mode: 'test', createdAt: now })
    await t.db.insert(schema.participants).values({ id: 'p1', projectId: 'proj', data: {}, createdAt: now, updatedAt: now })
    await t.db.insert(schema.consoleLogs).values({ projectId: 'proj', sessionId: 's', participantId: 'p1', seq: 0, entries: [], createdAt: now })
    await t.db.insert(schema.interactionChunks).values({ participantId: 'p1', route: 'task', visit: 0, seq: 0, stream: Buffer.from([1, 2]), createdAt: now })
    await t.client.execute(`DELETE FROM participants WHERE id = 'p1'`)
    expect(await rows('SELECT * FROM console_logs')).toHaveLength(0)
    expect(await rows('SELECT * FROM interaction_chunks')).toHaveLength(0)
  })

  it('a chunk or a log batch sent twice is refused by its unique key', async () => {
    const now = new Date()
    await t.db.insert(schema.projects).values({ id: 'proj2', owner: 'o', repo: 'r', branch: 'b', mode: 'test', createdAt: now })
    await t.db.insert(schema.participants).values({ id: 'p2', projectId: 'proj2', data: {}, createdAt: now, updatedAt: now })
    const logs = { projectId: 'proj2', sessionId: 's2', participantId: null, seq: 3, entries: [{ type: 'warn' }], createdAt: now }
    await t.db.insert(schema.consoleLogs).values(logs)
    await expect(t.db.insert(schema.consoleLogs).values(logs)).rejects.toThrow()
    const chunk = { participantId: 'p2', route: 'task', visit: 1, seq: 0, stream: Buffer.from([1]), createdAt: now }
    await t.db.insert(schema.interactionChunks).values(chunk)
    await expect(t.db.insert(schema.interactionChunks).values(chunk)).rejects.toThrow()
    await t.db.insert(schema.interactionChunks).values({ ...chunk, seq: 1 })
    const stored = await t.db.select().from(schema.interactionChunks).all()
    expect(stored.filter(c => c.participantId === 'p2')).toHaveLength(2)
    expect(Buffer.isBuffer(stored[0]!.stream)).toBe(true)
    expect(stored[0]!.eventCount).toBe(0)
  })
})
