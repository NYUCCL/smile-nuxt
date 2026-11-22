// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tempDatabase, MIGRATIONS } from './db-helpers'
import { runMigrations, hashMigration, backfillStatusColumns, BACKFILL_TAG } from '../../src/runtime/server/utils/migrate'

/**
 * Migrations run when a deployed server starts, against databases that hold
 * participants' data: on a fresh database, on one with rows saved by earlier
 * code, twice, by two servers at once, and with a migration that fails.
 */

let t: ReturnType<typeof tempDatabase>
beforeEach(() => {
  t = tempDatabase()
})
afterEach(() => t.close())

const BASELINE = MIGRATIONS[0]!
const all = async (sql: string, args: (string | number | null)[] = []) => (await t.client.execute({ sql, args })).rows
const columns = async (table: string) => (await all(`PRAGMA table_info(${table})`)).map(r => r.name as string)
const tables = async () => (await all(`SELECT name FROM sqlite_master WHERE type = 'table'`)).map(r => r.name as string)
const indexes = async () => (await all(`SELECT name FROM sqlite_master WHERE type = 'index'`)).map(r => r.name as string)
const recorded = async () => (await all('SELECT tag FROM __drizzle_migrations ORDER BY id')).map(r => r.tag)

/** The tables as the first migration made them, without recording it */
async function createBaselineTables() {
  for (const stmt of BASELINE.sql.split('--> statement-breakpoint')) {
    if (stmt.trim()) await t.client.execute(stmt)
  }
}

async function insertOldRows() {
  await t.client.execute(`INSERT INTO projects (id, owner, repo, branch, mode, created_at) VALUES ('proj', 'o', 'r', 'main', 'live', 1)`)
  const p = (id: string, data: string, updated = 10) =>
    t.client.execute({ sql: 'INSERT INTO participants (id, project_id, data, created_at, updated_at) VALUES (?, ?, ?, 5, ?)', args: [id, 'proj', data, updated] })
  await p('done', JSON.stringify({ consented: true, done: true, withdrawn: false, recruitmentService: 'prolific', starttime: 1700000000000, endtime: 1700000360000, trials: [1, 2, 3] }))
  await p('started', JSON.stringify({ consented: true, done: false, withdrawn: false, recruitmentService: 'web', starttime: 1700000000000, endtime: null }))
  await p('odd', JSON.stringify({ consented: 'yes', done: 1, withdrawn: [true], recruitmentService: { a: 1 }, starttime: 'then', endtime: {} }))
  await p('empty', '{}')
  await p('array', '[1, 2]')
  await p('string', '"text"')
  await p('notjson', '{not json')
  await p('long', JSON.stringify({ recruitmentService: 'x'.repeat(500), starttime: 1700000000000.9 }))
  const priv = (id: string, participant: string, data: string, updated: number) =>
    t.client.execute({ sql: 'INSERT INTO private_data (id, participant_id, data, created_at, updated_at) VALUES (?, ?, ?, 5, ?)', args: [id, participant, data, updated] })
  await priv('a1', 'done', '{"id":"OLD"}', 10)
  await priv('a2', 'done', '{"id":"NEWEST"}', 30)
  await priv('a3', 'done', '{"id":"MIDDLE"}', 20)
  await priv('b1', 'started', '{"id":"ONLY"}', 10)
}

describe('a fresh database', () => {
  it('gets every table, column and index, and each migration is recorded by tag', async () => {
    expect(await runMigrations(t.db, MIGRATIONS)).toEqual(MIGRATIONS.map(m => m.tag))
    expect(await tables()).toEqual(expect.arrayContaining(['projects', 'participants', 'private_data', 'dev_sessions', 'console_logs', 'interaction_chunks']))
    expect(await columns('participants')).toEqual(expect.arrayContaining([
      'rev', 'resume', 'consented', 'done', 'withdrawn', 'recruitment_service', 'started_at', 'ended_at', 'data_bytes', 'save_count', 'oversize', 'last_error',
    ]))
    expect(await indexes()).toEqual(expect.arrayContaining([
      'participants_project_updated_idx', 'participants_project_done_idx', 'private_data_participant_unique',
      'console_logs_session_seq_unique', 'interaction_chunks_unique',
    ]))
    expect(await recorded()).toEqual(MIGRATIONS.map(m => m.tag))
  })

  it('run again, applies nothing and changes nothing', async () => {
    await runMigrations(t.db, MIGRATIONS)
    expect(await runMigrations(t.db, MIGRATIONS)).toEqual([])
    expect(await runMigrations(t.db, MIGRATIONS)).toEqual([])
    expect(await recorded()).toEqual(MIGRATIONS.map(m => m.tag))
  })
})

describe('a database with rows saved by earlier code', () => {
  // The three ways such a database records (or doesn't) the first migration
  const histories: Record<string, () => Promise<void>> = {
    'tables made by hand, nothing recorded': async () => {},
    'recorded by this code before tags (hash and timestamp, no tag column)': async () => {
      await t.client.execute('CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at INTEGER)')
      await t.client.execute({ sql: 'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)', args: [hashMigration(BASELINE.sql), BASELINE.when] })
    },
    'recorded by drizzle-kit migrate (its own hash, the timestamp)': async () => {
      await t.client.execute('CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)')
      await t.client.execute({ sql: 'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)', args: ['some-other-hash', BASELINE.when] })
    },
  }

  for (const [name, record] of Object.entries(histories)) {
    describe(name, () => {
      beforeEach(async () => {
        await createBaselineTables()
        await insertOldRows()
        await record()
      })

      it('the fill of older rows goes on from where it stopped', async () => {
        await runMigrations(t.db, MIGRATIONS)
        const ids = (await all('SELECT rowid FROM participants ORDER BY rowid')).map(r => Number(r.rowid))
        // As if an earlier run stopped after the second row
        await t.client.execute({ sql: `INSERT INTO __drizzle_migrations (hash, created_at, tag) VALUES (?, 1, '${BACKFILL_TAG}')`, args: [String(ids[1])] })
        expect(await backfillStatusColumns(t.db, 2)).toBe(ids.length - 2)
        expect((await all('SELECT count(*) AS n FROM participants WHERE data_bytes IS NULL'))[0]!.n).toBe(2)
      })

      it('applies only the later migrations, and keeps every record as it was', async () => {
        const before = await all('SELECT id, project_id, data, created_at, updated_at FROM participants ORDER BY id')
        expect(await runMigrations(t.db, MIGRATIONS)).toEqual(MIGRATIONS.slice(1).map(m => m.tag))
        expect(await all('SELECT id, project_id, data, created_at, updated_at FROM participants ORDER BY id')).toEqual(before)
        expect(await runMigrations(t.db, MIGRATIONS)).toEqual([])
        expect(await recorded()).toEqual(MIGRATIONS.map(m => m.tag))
      })

      it('fills the status columns from each record, null where the record has no usable value', async () => {
        await runMigrations(t.db, MIGRATIONS)
        // Not part of the migration: older rows are filled afterwards, in batches
        expect((await all('SELECT count(*) AS n FROM participants WHERE data_bytes IS NOT NULL'))[0]!.n).toBe(0)
        const rows = Number((await all('SELECT count(*) AS n FROM participants'))[0]!.n)
        expect(await backfillStatusColumns(t.db, 2)).toBe(rows)
        // Done is recorded: a second call does nothing
        expect(await backfillStatusColumns(t.db, 2)).toBe(0)
        expect((await all(`SELECT hash FROM __drizzle_migrations WHERE tag = '${BACKFILL_TAG}'`))[0]!.hash).toBe('done')
        const status = async (id: string) => (await all(
          'SELECT rev, resume, consented, done, withdrawn, recruitment_service, started_at, ended_at, save_count, oversize, last_error FROM participants WHERE id = ?', [id]))[0]
        expect({ ...(await status('done')) }).toEqual({
          rev: 0, resume: null, consented: 1, done: 1, withdrawn: 0, recruitment_service: 'prolific',
          started_at: 1700000000000, ended_at: 1700000360000, save_count: 0, oversize: 0, last_error: null,
        })
        expect(await status('started')).toMatchObject({ consented: 1, done: 0, withdrawn: 0, recruitment_service: 'web', started_at: 1700000000000, ended_at: null })
        const nulls = { consented: null, done: null, withdrawn: null, recruitment_service: null, started_at: null, ended_at: null }
        for (const id of ['odd', 'empty', 'array', 'string', 'notjson']) {
          expect(await status(id), id).toMatchObject({ rev: 0, ...nulls })
        }
        const long = await status('long')
        expect((long!.recruitment_service as string).length).toBe(100)
        expect(long!.started_at).toBe(1700000000000)
        const sizes = await all('SELECT id, data, data_bytes FROM participants')
        for (const r of sizes) expect(r.data_bytes, r.id as string).toBe(Buffer.byteLength(r.data as string))
      })

      it('keeps one private_data row per participant: the newest', async () => {
        await runMigrations(t.db, MIGRATIONS)
        expect(await all('SELECT id, participant_id, data FROM private_data ORDER BY participant_id')).toEqual([
          expect.objectContaining({ id: 'a2', participant_id: 'done', data: '{"id":"NEWEST"}' }),
          expect.objectContaining({ id: 'b1', participant_id: 'started', data: '{"id":"ONLY"}' }),
        ])
        await expect(t.client.execute(`INSERT INTO private_data (id, participant_id, data, created_at, updated_at) VALUES ('dup', 'done', '{}', 1, 1)`))
          .rejects.toThrow(/UNIQUE/i)
      })
    })
  }
})

describe('migration order and failure', () => {
  const extra = (tag: string, when: number, sql: string) => ({ tag, when, sql })

  it('a migration older than the newest applied one is still applied', async () => {
    await runMigrations(t.db, MIGRATIONS)
    const late = extra('0001a_merged_late', MIGRATIONS[0]!.when + 1, 'CREATE TABLE merged_late (id integer)')
    expect(await runMigrations(t.db, [MIGRATIONS[0]!, late, ...MIGRATIONS.slice(1)])).toEqual(['0001a_merged_late'])
    expect(await tables()).toContain('merged_late')
  })

  it('a migration that fails is rolled back whole, is not recorded, and runs once fixed', async () => {
    await runMigrations(t.db, MIGRATIONS)
    await t.client.execute(`INSERT INTO projects (id, owner, repo, branch, mode, created_at) VALUES ('proj', 'o', 'r', 'main', 'live', 1)`)
    const broken = extra('9000_broken', 9e15, [
      'CREATE TABLE half_made (id integer)',
      `UPDATE projects SET owner = 'changed'`,
      'ALTER TABLE no_such_table ADD COLUMN x integer',
    ].join('\n--> statement-breakpoint\n'))
    await expect(runMigrations(t.db, [...MIGRATIONS, broken])).rejects.toThrow(/9000_broken failed and was rolled back/)
    expect(await tables()).not.toContain('half_made')
    expect((await all('SELECT owner FROM projects'))[0]!.owner).toBe('o')
    expect(await recorded()).not.toContain('9000_broken')

    const fixed = extra('9000_broken', 9e15, 'CREATE TABLE half_made (id integer)')
    expect(await runMigrations(t.db, [...MIGRATIONS, fixed])).toEqual(['9000_broken'])
    expect(await tables()).toContain('half_made')
  })

  it('two servers starting together: each migration is applied once', async () => {
    await createBaselineTables()
    await insertOldRows()
    const second = t.open()
    // (Two connections in one process: a long busy wait would block both.)
    const results = await Promise.all([runMigrations(t.db, MIGRATIONS), runMigrations(second.db, MIGRATIONS)])
    expect(results.flat().sort()).toEqual(MIGRATIONS.slice(1).map(m => m.tag))
    expect(await recorded()).toEqual(MIGRATIONS.map(m => m.tag))
    expect((await all('SELECT count(*) AS n FROM participants'))[0]!.n).toBe(8)
  })

  it('a database from before project_ref was renamed gets the rename, then the migrations', async () => {
    await createBaselineTables()
    await t.client.execute('ALTER TABLE participants RENAME COLUMN project_id TO project_ref')
    await runMigrations(t.db, MIGRATIONS)
    expect(await columns('participants')).toEqual(expect.arrayContaining(['project_id', 'rev']))
  })
})
