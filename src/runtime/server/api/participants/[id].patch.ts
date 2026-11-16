import { defineEventHandler, createError, getRouterParam } from 'h3'
import { useDB } from '../../utils/db'
import { parseSaveBody, saveParticipant } from '../../utils/participant-save'
import { readBodyText, throwRefusal } from '../../utils/read-body'

/**
 * Saves a participant's record: `{ data, resume?, rev? }`.
 *
 * A body the server can't use is refused with a 4xx that says why, and the
 * stored row is left as it was: 400 (not JSON, or the wrong shape), 413 (too
 * large), 409 (the row already has this rev or a newer one; the answer's
 * `data.rev` is the row's).
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing participant id' })
  }

  const parsed = parseSaveBody(await readBodyText(event))
  if (!parsed.ok) throwRefusal(parsed)

  const result = await saveParticipant(useDB(), id, parsed.save)
  if (!result.ok) {
    throwRefusal(result, result.status === 409 ? { rev: result.rev } : undefined)
  }
  return { success: true, rev: result.rev }
})
