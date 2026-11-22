/**
 * @module sync/engine
 * @description Saves and loads a participant's record for the smilestore
 * (stores/smilestore.js). Each function here takes the store as its first
 * argument; the store has an action of the same name that calls it, and
 * that action is what the rest of the code uses.
 *
 * - The local snapshot: captureSnapshot() writes the record and the position
 *   to localStorage as one value; requestSnapshot() asks for that a moment
 *   after a change; restoreLocal() reads it when the page starts.
 * - The server: createParticipant() makes the row, sendSnapshot() sends one
 *   save, and the sync loop (core/sync/loop.js, made by syncLoop() below)
 *   decides when to send. sync(), saveOnClose() and networkChanged() tell
 *   the loop what happened.
 * - Loading: loadData() compares the local copy with the server's and uses
 *   the newer one.
 * - Stopping: pauseForOtherTab(), stopSnapshots(), clearLocalSnapshot(),
 *   continueAsNewRow() and resetOrphanedUser().
 *
 * The functions call each other through the store's actions
 * (`store.captureSnapshot()`), not directly.
 *
 * This file must not import stores/smilestore.js: that file imports this one.
 * What both need is in stores/initial-state.js.
 */
import { navigateTo } from '#imports'
import appconfig from '../config.js'
import useLog from '../../stores/log.js'
import { snapshotKey, freshLocalState, freshData, freshPrivate } from '../../stores/initial-state.js'
import { BAD_TOKEN, NO_PARTICIPANT } from '../../shared/save-answers.js'
import { gzipText } from './compress.js'
import { addWarnings, safeStringify } from '../../utils/plainJSON.js'
import {
  readLocalCopy, chooseCopy, repairData, buildResume, resumeForServer, privateParts,
  serializeParts, snapshotText, saveBodyText, legacyDataKey, conflictCopyKey, isPlainObject,
  RESUME_KEYS, LOCAL_KEYS,
} from './snapshot.js'
import { createSyncLoop, classify } from './loop.js'

// How long a save may take before it counts as failed and is tried again
const SEND_TIMEOUT = 30_000

// The local snapshot is written a moment after a change, so that everything
// one event does (a keypress sets the step's data, records the trial and moves
// to the next step, in several separate microtasks) ends in one write. The
// wait is at least SNAPSHOT_MIN_DELAY ms and grows with what the last write
// cost, so that writing a large record takes at most about a tenth of the
// main thread's time. The page being hidden or closed, and every save to the
// server, write at once. Sending to the server is the sync loop's job
// (core/sync/loop.js): it is told when a write found something new.
const SNAPSHOT_MIN_DELAY = 4
const SNAPSHOT_MAX_DELAY = 2000
const SNAPSHOT_COST_FACTOR = 10

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

// Waits (ms) before asking the server again when a load found no copy at all
export const LOAD_RETRY_DELAYS = [300, 900]

/**
 * The engine's private state, one object per store. Not reactive (the
 * record's text can be large). Keyed by the store's state object, not the
 * store: in development Pinia calls each action with a new wrapper around the
 * store as `this`, and the state object is the same through all of them.
 * clearLocalSnapshot() deletes a store's entry, so the next use starts from
 * the initial values in captureState().
 */
const captured = new WeakMap()

/**
 * The engine's private state for a store, made with its initial values when
 * the store has none.
 * @param {object} store - The smilestore
 * @returns {object} The state (every field is listed below)
 */
function captureState(store) {
  let state = captured.get(store.$state)
  if (!state) {
    state = {
      // The last snapshot captured, as text, to tell whether anything changed
      dataText: null, // the record
      resumeText: null, // the position
      privateText: null, // the private data (null until the record is the participant's own)
      // The private data text the server last confirmed (null: none yet on this page)
      privateSent: null,
      // The private data put in the save body being sent: `{ rev, text }`, or null
      privateInBody: null,
      // The snapshot text last written to localStorage (null: none, or the last write failed)
      written: null,
      // How long the last captureSnapshot() took, in ms; sets the wait before the next write
      cost: 0,
      // The timeout id of a write requestSnapshot() has scheduled, or null
      timer: null,
      // stopSnapshots() was called: nothing more is captured, written or sent
      stopped: false,
      // The store's sync loop (core/sync/loop.js), made by syncLoop() when first needed
      loop: null,
      // The promise of the request that creates the participant's row, while it is in flight
      creating: null,
      // A gzipped save was refused: this page's saves are sent as plain text
      plainOnly: false,
      // The record's size (bytes) when the server was last told it is over the limit; 0: never
      oversizeReported: 0,
      // The old data backup key has been removed from localStorage
      legacyRemoved: false,
      // Each of these messages is logged once, not at every capture:
      warnedFailed: false, // the record could not be turned into JSON
      warnedCleaned: false, // the record held a value JSON can't store
      warnedWrite: false, // the local copy could not be written (cleared when a write works)
    }
    captured.set(store.$state, state)
  }
  return state
}

/**
 * One request to the API, for the sync loop. Never throws.
 * @param {string} url - The route
 * @param {string} method - POST or PATCH
 * @param {string|Uint8Array} body - JSON text, sent gzipped when the browser can (core/sync/compress.js), or bytes that are gzipped already
 * @param {boolean} [keepalive] - Whether the request may outlive the page
 * @param {boolean} [plain] - Send the text as it is, not gzipped
 * @returns {Promise<{ status: number, result?: object, message?: string, serverRev?: number, marker?: string, sentBytes: number }>}
 *   `status` is 0 when there was no answer; `sentBytes` is the size of what was sent
 */
async function request(url, method, body, keepalive = false, plain = false) {
  // What goes over the network: the gzipped bytes, or the text's length
  let sentBytes = body.length
  let zipped = null
  try {
    // A closing page's body is sent as it was given: small text, or bytes
    // the loop gzipped already. Compressing here would take a moment the
    // page may not have.
    zipped = typeof body !== 'string' ? body : keepalive || plain ? null : await gzipText(body)
    if (zipped) sentBytes = zipped.length
    const result = await $fetch(url, {
      method,
      headers: zipped
        ? { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }
        : { 'Content-Type': 'application/json' },
      body: zipped ?? body,
      ...(keepalive ? { keepalive: true } : { timeout: SEND_TIMEOUT }),
    })
    return { status: 200, result, sentBytes, gzipped: !!zipped }
  }
  catch (err) {
    return {
      status: err?.statusCode ?? err?.status ?? 0,
      message: String(err?.data?.statusMessage || err?.statusMessage || err),
      serverRev: err?.data?.data?.rev,
      // The server's own mark on a 403 or 404 (shared/save-answers.js)
      marker: err?.data?.data?.smile,
      sentBytes,
      gzipped: !!zipped,
    }
  }
}

/** The store's sync loop, made when first needed (client only). */
function syncLoop(store) {
  const state = captureState(store)
  if (!state.loop) {
    const log = useLog()
    state.loop = createSyncLoop({
      take: () => {
        const snap = store.captureSnapshot()
        if (!snap || !snap.includeData) return null
        return {
          rev: snap.rev,
          savedRev: store.browserEphemeral.savedRev,
          body: () => {
            // The private data goes with the record when it has changed
            // since the server last confirmed it (once per page even when
            // empty, so every participant has a row)
            const privateText = state.privateText && state.privateText !== state.privateSent ? state.privateText : null
            state.privateInBody = { rev: snap.rev, text: privateText }
            return saveBodyText({ rev: snap.rev, dataText: snap.dataText, resumeText: snap.serverResumeText(), privateText })
          },
        }
      },
      send: (body, options) => store.sendSnapshot(body, options),
      onConfirmed: (rev) => {
        store.browserEphemeral.savedRev = Math.max(store.browserEphemeral.savedRev, rev)
        store.browserEphemeral.unsavedChanges = store.browserEphemeral.rev > store.browserEphemeral.savedRev
        store.localState.totalWrites += 1
        store.localState.lastWrite = Date.now()
      },
      onStatus: (status) => {
        const before = store.browserEphemeral.sync
        if (status.error && status.error.message !== before?.error?.message) {
          log.error('SMILESTORE: save failed (' + status.error.kind + '): ' + status.error.message)
        }
        store.browserEphemeral.sync = status
      },
      onConflict: () => store.pauseForOtherTab('conflict'),
      onGone: (marker) => {
        if (marker === BAD_TOKEN) {
          // The row can't be written from this browser any more. Keep the
          // record and save it as a new row.
          store.continueAsNewRow()
          return true
        }
        log.warn('SMILESTORE: the participant\'s row is gone from the database, resetting to a new user')
        store.resetOrphanedUser()
        return false
      },
      // Not when something on the way has refused gzipped bodies
      compress: text => (state.plainOnly ? null : gzipText(text)),
      sent: () => store.localState.totalSends,
      onSend: () => {
        store.localState.totalSends += 1
      },
      onLimit: (sends) => {
        // Tell the server, so the dashboard can show it. Best effort, and
        // one more request than the limit.
        const id = store.cookieState.participantId
        if (id) request(`/api/participants/${id}`, 'PATCH', JSON.stringify({ limit: true, sends }))
      },
      onOversize: (bytes) => {
        // Tell the server, so the dashboard can show it. Best effort, and
        // not for every change after that: again only when the record has
        // grown by a tenth since the last report.
        if (state.oversizeReported && bytes < state.oversizeReported * 1.1) return
        state.oversizeReported = bytes
        const id = store.cookieState.participantId
        if (id) request(`/api/participants/${id}`, 'PATCH', JSON.stringify({ oversize: true, dataBytes: bytes }))
      },
      isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
      warn: message => log.warn('SMILESTORE: ' + message),
      options: appconfig.maxWrites > 0 ? { maxSends: appconfig.maxWrites } : {},
    })
  }
  return state.loop
}

function browserStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  }
  catch {
    return null // storage blocked by the browser's settings
  }
}

/**
 * Creates the participant's row on the server. One request at a time:
 * a second call while one is in flight gets the same answer.
 * @returns {Promise<{ status: number, message?: string }>} 200 when it exists
 */
export function createParticipant(store) {
  const state = captureState(store)
  if (store.cookieState.participantId) return Promise.resolve({ status: 200 })
  if (!state.creating) {
    state.creating = request('/api/participants', 'POST', safeStringify({ data: store.data }).text)
      .then((res) => {
        state.creating = null
        if (res.status !== 200) return res
        if (typeof res.result?.id !== 'string') return { status: 0, message: 'the server gave no participant id' }
        store.cookieState.participantId = res.result.id
        store.browserEphemeral.savedRev = 0
        return { status: 200 }
      })
  }
  return state.creating
}

/**
 * Sends one save for the sync loop: the record and the position, with
 * the private data in the same body when it changed since it was last
 * confirmed. Creates the participant's row first if the request at
 * consent failed.
 * @param {object} store - The smilestore
 * @param {string|Uint8Array} body - `{ rev, data, resume }` as JSON text (or gzipped, from a closing page)
 * @param {object} [options]
 * @param {boolean} [options.keepalive] - The page is closing
 * @param {number} [options.rev] - The body's rev; the server's answer must carry it
 * @returns {Promise<{ status: number, message?: string, serverRev?: number }>} Never rejects
 */
export async function sendSnapshot(store, body, { keepalive = false, rev } = {}) {
  const state = captureState(store)
  if (!store.cookieState.participantId) {
    // A closing page would never read the answer: the server would make
    // a row, and the next page another. The local copy has the record.
    if (keepalive) return { status: 0, message: 'no participant row yet' }
    const created = await store.createParticipant()
    if (created.status !== 200) return created
  }
  const id = store.cookieState.participantId
  const started = Date.now()
  // The private data this body carries, if any (see the loop's `take`)
  const carried = state.privateInBody?.rev === rev ? state.privateInBody.text : null
  let saved = await request(`/api/participants/${id}`, 'PATCH', body, keepalive, state.plainOnly)
  // Something on the way may refuse or damage gzipped bodies. Send this
  // one again as text, and the rest of this page's saves as text too.
  if (saved.gzipped && typeof body === 'string' && [400, 415].includes(saved.status)) {
    state.plainOnly = true
    useLog().warn('SMILESTORE: a compressed save was refused (' + saved.status + '); sending uncompressed from here on')
    saved = await request(`/api/participants/${id}`, 'PATCH', body, keepalive, true)
  }
  // Only the save route's own answer counts: a 200 from anything else on
  // the way (a wifi sign-in page, a proxy) must not mark the record saved
  if (classify(saved.status) === 'ok' && (saved.result?.success !== true || saved.result.rev !== rev)) {
    saved = { status: 0, message: 'the answer was not the save route\'s', sentBytes: saved.sentBytes }
  }
  // For the dev tools: what the last save cost
  store.browserEphemeral.lastSend = { textBytes: typeof body === 'string' ? body.length : null, sentBytes: saved.sentBytes, ms: Date.now() - started, status: saved.status }
  if (classify(saved.status, saved.marker) !== 'ok') return saved
  if (carried) state.privateSent = carried
  return saved
}

/**
 * Puts a stored `resume` into the store: the stepper states, conditions
 * and the other values a reload restores, and the current View.
 * @param {object} store - The smilestore
 * @param {object} resume - As cleaned by core/sync/snapshot.js
 */
export function applyResume(store, resume) {
  if (!isPlainObject(resume)) return
  for (const key of RESUME_KEYS) {
    if (Object.prototype.hasOwnProperty.call(resume, key)) store.localState[key] = resume[key]
  }
  // The cookie's View is a hint for server rendering; the snapshot's wins
  if (typeof resume.view === 'string' && resume.view) store.cookieState.lastRoute = resume.view
}

/**
 * Reads the local snapshot when the page starts (the store-sync plugin)
 * and restores the position from it. The record itself is restored by
 * loadData(), once the server's copy can be compared with it. A copy that
 * can't be read, or belongs to another participant, is skipped.
 */
export function restoreLocal(store) {
  const storage = browserStorage()
  if (!storage) return
  const log = useLog()
  const local = readLocalCopy(storage, snapshotKey)
  for (const note of local.notes) log.warn('SMILESTORE: ' + note)
  if (local.format === 'none' || local.format === 'bad') return
  const participantId = store.cookieState.participantId || null
  if (local.format === 'v1' && local.participantId !== participantId) {
    log.warn('SMILESTORE: the local copy belongs to another participant, starting without it')
    return
  }
  for (const key of LOCAL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(local.local, key)) store.localState[key] = local.local[key]
  }
  if (local.resume) store.applyResume(local.resume)
  if (local.private) {
    for (const key of Object.keys(store.private)) {
      if (isPlainObject(local.private[key])) store.private[key] = local.private[key]
    }
  }
  if (local.format === 'v1') {
    store.browserEphemeral.rev = local.rev
    store.browserEphemeral.savedRev = local.savedRev
  }
}

/**
 * Loads a known participant's record when the page starts: reads the
 * local copy and the server's, and uses the one with the higher `rev`,
 * record and position together (core/sync/snapshot.js, chooseCopy). A
 * copy that is missing or damaged is skipped. Never throws.
 */
export async function loadData(store) {
  const participantId = store.cookieState.participantId
  const log = useLog()
  const storage = browserStorage()
  if (!participantId) {
    if (!store.cookieState.knownUser || store.browserEphemeral.dataLoaded) return
    // Only the browser has the local copy. (On the server this would
    // mark the record loaded, and the page would keep the empty one.)
    if (typeof window === 'undefined') return
    // Consented, but the request that creates the row failed and the
    // page was reloaded. Go on from the local copy, if it has the
    // record; the sync loop creates the row with its first save.
    const local = storage ? readLocalCopy(storage, snapshotKey) : { format: 'none', notes: [] }
    const choice = chooseCopy({ participantId: null, local, server: { ok: false } })
    if (choice.data) store.data = repairData(choice.data, store.data).data
    store.browserEphemeral.rev = choice.rev
    store.browserEphemeral.savedRev = 0
    store.setDataLoaded()
    store.captureSnapshot()
    return
  }
  const hadFailed = store.browserEphemeral.loadFailed

  // The server refused this browser's token for the row: the row can't
  // be read or written from here any more
  let badToken = false
  let choice
  for (let attempt = 0; ; attempt += 1) {
    let server
    try {
      const result = await $fetch(`/api/participants/${participantId}`)
      server = { ok: true, data: result?.data, rev: result?.rev, resume: result?.resume }
    }
    catch (err) {
      // Only the server's own 403 and 404 say something about this
      // participant (shared/save-answers.js). Any other failure, a 403
      // or 404 from something on the way included, is "no answer".
      const marker = err?.data?.data?.smile
      if (err?.statusCode === 404 && marker === NO_PARTICIPANT) {
        // The cookie names a row the database doesn't have
        log.warn('SMILESTORE: the participant\'s row is not in the database, resetting to a new user')
        store.resetOrphanedUser()
        return
      }
      if (err?.statusCode === 403 && marker === BAD_TOKEN) badToken = true
      else log.error('SMILESTORE: could not load participant data: ' + err)
      server = { ok: false }
    }
    const local = storage ? readLocalCopy(storage, snapshotKey) : { format: 'none', notes: [] }
    choice = chooseCopy({ participantId, local, server })
    // With no copy at all, try the server again before giving up
    if (choice.source !== 'none' || badToken || attempt >= LOAD_RETRY_DELAYS.length) break
    await new Promise(resolve => setTimeout(resolve, LOAD_RETRY_DELAYS[attempt]))
  }
  // The participant was reset, or loaded another way, while this waited
  if (store.cookieState.participantId !== participantId || store.browserEphemeral.dataLoaded) return

  for (const note of choice.notes) log.warn('SMILESTORE: ' + note)

  if (badToken && choice.source === 'none') {
    // Nothing here to keep: start as a new user
    log.warn('SMILESTORE: the participant\'s token was refused and there is no local copy, resetting to a new user')
    store.resetOrphanedUser()
    return
  }

  if (choice.source === 'none') {
    // Nothing to load from. The page shows ReconnectingNotice, which
    // calls this again until it works; the local copy keeps the position
    // but not this record, so it can never be taken for the real one.
    store.browserEphemeral.loadFailed = true
    return
  }

  if (hadFailed && typeof window !== 'undefined') {
    // The page went on without the record after an earlier failure.
    // Start it again from the copy that has now been read, so the record
    // and the position on screen agree.
    log.warn('SMILESTORE: participant data loaded after an earlier failure, reloading the page')
    window.location.reload()
    return
  }

  if (choice.data) {
    const repaired = repairData(choice.data, store.data)
    for (const note of repaired.notes) log.warn('SMILESTORE: loaded record repaired: ' + note)
    store.data = repaired.data
  }
  if (choice.resume) store.applyResume(choice.resume)
  // A row with no saved position (saved by older code, or only created)
  // and no local copy: take the assignments from the record. Otherwise
  // setDataLoaded() would copy the empty defaults over the record's, and
  // the participant would be assigned conditions again.
  for (const key of ['conditions', 'randomizedRoutes']) {
    if (isPlainObject(store.data[key]) && Object.keys(store.data[key]).length > 0 && Object.keys(store.localState[key] ?? {}).length === 0) {
      store.localState[key] = { ...store.data[key] }
    }
  }
  store.browserEphemeral.rev = choice.rev
  store.browserEphemeral.savedRev = choice.savedRev
  store.browserEphemeral.loadFailed = false
  if (choice.source === 'local' && choice.send) {
    log.warn(`SMILESTORE: using the local copy (rev ${choice.rev}); the server has rev ${choice.savedRev}`)
  }
  // The local copy goes on, saved as a new row
  if (badToken) store.continueAsNewRow()
  // A copy was set aside after a conflict: say so in the record, once
  try {
    const noted = conflictCopyKey(snapshotKey) + '_noted'
    const aside = storage && !storage.getItem(noted) ? storage.getItem(conflictCopyKey(snapshotKey)) : null
    if (aside) {
      const rev = Number(/"rev":(\d+)/.exec(aside.slice(0, 200))?.[1]) || 0
      addWarnings(store.data, [{ path: '(save)', issue: `a save was refused as out of date; the copy at rev ${rev} was set aside in the browser, and the page went on from rev ${choice.rev}` }])
      storage.setItem(noted, '1')
    }
  }
  catch {
    // noting it is best effort
  }
  store.setDataLoaded()
  store.captureSnapshot()
  // Not waited for: the page shouldn't wait on the network to start
  if (choice.send || badToken) store.sync()
}

/**
 * The server refused this browser's token for the participant's row (it
 * expired, or the signing secret changed), so the row can't be written
 * from here any more. The record in this browser is kept and saved as a
 * new row; the old row's id is noted in `data.previousParticipantIds` so
 * the two can be matched up.
 */
export function continueAsNewRow(store) {
  const state = captureState(store)
  const previous = store.cookieState.participantId
  if (!previous) return
  useLog().warn('SMILESTORE: the participant\'s token was refused; the record is kept and will be saved as a new row')
  const before = Array.isArray(store.data.previousParticipantIds) ? store.data.previousParticipantIds : []
  store.data.previousParticipantIds = [...before, previous]
  // With no id, the sync loop creates the row with its next save
  store.cookieState.participantId = null
  store.browserEphemeral.savedRev = 0
  store.browserEphemeral.unsavedChanges = true
  state.privateSent = null
}

/**
 * Resets an orphaned user (cookie exists but DB record is missing).
 * Clears cookies and localStorage, then redirects to the welcome page.
 */
export function resetOrphanedUser(store) {
  const log = useLog()
  log.warn('SMILESTORE: Orphaned user detected — clearing state and redirecting to welcome')

  // Reset cookie state to defaults
  store.clearSmileCookies()

  // Clear the local copy
  store.clearLocalSnapshot()

  // Reset local state to defaults, and the record: what is in memory is
  // the previous participant's, and the next consent creates a row from it
  Object.assign(store.localState, freshLocalState())
  store.data = { ...freshData(), smileConfig: store.data.smileConfig }
  store.private = freshPrivate()
  store.browserEphemeral.rev = 0
  store.browserEphemeral.savedRev = 0
  store.browserEphemeral.loadFailed = false
  store.browserEphemeral.dataLoaded = false
  store.browserEphemeral.sync = { status: 'saved', error: null, retryAt: null }

  // Redirect to welcome
  navigateTo('/welcome')
}

/**
 * Sends the snapshot now and waits for the server's answer. The sync
 * loop sends by itself after every change; this is for a point where the
 * experiment needs to know the record has arrived (before sending the
 * participant back to the recruitment site, for example). If the send
 * fails the loop keeps trying after this resolves.
 * @returns {Promise<{ ok: boolean, rev: number, error: string|null }>} Never rejects
 */
export async function sync(store) {
  if (typeof window === 'undefined') return { ok: false, rev: 0, error: 'not in a browser' }
  if (!store.isDataLoaded) {
    const consented = store.data.consented || store.cookieState.consented
    const error = consented ? 'not connected to the server' : 'not consented'
    const log = useLog()
    if (consented) log.error('SMILESTORE: can\'t save data, not connected to server')
    else log.log('SMILESTORE: not saving because not consented')
    return { ok: false, rev: 0, error }
  }
  const result = await syncLoop(store).sync()
  if (result.ok) useLog().success('SMILESTORE: saved (rev ' + result.rev + ')')
  return result
}

/**
 * Takes the snapshot as it is now and writes it to localStorage as one
 * value, now. Changes ask for it with requestSnapshot(), which waits a
 * moment so one event ends in one write; this is called directly when the
 * page is hidden or closing and before anything is sent.
 *
 * `rev` goes up by one when the record or the position differs from the
 * last snapshot taken, so calling this again without a change does
 * nothing. Never throws: a full or blocked localStorage is reported and
 * the copy in memory is still sent to the server.
 *
 * @returns {{ rev: number, includeData: boolean, dataText: string,
 *   resumeText: string, serverResumeText: Function }|null} The snapshot's
 *   texts, or null when nothing was taken
 */
export function captureSnapshot(store) {
  // Browser only: the server's render of a page writes no snapshot and never saves
  if (typeof window === 'undefined') return null
  const state = captureState(store)
  if (state.stopped) return null
  if (state.timer) {
    clearTimeout(state.timer) // this write covers the one that was waiting
    state.timer = null
  }
  const started = now()
  const participantId = store.cookieState.participantId || null
  const loaded = store.browserEphemeral.dataLoaded
  const known = !!participantId || store.cookieState.knownUser
  // A known participant whose stored copy hasn't been read yet: writing
  // now would replace it with the empty record the page starts with.
  if (known && !loaded && !store.browserEphemeral.loadFailed) return null

  const log = useLog()
  // The record is part of the snapshot once it's the participant's own
  // (created, or loaded). Before that only the position is kept.
  const includeData = known && loaded
  const resume = buildResume(store.cookieState.lastRoute, store.localState)
  const parts = serializeParts(includeData ? store.data : null, resume)
  if (!parts.ok) {
    // Keep the last snapshot that worked
    if (!state.warnedFailed) {
      state.warnedFailed = true
      log.error('SMILESTORE: the record could not be turned into JSON; keeping the last snapshot that could')
    }
    return null
  }
  if (parts.cleaned && !state.warnedCleaned) {
    state.warnedCleaned = true
    log.warn('SMILESTORE: the record holds a value JSON can\'t store (written to api.data directly?); it is cleaned each time the record is saved')
  }

  // Private data is sent with the record, so a change to it counts
  const privateText = includeData ? safeStringify(privateParts(store.private)).text : null
  const changed = parts.dataText !== state.dataText || parts.resumeText !== state.resumeText
    || privateText !== state.privateText
  if (changed) {
    store.browserEphemeral.rev += 1
    state.dataText = parts.dataText
    state.resumeText = parts.resumeText
    state.privateText = privateText
  }
  if (includeData) store.localState.approxDataSize = parts.dataText.length
  const rev = store.browserEphemeral.rev
  store.browserEphemeral.unsavedChanges = rev > store.browserEphemeral.savedRev

  const storage = browserStorage()
  if (storage) {
    const text = snapshotText({
      participantId,
      rev,
      savedRev: store.browserEphemeral.savedRev,
      local: store.localState,
      dataText: parts.dataText,
      resumeText: parts.resumeText,
      privateText,
    })
    if (text !== state.written) {
      try {
        storage.setItem(snapshotKey, text)
        state.written = text
        state.warnedWrite = false
        if (store.browserEphemeral.localCopyError) store.browserEphemeral.localCopyError = null
        if (!state.legacyRemoved) {
          state.legacyRemoved = true
          storage.removeItem(legacyDataKey(snapshotKey)) // the old data backup
        }
      }
      catch (err) {
        // e.g. quota exceeded: saving to the server still works, only reload safety is lost
        state.written = null
        // The copy still stored is older than the record now. Left there,
        // a reload while the server can't be reached would take it for
        // the participant's record. Replace it with the position alone
        // (small), or remove it.
        try {
          storage.setItem(snapshotKey, snapshotText({
            participantId, rev, savedRev: store.browserEphemeral.savedRev, local: store.localState,
            dataText: 'null', resumeText: parts.resumeText, privateText: null,
          }))
        }
        catch {
          try {
            storage.removeItem(snapshotKey)
          }
          catch {
            // nothing more to do
          }
        }
        store.browserEphemeral.localCopyError = String(err)
        if (!state.warnedWrite) {
          state.warnedWrite = true
          log.warn('SMILESTORE: could not write the local copy: ' + err)
        }
      }
    }
  }

  state.cost = now() - started
  if (changed && includeData) syncLoop(store).changed()
  return {
    rev,
    includeData,
    dataText: parts.dataText,
    resumeText: parts.resumeText,
    serverResumeText: () => serializeParts(null, resumeForServer(resume)).resumeText,
  }
}

/**
 * Asks for the snapshot to be written soon: once, a few milliseconds
 * after the first of a run of changes (longer when writing is slow; see
 * SNAPSHOT_MIN_DELAY). Called by the store-sync plugin's watcher on
 * every change to the record or the position. captureSnapshot() writes
 * at once and cancels the wait.
 */
export function requestSnapshot(store) {
  if (typeof window === 'undefined') return
  const state = captureState(store)
  if (state.timer || state.stopped) return
  const delay = Math.min(SNAPSHOT_MAX_DELAY, Math.max(SNAPSHOT_MIN_DELAY, (state.cost || 0) * SNAPSHOT_COST_FACTOR))
  state.timer = setTimeout(() => {
    state.timer = null
    try {
      store.captureSnapshot()
    }
    catch (err) {
      useLog().warn('SMILESTORE: could not write the local copy: ' + err)
    }
  }, delay)
}

/**
 * Another tab (or window) of this browser has the participant now: this
 * one stops writing the local snapshot and stops saving, and the page
 * shows the notice (OtherTabNotice.vue). A reload makes it the
 * participant's tab again, from the newest copy.
 * @param {object} store - The smilestore
 * @param {'newer-tab'|'conflict'} reason - A newer tab said hello, or
 *   the server refused a save because it holds something newer (409)
 */
export function pauseForOtherTab(store, reason) {
  if (store.browserEphemeral.otherTab) return
  const state = captureState(store)
  store.browserEphemeral.otherTab = reason
  useLog().warn('SMILESTORE: this study is open in another tab (' + reason + '); this tab has stopped saving')
  store.stopSnapshots()
  if (reason === 'conflict') {
    // What this tab last wrote locally is older than the server's copy.
    // Take it out of the way (unless another tab has written since), so
    // that a reload takes the server's. It may hold work the server
    // never got, so it is set aside, not deleted (conflictCopyKey).
    try {
      const storage = browserStorage()
      if (storage && state.written && storage.getItem(snapshotKey) === state.written) {
        try {
          storage.setItem(conflictCopyKey(snapshotKey), state.written)
          storage.removeItem(conflictCopyKey(snapshotKey) + '_noted')
        }
        catch {
          // no room for a second copy: it is lost, as before
        }
        storage.removeItem(snapshotKey)
      }
    }
    catch {
      // the reload compares the copies anyway
    }
  }
}

/**
 * Stops writing the snapshot, for good. Called just before the stored
 * state is removed and the page reloaded (a reset), so that the write
 * made as the page closes doesn't put the old state back.
 */
export function stopSnapshots(store) {
  const state = captureState(store)
  state.stopped = true
  if (state.timer) clearTimeout(state.timer)
  state.timer = null
  state.loop?.stop()
}

/** Removes the local snapshot (on reset or when the participant is cleared). */
export function clearLocalSnapshot(store) {
  const state = captured.get(store.$state)
  if (state?.timer) clearTimeout(state.timer)
  state?.loop?.stop()
  captured.delete(store.$state)
  const storage = browserStorage()
  if (!storage) return
  try {
    storage.removeItem(snapshotKey)
    storage.removeItem(legacyDataKey(snapshotKey))
    storage.removeItem(conflictCopyKey(snapshotKey))
    storage.removeItem(conflictCopyKey(snapshotKey) + '_noted')
  }
  catch {
    // nothing more to do
  }
}

/**
 * The page is hidden or closing: write the snapshot and send what's
 * unsent, in a request that can outlive the page when it is small enough
 * (browsers cap those at 64 KiB). A larger record stays in the local
 * snapshot for the participant's return. Mobile browsers may not fire
 * pagehide at all, so this is never the only safeguard.
 */
export function saveOnClose(store) {
  if (typeof window === 'undefined' || !store.isDataLoaded) return
  syncLoop(store).hidden()
}

/** The browser's online / offline events (the store-sync plugin). */
export function networkChanged(store, online) {
  if (typeof window === 'undefined' || !store.isDataLoaded) return
  if (online) syncLoop(store).online()
  else syncLoop(store).offline()
}
