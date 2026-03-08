import { eq } from 'drizzle-orm'
import { defineEventHandler, readBody, createError, getRouterParam } from 'h3'
import { useDB } from '../../utils/db'
import { participants } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing participant id' })
  }

  const body = await readBody(event)
  const db = useDB()

  const existing = await db.select().from(participants).where(eq(participants.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Participant not found' })
  }

  await db
    .update(participants)
    .set({
      data: body.data,
      updatedAt: new Date(),
    })
    .where(eq(participants.id, id))

  return { success: true }
})
