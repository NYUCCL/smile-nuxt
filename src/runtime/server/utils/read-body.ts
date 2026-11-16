import { readRawBody, getRequestHeader, createError, type H3Event } from 'h3'
import { MAX_BODY_BYTES, type Refusal } from './participant-save'

/**
 * The request body as text, or undefined when there is none. Refuses (413) a
 * body whose declared length is over the limit before reading it.
 */
export async function readBodyText(event: H3Event): Promise<string | undefined> {
  const declared = Number(getRequestHeader(event, 'content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: `The request body is over the ${MAX_BODY_BYTES} byte limit` })
  }
  try {
    return await readRawBody(event, 'utf8')
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'The request body could not be read' })
  }
}

/** Throws the h3 error for a refused body */
export function throwRefusal(refusal: Refusal, extra?: Record<string, unknown>): never {
  throw createError({ statusCode: refusal.status, statusMessage: refusal.message, data: extra })
}
