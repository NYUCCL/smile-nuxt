import { randomUUID } from 'node:crypto'
import { defineEventHandler, createError, getRouterParam } from 'h3'
import { useDB } from '../../utils/db'
import { parseJsonObject, parseOversizeReport, markOversize, parseLimitReport, markSendLimit, parseSaveObject, saveParticipant, savePrivateData } from '../../utils/participant-save'
import { readBodyText, throwRefusal } from '../../utils/read-body'
import { NO_PARTICIPANT } from '../../../shared/save-answers.js'

/**
 * Saves a participant's record: `{ data, resume?, rev?, private? }`. `private`
 * holds the parts of the private data that changed; they are merged into the
 * participant's private_data row.
 *
 * A body the server can't use is refused with a 4xx that says why, and the
 * stored row is left as it was: 400 (not JSON, or the wrong shape), 413 (too
 * large), 409 (the row already has this rev or a newer one; the answer's
 * `data.rev` is the row's).
 *
 * `{ oversize: true, dataBytes }` with no `data` is the client's report that
 * its record is over the size limit and wasn't sent; `{ limit: true, sends }`
 * that it has reached its limit of sends.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing participant id' })
  }

  const raw = await readBodyText(event)

  // Read once (a save can be several megabytes)
  const body = parseJsonObject(raw)
  if (!body.ok) throwRefusal(body)

  // The client's record is too large to send: note it on the row
  const report = parseOversizeReport(body.body)
  if (report) {
    if (!await markOversize(useDB(), id, report.dataBytes)) {
      throw createError({ statusCode: 404, statusMessage: 'Participant not found', data: { smile: NO_PARTICIPANT } })
    }
    return { success: true }
  }

  const limit = parseLimitReport(body.body)
  if (limit) {
    if (!await markSendLimit(useDB(), id, limit.sends)) {
      throw createError({ statusCode: 404, statusMessage: 'Participant not found', data: { smile: NO_PARTICIPANT } })
    }
    return { success: true }
  }

  const parsed = parseSaveObject(body.body)
  if (!parsed.ok) throwRefusal(parsed)

  const result = await saveParticipant(useDB(), id, parsed.save)
  if (!result.ok) {
    throwRefusal(result, result.status === 409 ? { rev: result.rev } : result.status === 404 ? { smile: NO_PARTICIPANT } : undefined)
  }
  // The private data that changed travels with the record, so a closing
  // page needs one request. Stored after the record: if this fails the
  // request fails, and the client's resend (accepted as the same save)
  // stores it.
  if (parsed.save.private) await savePrivateData(useDB(), id, parsed.save.private, randomUUID())
  return { success: true, rev: result.rev }
})
