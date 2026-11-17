import { defineEventHandler, createError, getRouterParam } from 'h3'
import { useDB } from '../../utils/db'
import { parseJsonObject, parseOversizeReport, markOversize, parseSaveBody, saveParticipant } from '../../utils/participant-save'
import { readBodyText, throwRefusal } from '../../utils/read-body'

/**
 * Saves a participant's record: `{ data, resume?, rev? }`.
 *
 * A body the server can't use is refused with a 4xx that says why, and the
 * stored row is left as it was: 400 (not JSON, or the wrong shape), 413 (too
 * large), 409 (the row already has this rev or a newer one; the answer's
 * `data.rev` is the row's).
 *
 * `{ oversize: true, dataBytes }` with no `data` is the client's report that
 * its record is over the size limit and wasn't sent.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing participant id' })
  }

  const raw = await readBodyText(event)

  // The client's record is too large to send: note it on the row
  const body = parseJsonObject(raw)
  const report = body.ok ? parseOversizeReport(body.body) : null
  if (report) {
    if (!await markOversize(useDB(), id, report.dataBytes)) {
      throw createError({ statusCode: 404, statusMessage: 'Participant not found' })
    }
    return { success: true }
  }

  const parsed = parseSaveBody(raw)
  if (!parsed.ok) throwRefusal(parsed)

  const result = await saveParticipant(useDB(), id, parsed.save)
  if (!result.ok) {
    throwRefusal(result, result.status === 409 ? { rev: result.rev } : undefined)
  }
  return { success: true, rev: result.rev }
})
