import { randomUUID } from 'node:crypto'
import { defineEventHandler, readBody } from 'h3'
import { useDB } from '../../utils/db'
import { participants } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const db = useDB()
  const id = randomUUID()
  const now = new Date()

  await db.insert(participants).values({
    id,
    projectRef: body.projectRef || 'unknown',
    data: body.data || {},
    createdAt: now,
    updatedAt: now,
  })

  return { id }
})
