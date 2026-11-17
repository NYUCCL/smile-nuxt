import { and, eq, lt, sql } from 'drizzle-orm'
import type { useDB } from './db'
import { participants, privateData, consoleLogs, interactionChunks } from '../database/schema'

type DB = ReturnType<typeof useDB>

/**
 * The largest request body a save may have. Vercel refuses bodies over 4.5 MB
 * before the handler runs; this is the same limit, so local and other hosts
 * behave the same way. (The client's own cap on a record is 4 MB.)
 */
export const MAX_BODY_BYTES = 4_500_000

export type Refusal = { ok: false, status: number, message: string }
export type JsonObject = Record<string, unknown>

function refuse(status: number, message: string): Refusal {
  return { ok: false, status, message }
}

export function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Parses a request body as a JSON object. Never throws.
 * @param raw - The body as received (text), or undefined when there was none
 */
export function parseJsonObject(raw: string | undefined | null): { ok: true, body: JsonObject } | Refusal {
  if (raw === undefined || raw === null || raw === '') return refuse(400, 'The request has no body')
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return refuse(413, `The request body is over the ${MAX_BODY_BYTES} byte limit`)
  }
  let body: unknown
  try {
    body = JSON.parse(raw)
  }
  catch {
    return refuse(400, 'The request body is not valid JSON')
  }
  if (!isJsonObject(body)) return refuse(400, 'The request body must be a JSON object')
  return { ok: true, body }
}

export interface ParsedSave {
  data: JsonObject
  /** Absent when the client didn't send one (leave the stored value) */
  resume?: JsonObject
  /** Absent from clients older than the sync engine */
  rev?: number
}

/**
 * Checks the body of a save: `{ data, resume?, rev? }`. Never throws.
 * - `data` must be an object (the record).
 * - `resume`, when sent, must be an object.
 * - `rev`, when sent, must be a positive integer.
 */
export function parseSaveBody(raw: string | undefined | null): { ok: true, save: ParsedSave } | Refusal {
  const parsed = parseJsonObject(raw)
  if (!parsed.ok) return parsed
  const { data, resume, rev } = parsed.body
  if (data === undefined) return refuse(400, 'Missing "data"')
  if (!isJsonObject(data)) return refuse(400, '"data" must be a JSON object')
  if (resume !== undefined && resume !== null && !isJsonObject(resume)) return refuse(400, '"resume" must be a JSON object')
  if (rev !== undefined && rev !== null && !(typeof rev === 'number' && Number.isSafeInteger(rev) && rev > 0)) {
    return refuse(400, '"rev" must be a positive integer')
  }
  const save: ParsedSave = { data }
  if (isJsonObject(resume)) save.resume = resume
  if (typeof rev === 'number') save.rev = rev
  return { ok: true, save }
}

/**
 * Checks a body that carries only `{ data }` (creating a participant, private
 * data). `data` may be absent (stored as `{}`); otherwise it must be an object.
 */
export function parseDataBody(raw: string | undefined | null): { ok: true, data: JsonObject } | Refusal {
  const parsed = parseJsonObject(raw)
  if (!parsed.ok) return parsed
  const { data } = parsed.body
  if (data === undefined || data === null) return { ok: true, data: {} }
  if (!isJsonObject(data)) return refuse(400, '"data" must be a JSON object')
  return { ok: true, data }
}

export interface StatusColumns {
  consented: boolean | null
  done: boolean | null
  withdrawn: boolean | null
  recruitmentService: string | null
  startedAt: number | null
  endedAt: number | null
}

const bool = (v: unknown) => (typeof v === 'boolean' ? v : null)
const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER ? Math.trunc(v) : null)

/**
 * The status columns for a record. A missing value or one of the wrong type
 * gives null; this never throws, so an odd record can't fail a save.
 */
export function statusFromData(data: unknown): StatusColumns {
  const d: JsonObject = isJsonObject(data) ? data : {}
  return {
    consented: bool(d.consented),
    done: bool(d.done),
    withdrawn: bool(d.withdrawn),
    recruitmentService: typeof d.recruitmentService === 'string' ? d.recruitmentService.slice(0, 100) : null,
    startedAt: time(d.starttime),
    endedAt: time(d.endtime),
  }
}

export type SaveResult
  = | { ok: true, rev: number, duplicate?: boolean }
    | { ok: false, status: 404, message: string }
    | { ok: false, status: 409, message: string, rev: number }

/**
 * Stores a save if it's newer than what the row holds.
 *
 * - With a `rev`: stored when `rev` is above the row's. An equal `rev` with
 *   the same content is a resend (the first response was lost) and succeeds
 *   without writing. Otherwise 409 with the row's `rev`.
 * - Without a `rev` (clients older than the sync engine): always stored, as
 *   the row's `rev + 1`.
 *
 * The write is one UPDATE whose WHERE holds the rev check, so two saves
 * arriving together can't both win.
 */
export async function saveParticipant(db: DB, id: string, save: ParsedSave): Promise<SaveResult> {
  const dataText = JSON.stringify(save.data)
  const values = {
    data: save.data,
    ...(save.resume !== undefined ? { resume: save.resume } : {}),
    ...statusFromData(save.data),
    dataBytes: Buffer.byteLength(dataText, 'utf8'),
    oversize: false,
    lastError: null,
    saveCount: sql`${participants.saveCount} + 1`,
    updatedAt: new Date(),
  }

  if (save.rev === undefined) {
    const updated = await db.update(participants)
      .set({ ...values, rev: sql`${participants.rev} + 1` })
      .where(eq(participants.id, id))
      .returning({ rev: participants.rev })
    if (updated.length === 0) return { ok: false, status: 404, message: 'Participant not found' }
    return { ok: true, rev: updated[0]!.rev }
  }

  const updated = await db.update(participants)
    .set({ ...values, rev: save.rev })
    .where(and(eq(participants.id, id), lt(participants.rev, save.rev)))
    .returning({ rev: participants.rev })
  if (updated.length > 0) return { ok: true, rev: updated[0]!.rev }

  const row = await db.select({ rev: participants.rev, data: participants.data, resume: participants.resume })
    .from(participants).where(eq(participants.id, id)).get()
  if (!row) return { ok: false, status: 404, message: 'Participant not found' }
  if (row.rev === save.rev
    && JSON.stringify(row.data) === dataText
    && (save.resume === undefined || JSON.stringify(row.resume ?? null) === JSON.stringify(save.resume))) {
    return { ok: true, rev: row.rev, duplicate: true }
  }
  return { ok: false, status: 409, message: `The server has rev ${row.rev}; this save has rev ${save.rev}`, rev: row.rev }
}

/**
 * Whether a body is the client's report that its record is too large to
 * send: `{ oversize: true, dataBytes }`, with no `data`.
 */
export function parseOversizeReport(body: JsonObject): { dataBytes: number | null } | null {
  if (body.oversize !== true || body.data !== undefined) return null
  const bytes = body.dataBytes
  return { dataBytes: typeof bytes === 'number' && Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null }
}

/**
 * Records that a participant's record is too large to be sent. The stored
 * record and its `rev` are left as they are.
 * @returns whether the participant exists
 */
export async function markOversize(db: DB, id: string, dataBytes: number | null): Promise<boolean> {
  const updated = await db.update(participants)
    .set({
      oversize: true,
      lastError: `The record${dataBytes === null ? '' : ` (${dataBytes} bytes)`} is over the size limit and was not sent`,
      updatedAt: new Date(),
    })
    .where(eq(participants.id, id))
    .returning({ id: participants.id })
  return updated.length > 0
}

/**
 * Whether a body is the client's report that it has made all the sends it
 * is allowed (VITE_MAX_WRITES) and has stopped saving by itself:
 * `{ limit: true, sends }`, with no `data`.
 */
export function parseLimitReport(body: JsonObject): { sends: number | null } | null {
  if (body.limit !== true || body.data !== undefined) return null
  const sends = body.sends
  return { sends: typeof sends === 'number' && Number.isSafeInteger(sends) && sends >= 0 ? sends : null }
}

/**
 * Records that a participant's browser reached its limit of sends. The
 * stored record and its `rev` are left as they are.
 * @returns whether the participant exists
 */
export async function markSendLimit(db: DB, id: string, sends: number | null): Promise<boolean> {
  const updated = await db.update(participants)
    .set({
      lastError: `The browser reached its limit of saves${sends === null ? '' : ` (${sends})`} and stopped saving by itself`,
      updatedAt: new Date(),
    })
    .where(eq(participants.id, id))
    .returning({ id: participants.id })
  return updated.length > 0
}

/**
 * Stores a participant's private data, creating the row if there isn't one
 * (one row per participant). The top-level parts sent replace the stored
 * ones; parts not sent are kept. (A page that was reloaded may not know them
 * all: the server never sends private data back to the browser.) Returns the
 * row's id, or null when the participant doesn't exist.
 */
export async function savePrivateData(db: DB, participantId: string, incoming: JsonObject, newId: string): Promise<string | null> {
  const participant = await db.select({ id: participants.id }).from(participants).where(eq(participants.id, participantId)).get()
  if (!participant) return null
  const existing = await db.select({ data: privateData.data }).from(privateData).where(eq(privateData.participantId, participantId)).get()
  const data: JsonObject = { ...(isJsonObject(existing?.data) ? existing.data : {}), ...incoming }
  const now = new Date()
  const rows = await db.insert(privateData)
    .values({ id: newId, participantId, data, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: privateData.participantId, set: { data, updatedAt: now } })
    .returning({ id: privateData.id })
  return rows[0]!.id
}

/**
 * Deletes a participant and everything stored under them, in one transaction.
 * (The newer tables cascade, but the first tables' foreign keys don't, and a
 * database may not enforce foreign keys at all.)
 * @returns whether the participant existed
 */
export async function deleteParticipant(db: DB, id: string): Promise<boolean> {
  return await db.transaction(async (tx) => {
    await tx.delete(interactionChunks).where(eq(interactionChunks.participantId, id))
    await tx.delete(consoleLogs).where(eq(consoleLogs.participantId, id))
    await tx.delete(privateData).where(eq(privateData.participantId, id))
    const gone = await tx.delete(participants).where(eq(participants.id, id)).returning({ id: participants.id })
    return gone.length > 0
  })
}
