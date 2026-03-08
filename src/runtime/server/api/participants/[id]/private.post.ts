import { randomUUID } from 'node:crypto'
import { defineEventHandler, readBody, createError, getRouterParam } from 'h3'
import { useDB } from '../../../utils/db'
import { privateData } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const participantId = getRouterParam(event, 'id')
  if (!participantId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing participant id' })
  }

  const body = await readBody(event)
  const db = useDB()
  const id = randomUUID()
  const now = new Date()

  await db.insert(privateData).values({
    id,
    participantId,
    data: body.data || {},
    createdAt: now,
    updatedAt: now,
  })

  return { id }
})
