import { randomUUID } from 'node:crypto'
import { defineEventHandler, createError, getRouterParam } from 'h3'
import { useDB } from '../../../utils/db'
import { parseJsonObject, isJsonObject, savePrivateData } from '../../../utils/participant-save'
import { readBodyText, throwRefusal } from '../../../utils/read-body'
import { NO_PARTICIPANT } from '../../../../shared/save-answers.js'

/**
 * Saves a participant's private data: `{ data }`. Creates the row when the
 * POST that should have made it never arrived.
 */
export default defineEventHandler(async (event) => {
  const participantId = getRouterParam(event, 'id')
  if (!participantId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing participant id' })
  }

  const parsed = parseJsonObject(await readBodyText(event))
  if (!parsed.ok) throwRefusal(parsed)
  const { data } = parsed.body
  if (!isJsonObject(data)) {
    throw createError({ statusCode: 400, statusMessage: data === undefined ? 'Missing "data"' : '"data" must be a JSON object' })
  }

  const id = await savePrivateData(useDB(), participantId, data, randomUUID())
  if (!id) {
    throw createError({ statusCode: 404, statusMessage: 'Participant not found', data: { smile: NO_PARTICIPANT } })
  }
  return { success: true }
})
