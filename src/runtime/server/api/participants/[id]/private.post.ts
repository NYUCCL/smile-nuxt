import { randomUUID } from 'node:crypto'
import { defineEventHandler, createError, getRouterParam } from 'h3'
import { useDB } from '../../../utils/db'
import { parseDataBody, savePrivateData } from '../../../utils/participant-save'
import { readBodyText, throwRefusal } from '../../../utils/read-body'

/**
 * Creates a participant's private data row: `{ data }`. One row per
 * participant: a repeated POST updates the row and returns the same id.
 */
export default defineEventHandler(async (event) => {
  const participantId = getRouterParam(event, 'id')
  if (!participantId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing participant id' })
  }

  const parsed = parseDataBody(await readBodyText(event))
  if (!parsed.ok) throwRefusal(parsed)

  const id = await savePrivateData(useDB(), participantId, parsed.data, randomUUID())
  if (!id) {
    throw createError({ statusCode: 404, statusMessage: 'Participant not found' })
  }
  return { id }
})
