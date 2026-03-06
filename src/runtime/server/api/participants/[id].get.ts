import { eq } from 'drizzle-orm'
import { useDB } from '../../utils/db'
import { participants } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing participant id' })
  }

  const db = useDB()
  const row = await db.select().from(participants).where(eq(participants.id, id)).get()

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Participant not found' })
  }

  return { data: row.data }
})
