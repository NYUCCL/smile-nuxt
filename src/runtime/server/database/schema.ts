import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const participants = sqliteTable('participants', {
  id: text('id').primaryKey(),
  projectRef: text('project_ref').notNull(),
  data: text('data', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const privateData = sqliteTable('private_data', {
  id: text('id').primaryKey(),
  participantId: text('participant_id')
    .notNull()
    .references(() => participants.id),
  data: text('data', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const devSessions = sqliteTable('dev_sessions', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
})
