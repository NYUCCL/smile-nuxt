// @ts-check
/**
 * @module sync/snapshot
 * @description The participant's snapshot (plans/sync_engine.md, step 3).
 *
 * One value in localStorage holds everything a reload needs:
 *
 *   { v, participantId, rev, savedRev, local, private, data, resume }
 *
 * - `data`: the record (what analysis reads).
 * - `resume`: where the participant is: the current View, each view's stepper
 *   state, conditions and the other values a reload restores.
 * - `rev`: goes up by one whenever `data` or `resume` changes. `savedRev` is
 *   the last `rev` the server confirmed.
 * - `local`: values that stay on this device (write counters, the reset flag).
 * - `private`: the participant's private data (recruitment ids, the withdraw
 *   form), so a reload doesn't lose it. The server has no way to read it back.
 *
 * `data` and `resume` are written together, in one `setItem`, so the record
 * and the position can't disagree after a reload.
 *
 * Everything here is plain functions with no Vue or Pinia, and nothing here
 * throws: a copy that doesn't parse or has the wrong shape is skipped, with a
 * note saying why.
 */
import { safeStringify } from '../../utils/plainJSON.js'

export const SNAPSHOT_VERSION = 1

/**
 * The record: what analysis reads. Its fields are the experiment's.
 * @typedef {Record<string, unknown>} DataRecord
 */

/**
 * Where the participant is, as cleanResume returns it: each part is there
 * only when it was stored with the right type.
 * @typedef {object} Resume
 * @property {string} [view] - The current View
 * @property {Record<string, unknown>} [viewSteppers] - Each View's stepper state, by View
 * @property {Record<string, unknown>} [conditions] - The assigned conditions
 * @property {Record<string, unknown>} [randomizedRoutes] - The order of randomized routes
 * @property {Record<string, unknown>} [possibleConditions] - The conditions that can be assigned
 * @property {boolean} [verifiedVisibility] - The window's visibility was checked
 * @property {boolean} [useSeed] - Randomization is seeded
 */

/**
 * The values that stay on this device.
 * @typedef {object} LocalValues
 * @property {boolean} [reset] - A reset was asked for
 * @property {number} [totalWrites] - How many times the record was written
 * @property {number} [totalSends] - How many sends this browser has made
 * @property {number|null} [lastWrite] - When the record was last written
 * @property {number} [approxDataSize] - The record's size, roughly, in bytes
 */

/** Parts of `localState` that are part of `resume` (with `view`, the current View). */
export const RESUME_KEYS = [
  'viewSteppers',
  'conditions',
  'randomizedRoutes',
  'possibleConditions',
  'verifiedVisibility',
  'useSeed',
]

/**
 * Parts of `localState` kept on this device only.
 * @type {Array<keyof LocalValues>}
 */
export const LOCAL_KEYS = ['reset', 'totalWrites', 'totalSends', 'lastWrite', 'approxDataSize']

/**
 * Where a copy the server refused as out of date is kept (a 409: the server
 * held something newer). It is not read back by the app; it is there so the
 * work in it can be recovered by hand. One copy: a later conflict replaces it.
 * @param {string} key - The snapshot's key
 * @returns {string} The key of the set-aside copy
 */
export function conflictCopyKey(key) {
  return key + '_conflict'
}

/**
 * The key the data backup used before the snapshot (#42), next to the main key.
 * @param {string} key - The snapshot's key
 * @returns {string} The key of the old data backup
 */
export function legacyDataKey(key) {
  return `${key}-data`
}

/**
 * @param {unknown} value - Anything
 * @returns {value is Record<string, unknown>} True for an object that is not null and not a list
 */
export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {any} value - Anything. Typed `any` because Number.isSafeInteger does
 *   not tell the type checker that the value is a number, and the comparison
 *   after it needs one
 * @returns {value is number} True for a whole number, 0 or more
 */
function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0
}

/** @type {Record<keyof Resume, (v: unknown) => boolean>} */
const RESUME_CHECKS = {
  view: v => typeof v === 'string' && v.length > 0,
  viewSteppers: isPlainObject,
  conditions: isPlainObject,
  randomizedRoutes: isPlainObject,
  possibleConditions: isPlainObject,
  verifiedVisibility: v => typeof v === 'boolean',
  useSeed: v => typeof v === 'boolean',
}

/** @type {Record<keyof LocalValues, (v: unknown) => boolean>} */
const LOCAL_CHECKS = {
  reset: v => typeof v === 'boolean',
  totalWrites: isCount,
  totalSends: isCount,
  lastWrite: v => v === null || (typeof v === 'number' && Number.isFinite(v)),
  approxDataSize: isCount,
}

/**
 * The usable parts of a stored `resume`. A part with the wrong type is left
 * out (the store keeps its own value for it) and named in `notes`.
 * @param {unknown} raw - What was stored
 * @param {string} [label] - Which copy, for the notes
 * @returns {{ resume: Resume|null, notes: string[] }} `resume` is null when
 *   nothing in it could be used
 */
export function cleanResume(raw, label = 'resume') {
  /** @type {string[]} */
  const notes = []
  if (raw === null || raw === undefined) return { resume: null, notes }
  if (!isPlainObject(raw)) {
    notes.push(`${label} is not an object`)
    return { resume: null, notes }
  }
  /** @type {Resume} */
  const resume = {}
  // The casts below add parentheses only. Object.keys is typed as string[];
  // these are RESUME_CHECKS's keys.
  for (const key of /** @type {Array<keyof Resume>} */ (Object.keys(RESUME_CHECKS))) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue
    if (!RESUME_CHECKS[key](raw[key])) {
      notes.push(`${label}.${key} has the wrong type`)
      continue
    }
    // The value passed the check for this key, which the type checker can't follow
    /** @type {Record<string, unknown>} */ (resume)[key] = raw[key]
  }
  if (resume.viewSteppers) {
    // One damaged entry must not take the others with it
    /** @type {Record<string, unknown>} */
    const steppers = {}
    for (const view of Object.keys(resume.viewSteppers)) {
      if (isPlainObject(resume.viewSteppers[view])) steppers[view] = resume.viewSteppers[view]
      else notes.push(`${label}.viewSteppers.${view} is not an object`)
    }
    resume.viewSteppers = steppers
  }
  return { resume: Object.keys(resume).length ? resume : null, notes }
}

/**
 * The usable device-only values of what was stored.
 * @param {unknown} raw - What was stored
 * @returns {LocalValues} The values with the right type (others are left out)
 */
function cleanLocal(raw) {
  /** @type {LocalValues} */
  const local = {}
  if (!isPlainObject(raw)) return local
  for (const key of LOCAL_KEYS) {
    // The cast adds parentheses only: the value passed the check for this
    // key, which the type checker can't follow
    if (Object.prototype.hasOwnProperty.call(raw, key) && LOCAL_CHECKS[key](raw[key])) /** @type {Record<string, unknown>} */ (local)[key] = raw[key]
  }
  return local
}

/**
 * Reads one key and parses it. Never throws.
 * @param {Pick<Storage, 'getItem'>} storage - localStorage (or anything with getItem)
 * @param {string} key - The key
 * @returns {{ readonly found: boolean, readonly value?: unknown, readonly error?: string }}
 *   `found` is false when nothing is stored there; `error` when it couldn't
 *   be read or parsed
 */
function readJSON(storage, key) {
  let raw
  try {
    raw = storage.getItem(key)
  }
  catch (err) {
    return { found: false, error: `could not read ${key}: ${err}` }
  }
  if (raw === null || raw === undefined) return { found: false }
  try {
    return { found: true, value: JSON.parse(raw) }
  }
  catch {
    return { found: true, error: `${key} does not parse as JSON` }
  }
}

/**
 * @typedef {object} LocalCopy
 * @property {'none'|'v1'|'old'|'bad'} format - 'old' is what was stored before
 *   the snapshot: `localState` under the key and the data backup next to it
 * @property {string|null} participantId - Whose copy this is. In the old
 *   format only `data` says; its `resume` could be anyone's
 * @property {number} rev - Its rev (0 when it has none)
 * @property {number} savedRev - The last rev it says the server confirmed
 * @property {DataRecord|null} data - The record, or null when it can't be used
 * @property {Resume|null} resume - The usable parts of the position
 * @property {LocalValues} local - The device-only values
 * @property {Record<string, unknown>|null} private - The private data (the parts that held something)
 * @property {string[]} notes - What was skipped, and why
 */

/**
 * Reads the local copy. Never throws.
 * @param {Pick<Storage, 'getItem'>|null|undefined} storage - localStorage (or anything with getItem)
 * @param {string} key - The snapshot's key
 * @returns {LocalCopy} What could be read
 */
export function readLocalCopy(storage, key) {
  /** @type {LocalCopy} */
  const copy = {
    format: 'none',
    participantId: null,
    rev: 0,
    savedRev: 0,
    data: null,
    resume: null,
    local: {},
    private: null,
    notes: [],
  }
  if (!storage || typeof storage.getItem !== 'function') return copy

  const main = readJSON(storage, key)
  if (main.error) copy.notes.push(main.error)

  if (main.found && !main.error && isPlainObject(main.value) && typeof main.value.v === 'number') {
    const value = main.value
    copy.format = 'v1'
    if (typeof value.participantId === 'string' && value.participantId) copy.participantId = value.participantId
    else if (value.participantId !== null && value.participantId !== undefined) copy.notes.push('local copy: participantId has the wrong type')
    if (isCount(value.rev)) copy.rev = value.rev
    else copy.notes.push('local copy: rev is not a count, using 0')
    copy.savedRev = isCount(value.savedRev) ? Math.min(value.savedRev, copy.rev) : 0
    if (isPlainObject(value.data)) copy.data = value.data
    else if (value.data !== null && value.data !== undefined) copy.notes.push('local copy: data is not an object')
    const cleaned = cleanResume(value.resume, 'local copy: resume')
    copy.resume = cleaned.resume
    copy.notes.push(...cleaned.notes)
    copy.local = cleanLocal(value.local)
    if (isPlainObject(value.private)) copy.private = value.private
    return copy
  }

  // Before the snapshot: localState under the key, the data backup beside it
  const backup = readJSON(storage, legacyDataKey(key))
  if (backup.error) copy.notes.push(backup.error)
  const hasOldState = main.found && !main.error && isPlainObject(main.value)
  const hasOldBackup = backup.found && !backup.error && isPlainObject(backup.value)

  if (main.found && !main.error && !hasOldState) copy.notes.push('local copy is not an object')
  if (!hasOldState && !hasOldBackup) {
    if (main.found || backup.found) copy.format = 'bad'
    return copy
  }

  copy.format = 'old'
  if (hasOldState) {
    const cleaned = cleanResume(main.value, 'local copy (old format)')
    copy.resume = cleaned.resume
    copy.notes.push(...cleaned.notes)
    copy.local = cleanLocal(main.value)
  }
  if (hasOldBackup) {
    const value = backup.value
    if (typeof value.participantId === 'string' && value.participantId && isPlainObject(value.data)) {
      copy.participantId = value.participantId
      copy.data = value.data
      copy.rev = isCount(value.rev) ? value.rev : 0
      copy.savedRev = isCount(value.savedRev) ? Math.min(value.savedRev, copy.rev) : 0
    }
    else {
      copy.notes.push('local data backup (old format) could not be used')
    }
  }
  return copy
}

/**
 * @typedef {object} Choice
 * @property {'local'|'server'|'fresh'|'none'} source - Where `data` comes
 *   from. 'fresh': neither copy's data could be used, so the store keeps the
 *   record it started with. 'none': the server couldn't be reached and there
 *   is no local copy, so nothing is loaded and the load is tried again later.
 * @property {DataRecord|null} data - The record to use
 * @property {Resume|null} resume - The position to use
 * @property {number} rev - The rev to go on from
 * @property {number} savedRev - The rev the server has
 * @property {boolean} send - The chosen copy is ahead of the server
 * @property {string[]} notes - What was skipped, and why
 */

/**
 * Chooses between the local copy and the server's copy when a participant's
 * page loads: the one with the higher `rev` wins, `data` and `resume`
 * together. A copy that is missing, doesn't parse, or belongs to someone else
 * is skipped. Never throws.
 *
 * @param {object} args
 * @param {string} args.participantId - The participant this page belongs to
 * @param {LocalCopy} args.local - From readLocalCopy
 * @param {{ ok: boolean, data?: unknown, rev?: unknown, resume?: unknown }} args.server - The
 *   server's answer; `ok: false` when it couldn't be reached
 * @returns {Choice} The copy to use
 */
export function chooseCopy({ participantId, local, server }) {
  const notes = [...(local?.notes || [])]

  // --- what can be used from each copy ---
  // An old-format position doesn't say whose it is; everything else must
  // belong to this participant.
  const readable = !!local && (local.format === 'v1' || local.format === 'old')
  const mine = readable && local.participantId === participantId
  const localData = mine && local.data ? local.data : null
  const localResume = readable && local.resume && (mine || local.format === 'old') ? local.resume : null
  if (readable && !mine && (local.data || (local.resume && !localResume))) {
    notes.push('local copy belongs to another participant, not used')
  }
  const localRev = localData ? local.rev : 0

  const reached = !!server?.ok
  const serverData = reached && isPlainObject(server.data) ? server.data : null
  const serverRev = reached && isCount(server.rev) ? server.rev : 0
  /** @type {Resume|null} */
  let serverResume = null
  if (reached) {
    const cleaned = cleanResume(server.resume, 'server copy: resume')
    serverResume = cleaned.resume
    notes.push(...cleaned.notes)
    if (!serverData) notes.push('server copy: data is not an object')
  }

  // Once the server has answered, what it has is its own rev
  /**
   * @param {Choice['source']} source - Where `data` comes from
   * @param {number} rev - The rev to go on from
   * @returns {Choice} The choice
   */
  const choice = (source, rev) => ({
    source,
    data: source === 'local' ? localData : source === 'server' ? serverData : null,
    resume: source === 'server' ? serverResume || localResume : localResume || serverResume,
    rev,
    savedRev: reached ? serverRev : (localData ? local.savedRev : 0),
    send: reached ? rev > serverRev : source === 'local',
    notes,
  })

  if (!reached) {
    notes.push(localData ? 'server not reached, using the local copy' : 'server not reached and no local copy')
    return localData ? choice('local', localRev) : choice('none', 0)
  }
  if (!serverData) {
    if (localData) return choice('local', Math.max(localRev, serverRev + 1))
    notes.push('neither copy could be used: the record starts again and the current View restarts')
    return choice('fresh', serverRev + 1)
  }
  if (localData && local.format === 'old') {
    // The old backup counted changes and the server counted saves, so the
    // two numbers can't be compared. The old rule: unsaved changes win.
    if (localRev > local.savedRev) {
      notes.push('local copy (old format) has unsaved changes, using it')
      return choice('local', Math.max(localRev, serverRev + 1))
    }
  }
  else if (localData && localRev >= serverRev) {
    return choice('local', localRev)
  }
  if (localData) notes.push(`server copy is newer (rev ${serverRev}, local ${localRev}), using it`)
  if (!serverResume && localResume) notes.push('server copy has no resume, keeping the local position')
  return choice('server', serverRev)
}

/**
 * Makes a loaded record safe for the code that appends to it: every list or
 * object the starting record has must still be one, and `pageData_*` fields
 * must have the shape recordPageData writes. A part with the wrong shape is
 * replaced by an empty one. The rest of the record is left as it is.
 * @param {unknown} data - A loaded record (changed in place)
 * @param {DataRecord} template - The record a new participant starts with
 * @returns {{ data: DataRecord|null, notes: string[] }} The record, and what
 *   was replaced. `data` is null when what was passed is not an object
 */
export function repairData(data, template) {
  /** @type {string[]} */
  const notes = []
  if (!isPlainObject(data)) return { data: null, notes: ['record is not an object'] }
  for (const key of Object.keys(template || {})) {
    const expected = template[key]
    if (Array.isArray(expected) && !Array.isArray(data[key])) {
      if (data[key] !== undefined) notes.push(`${key} was not a list, replaced with an empty one`)
      data[key] = []
    }
    else if (isPlainObject(expected) && !isPlainObject(data[key])) {
      if (data[key] !== undefined) notes.push(`${key} was not an object, replaced`)
      data[key] = { ...expected }
    }
  }
  // recordRoute and recordPageData read fields of each entry
  if (Array.isArray(data.routeOrder) && data.routeOrder.some(entry => !isPlainObject(entry))) {
    notes.push('routeOrder had entries that were not objects, removed')
    data.routeOrder = data.routeOrder.filter(isPlainObject)
  }
  for (const key of Object.keys(data)) {
    if (!key.startsWith('pageData_')) continue
    if (!isPlainObject(data[key])) {
      notes.push(`${key} was not an object, replaced with an empty one`)
      data[key] = {}
      continue
    }
    for (const visit of Object.keys(data[key])) {
      const entry = data[key][visit]
      if (!isPlainObject(entry)) {
        notes.push(`${key}.${visit} was not an object, replaced with an empty visit`)
        data[key][visit] = { timestamps: [], data: [] }
        continue
      }
      if (!Array.isArray(entry.timestamps)) {
        notes.push(`${key}.${visit}.timestamps was not a list, replaced`)
        entry.timestamps = []
      }
      if (!Array.isArray(entry.data)) {
        notes.push(`${key}.${visit}.data was not a list, replaced`)
        entry.data = []
      }
    }
  }
  return { data, notes }
}

/**
 * `resume` from the store's state.
 * @param {unknown} view - The current View (the cookie's lastRoute); anything
 *   that is not a string is stored as null
 * @param {Record<string, unknown>|null|undefined} localState - store.localState
 * @returns {Record<string, unknown>} The resume object: `view` and the
 *   RESUME_KEYS parts, as the store has them (not checked)
 */
export function buildResume(view, localState) {
  /** @type {Record<string, unknown>} */
  const resume = { view: typeof view === 'string' ? view : null }
  for (const key of RESUME_KEYS) resume[key] = localState?.[key]
  return resume
}

/**
 * The part of `resume` sent to the server: everything, but only the current
 * View's stepper. Stepper state holds every step's data, and the steppers of
 * Views already finished would be uploaded again with each save. The local
 * copy keeps them all.
 * @param {unknown} resume - The whole resume
 * @returns {Record<string, unknown>} The part to send (empty when `resume` is not an object)
 */
export function resumeForServer(resume) {
  if (!isPlainObject(resume)) return {}
  const steppers = isPlainObject(resume.viewSteppers) ? resume.viewSteppers : {}
  /** @type {Record<string, unknown>} */
  const viewSteppers = {}
  if (typeof resume.view === 'string' && Object.prototype.hasOwnProperty.call(steppers, resume.view)) {
    viewSteppers[resume.view] = steppers[resume.view]
  }
  return { ...resume, viewSteppers }
}

/**
 * The parts of the private data that hold something. Empty parts are left
 * out so that a page that never learned them (a reload without the local
 * copy) can't replace what the server has: the server merges what it's sent.
 * @param {unknown} priv - store.private
 * @returns {Record<string, unknown>} The parts to keep and send
 */
export function privateParts(priv) {
  /** @type {Record<string, unknown>} */
  const parts = {}
  if (!isPlainObject(priv)) return parts
  for (const key of Object.keys(priv)) {
    const value = priv[key]
    if (value === null || value === undefined) continue
    if (isPlainObject(value) && Object.keys(value).length === 0) continue
    parts[key] = value
  }
  return parts
}

/**
 * JSON text for the two parts that carry a `rev`. Never throws.
 * @param {object|null|undefined} data - The record, or null when it isn't part of the snapshot yet
 * @param {object} resume - The position
 * @returns {{ ok: boolean, dataText: string, resumeText: string, cleaned: boolean }}
 *   `ok` is false when a part didn't come out as a JSON object (the caller
 *   keeps the last snapshot that worked); `cleaned` when a value JSON can't
 *   hold had to be replaced
 */
export function serializeParts(data, resume) {
  const d = data === null || data === undefined ? { text: 'null', cleaned: false } : safeStringify(data)
  const r = safeStringify(resume)
  const dataOk = d.text === 'null' ? (data === null || data === undefined) : d.text.startsWith('{')
  return {
    ok: dataOk && r.text.startsWith('{'),
    dataText: d.text,
    resumeText: r.text,
    cleaned: d.cleaned || r.cleaned,
  }
}

/**
 * The text stored under the snapshot's key, built from the parts' texts so
 * the record is serialized once.
 * @param {object} parts - What goes into the value
 * @param {string|null} parts.participantId - Whose snapshot it is
 * @param {number} parts.rev - Its rev
 * @param {number} parts.savedRev - The last rev the server confirmed
 * @param {unknown} parts.local - The device-only values (others are left out)
 * @param {string} parts.dataText - The record's JSON text
 * @param {string} parts.resumeText - The position's JSON text
 * @param {string} [parts.privateText] - The private data's JSON text
 * @returns {string} JSON text
 */
export function snapshotText({ participantId, rev, savedRev, local, dataText, resumeText, privateText }) {
  return '{"v":' + SNAPSHOT_VERSION
    + ',"participantId":' + JSON.stringify(typeof participantId === 'string' ? participantId : null)
    + ',"rev":' + (isCount(rev) ? rev : 0)
    + ',"savedRev":' + (isCount(savedRev) ? savedRev : 0)
    + ',"local":' + safeStringify(cleanLocal(local)).text
    + ',"private":' + (privateText || '{}')
    + ',"data":' + dataText
    + ',"resume":' + resumeText
    + '}'
}

/**
 * The body of a save: `{ rev, data, resume }`, with `private` when the
 * private data is to go with it.
 * @param {object} parts - What goes into the body
 * @param {number} parts.rev - The snapshot's rev
 * @param {string} parts.dataText - The record's JSON text
 * @param {string} parts.resumeText - The position's JSON text
 * @param {string|null} [parts.privateText] - The private data's JSON text, or null to leave it out
 * @returns {string} JSON text
 */
export function saveBodyText({ rev, dataText, resumeText, privateText = null }) {
  return '{"rev":' + rev + ',"data":' + dataText + ',"resume":' + resumeText
    + (privateText ? ',"private":' + privateText : '') + '}'
}
