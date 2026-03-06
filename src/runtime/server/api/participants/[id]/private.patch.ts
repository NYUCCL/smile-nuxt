import { eq } from 'drizzle-orm'
import { useDB } from '../../../utils/db'
import { privateData } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const participantId = getRouterParam(event, 'id')
  if (!participantId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing participant id' })
  }

  const body = await readBody(event)
  const db = useDB()

  const existing = await db
    .select()
    .from(privateData)
    .where(eq(privateData.participantId, participantId))
    .get()

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Private data not found' })
  }

  await db
    .update(privateData)
    .set({
      data: body.data,
      updatedAt: new Date(),
    })
    .where(eq(privateData.participantId, participantId))

  return { success: true }
})
