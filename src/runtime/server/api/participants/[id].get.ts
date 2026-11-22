import { eq } from 'drizzle-orm'
import { defineEventHandler, createError, getRouterParam } from 'h3'
import { useDB } from '../../utils/db'
import { participants } from '../../database/schema'
import { NO_PARTICIPANT } from '../../../shared/save-answers.js'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing participant id' })
  }

  const db = useDB()
  const row = await db
    .select({ data: participants.data, rev: participants.rev, resume: participants.resume })
    .from(participants).where(eq(participants.id, id)).get()

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Participant not found', data: { smile: NO_PARTICIPANT } })
  }

  return { data: row.data, rev: row.rev, resume: row.resume ?? null }
})
