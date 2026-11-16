import { sqliteTable, text, integer, blob, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(),
  repo: text('repo').notNull(),
  branch: text('branch').notNull(),
  mode: text('mode').notNull().default('live'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

/**
 * One row per participant. `data` is the record researchers analyze; `resume`
 * is what a reload needs (view, stepper positions) and is kept apart so
 * exports of `data` don't change. `rev` orders saves: a save is stored only
 * if its rev is newer.
 *
 * The status columns are copied from `data` by the server on each save
 * (utils/participant-save.ts) so lists and counts don't parse every record.
 * They're null when `data` doesn't hold a usable value.
 */
export const participants = sqliteTable('participants', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  data: text('data', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  rev: integer('rev').notNull().default(0),
  resume: text('resume', { mode: 'json' }),
  consented: integer('consented', { mode: 'boolean' }),
  done: integer('done', { mode: 'boolean' }),
  withdrawn: integer('withdrawn', { mode: 'boolean' }),
  recruitmentService: text('recruitment_service'),
  startedAt: integer('started_at'), // ms since epoch, as data.starttime
  endedAt: integer('ended_at'), // ms since epoch, as data.endtime
  dataBytes: integer('data_bytes'),
  saveCount: integer('save_count').notNull().default(0),
  oversize: integer('oversize', { mode: 'boolean' }).notNull().default(false),
  lastError: text('last_error'),
}, table => [
  index('participants_project_updated_idx').on(table.projectId, table.updatedAt),
  index('participants_project_done_idx').on(table.projectId, table.done),
])

export const privateData = sqliteTable('private_data', {
  id: text('id').primaryKey(),
  participantId: text('participant_id')
    .notNull()
    .references(() => participants.id),
  data: text('data', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, table => [
  uniqueIndex('private_data_participant_unique').on(table.participantId),
])

export const devSessions = sqliteTable('dev_sessions', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
})

/**
 * Browser console output (#39), in numbered chunks per page session. A chunk
 * sent twice is stored once (the unique key). `participant_id` is null for
 * output from before the participant exists.
 */
export const consoleLogs = sqliteTable('console_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull(),
  participantId: text('participant_id')
    .references(() => participants.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  entries: text('entries', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, table => [
  uniqueIndex('console_logs_session_seq_unique').on(table.sessionId, table.seq),
  index('console_logs_participant_idx').on(table.participantId),
  index('console_logs_project_created_idx').on(table.projectId, table.createdAt),
])

/**
 * Mouse, keyboard and other interaction streams (#40), one row per flush.
 * `stream` is the gzipped binary chunk.
 */
export const interactionChunks = sqliteTable('interaction_chunks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  participantId: text('participant_id')
    .notNull()
    .references(() => participants.id, { onDelete: 'cascade' }),
  route: text('route').notNull(),
  visit: integer('visit').notNull(),
  seq: integer('seq').notNull(),
  stream: blob('stream', { mode: 'buffer' }).notNull(),
  eventCount: integer('event_count').notNull().default(0),
  tStart: integer('t_start'),
  tEnd: integer('t_end'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, table => [
  uniqueIndex('interaction_chunks_unique').on(table.participantId, table.route, table.visit, table.seq),
])
