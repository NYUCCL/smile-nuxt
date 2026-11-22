// @ts-check
/**
 * @module sync/loop
 * @description The sync loop (plans/sync_engine.md, step 4): sends the
 * participant's snapshot to the server whenever it is ahead of what the
 * server has confirmed, by itself.
 *
 * - A change is sent `debounce` ms after the last one, and at most `maxWait`
 *   ms after the first one not yet sent.
 * - One request at a time. What changed while it was in flight is sent after.
 * - A failed send is sorted by its status: tried again with a growing wait
 *   (no answer, 408, 429, 5xx), or not sent again as it is (400, 413 and other
 *   4xx: a later change is a new snapshot and is tried).
 * - Offline is a failed send like any other (the wait grows to a minute);
 *   the browser's `online` event sends at once.
 * - No more than `maxPerMinute` sends a minute.
 * - No more than `maxSends` sends for one participant, counting every send
 *   whatever its answer. After that nothing is sent by itself; `sync()`
 *   still sends, up to twice `maxSends`, and then nothing is sent at all.
 *
 * Plain functions and timers: no Vue, no Pinia, no fetch. The store supplies
 * `take` (the snapshot as it is now) and `send`. Nothing here throws.
 */

import { BAD_TOKEN, NO_PARTICIPANT, REFUSED } from '../../shared/save-answers.js'

// Marks the in-flight result of a body that was still too large gzipped
const OVERSIZE_KEY = Symbol('oversize')

/** Milliseconds from a clock that doesn't follow changes to the system clock */
const monotonic = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now())

export const SYNC_DEFAULTS = {
  debounce: 1000,
  maxWait: 5000,
  maxPerMinute: 30,
  // All the sends one participant's browser makes (VITE_MAX_WRITES). At the
  // most the loop sends by itself (maxPerMinute, reached by a change every
  // 2 s) that is about 5.5 hours; a page that changes constantly sends one
  // every maxWait, about 14 hours.
  maxSends: 10_000,
  backoffStart: 1000,
  backoffMax: 60_000,
  // The largest body sent, as it goes over the network. Vercel refuses
  // bodies over 4.5 MB. A body under this as text is sent as it is (the
  // caller's `send` may gzip it); a larger one is gzipped here first and sent
  // if that fits.
  maxBytes: 4_000_000,
  // The largest body as text. The server accepts no more once it has
  // unzipped a body (MAX_TEXT_BYTES in server/utils/participant-save.ts).
  maxTextBytes: 20_000_000,
  // Browsers cap the body of a keepalive request (one that can outlive the
  // page) at 64 KiB.
  keepaliveBytes: 60_000,
}

/**
 * What to do about a send's answer.
 *
 * A 4xx is acted on only when the server marked it as its own
 * (shared/save-answers.js): a 403 or 404 that means "this participant can't
 * be saved here any more", a 400 or 413 that means "this body is refused".
 * Without the mark it came from something on the way (a firewall, a proxy, a
 * deploy being swapped), and the save is tried again.
 * @param {number} status - The HTTP status; 0 when there was no answer
 * @param {string} [marker] - The answer's `data.smile`, when it has one
 * @returns {'ok'|'retry'|'conflict'|'gone'|'stop'} The class
 */
export function classify(status, marker) {
  if (status >= 200 && status < 300) return 'ok'
  if (status === 409) return 'conflict'
  if (status === 403) return marker === BAD_TOKEN ? 'gone' : 'retry'
  if (status === 404) return marker === NO_PARTICIPANT ? 'gone' : 'retry'
  if (status === 408 || status === 429) return 'retry'
  // Refused by the save route itself: the same body would be refused again.
  // Any other 4xx (a proxy's 400, a network sign-in page's 401) is tried again.
  if (status >= 400 && status < 500) return marker === REFUSED ? 'stop' : 'retry'
  return 'retry' // no answer, a timeout, 5xx, anything unexpected
}

/**
 * The size of a text in UTF-8 bytes, measured only when its length doesn't
 * already settle whether it is over `limit`.
 * @param {string} text - The text
 * @param {number} limit - The limit that matters to the caller
 * @returns {number} Its size in bytes (its length, when that is enough to tell)
 */
export function byteSize(text, limit) {
  if (text.length > limit || text.length * 3 <= limit) return text.length
  return new TextEncoder().encode(text).length
}

/**
 * The loop's settings: the fields of SYNC_DEFAULTS.
 * @typedef {typeof SYNC_DEFAULTS} SyncOptions
 */

/**
 * Why saving is not going through.
 * @typedef {'retrying'|'refused'|'oversize'|'conflict'|'limit'} SyncErrorKind
 */

/**
 * @typedef {object} SyncError
 * @property {SyncErrorKind} kind - 'retrying': the send failed and is tried
 *   again; the others: nothing more is sent as it is
 * @property {number} status - The HTTP status (0 when there was no answer,
 *   413 for a record over the size limit)
 * @property {string} message - What happened, in words
 */

/**
 * @typedef {object} SyncStatus
 * @property {'saved'|'pending'|'saving'|'offline'|'error'} status - 'pending':
 *   a change is waiting to be sent
 * @property {SyncError|null} error - The last error
 * @property {number|null} retryAt - When the next try is (ms since the epoch)
 */

/**
 * The snapshot as `take` gives it.
 * @typedef {object} TakenSnapshot
 * @property {number} rev - The snapshot's rev
 * @property {number} savedRev - The last rev the server confirmed
 * @property {() => string} body - The text of the save's body
 */

/**
 * The body of a send: the text, or its gzipped bytes.
 * @typedef {string|Uint8Array} SendBody
 */

/**
 * What `send` answers with.
 * @typedef {object} SendAnswer
 * @property {number} status - The HTTP status; 0 when there was no answer
 * @property {string} [message] - The error, in words
 * @property {number} [serverRev] - With a 409: the rev the server holds
 * @property {string} [marker] - The answer's `data.smile` (shared/save-answers.js)
 */

/**
 * What the request in flight ends with: a send's answer (a `send` that
 * resolves with something else is read as "no answer"), or the mark that the
 * body was still over `maxBytes` gzipped and was not sent.
 * @typedef {Partial<SendAnswer> & { [OVERSIZE_KEY]?: object, sentBytes?: number|null }} InFlightResult
 */

/**
 * How a save ended.
 * @typedef {object} SaveOutcome
 * @property {boolean} ok - The server has `rev`
 * @property {number} rev - The rev the save was for (0 when there was none)
 * @property {string|null} error - Why not, when `ok` is false
 */

/**
 * What the loop works with.
 * @typedef {object} SyncLoopDeps
 * @property {() => TakenSnapshot|null} take - The snapshot as it is now, or
 *   null when there is nothing to send yet
 * @property {(body: SendBody, info: { rev: number, keepalive: boolean }) => Promise<SendAnswer>|SendAnswer} send -
 *   Sends one body. `body` is the text, or the gzipped bytes from `compress`
 * @property {(rev: number) => void} onConfirmed - The server has `rev`
 * @property {(status: SyncStatus) => void} [onStatus] - The status changed
 * @property {(marker?: string) => boolean|void} [onGone] - The server no longer accepts
 *   this participant (a marked 403 or 404). Returning true means the caller
 *   has arranged for saving to go on (as a new row); otherwise the loop stops
 * @property {((text: string) => Promise<Uint8Array|null>|Uint8Array|null)|null} [compress] - The
 *   gzipped bytes or null, for a body too large to send as text: a record
 *   over `maxBytes`, or a closing page's body over `keepaliveBytes`
 * @property {(serverRev?: number) => void} [onConflict] - Another copy saved something newer
 * @property {(bytes: number) => void} [onOversize] - The record is over `maxBytes`
 * @property {() => number} [sent] - How many sends this participant's
 *   browser has made so far (kept by the caller, so it survives a reload)
 * @property {() => void} [onSend] - One more send was made
 * @property {(sends: number) => void} [onLimit] - `maxSends` was reached
 * @property {() => boolean} [isOnline] - Whether the browser is online
 * @property {(message: string) => void} [warn] - Reports a problem
 * @property {() => number} [random] - A number in [0, 1), for the retry jitter
 * @property {Partial<SyncOptions>} [options] - Overrides for SYNC_DEFAULTS
 */

/**
 * @typedef {object} SyncLoop
 * @property {() => void} changed - The snapshot changed
 * @property {() => Promise<SaveOutcome>} sync - Sends now and waits for the answer
 * @property {() => void} hidden - The page is hidden or closing
 * @property {() => void} online - The browser is back online
 * @property {() => void} offline - The browser went offline
 * @property {() => void} stop - Stops for good
 * @property {SyncStatus} status - The status now (read only)
 */

/**
 * @param {SyncLoopDeps} deps - What the loop works with
 * @returns {SyncLoop} `{ changed, sync, hidden, online, offline, stop, status }`
 */
export function createSyncLoop(deps) {
  const {
    take, send, onConfirmed,
    onStatus = () => {}, onGone = () => {}, onConflict = () => {}, onOversize = () => {},
    sent = () => 0, onSend = () => {}, onLimit = () => {},
    isOnline = () => true, warn = () => {}, random = Math.random, compress = null,
  } = deps
  const o = { ...SYNC_DEFAULTS, ...deps.options }

  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null
  let dueAt = 0
  /** @type {number|null} */
  let firstChange = null // when the oldest unsent change was made
  /** @type {Promise<InFlightResult>|null} */
  let inFlight = null
  let taking = false
  let failures = 0
  let refusedRev = 0 // the server refused this rev for what it holds; not sent again
  let highestSent = 0
  let halted = false // a conflict: nothing more is sent from this page
  let stopped = false
  /** @type {number[]} */
  let sends = [] // when each send of the last minute started
  let warnedRunaway = false
  let limitReported = false
  /** @type {SyncStatus} */
  let current = { status: 'saved', error: null, retryAt: null }

  /**
   * @param {SyncStatus['status']} status - The new status
   * @param {SyncError|null} [error] - The error that goes with it
   * @param {number|null} [retryAt] - When the next try is
   */
  const setStatus = (status, error = null, retryAt = null) => {
    current = { status, error, retryAt }
    try {
      onStatus(current)
    }
    catch {
      // a status display can't stop saving
    }
  }

  const clear = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  /** @param {number} delay - Milliseconds from now */
  const schedule = (delay) => {
    clear()
    dueAt = Date.now() + delay
    timer = setTimeout(() => {
      timer = null
      attempt()
    }, delay)
  }

  const snapshot = () => {
    taking = true
    try {
      return take()
    }
    catch (err) {
      warn('could not take the snapshot: ' + err)
      return null
    }
    finally {
      taking = false
    }
  }

  /**
   * @param {boolean} ok - The server has `rev`
   * @param {number} rev - The rev the save was for
   * @param {string|null} [error] - Why not
   * @returns {SaveOutcome} The outcome
   */
  const outcome = (ok, rev, error = null) => ({ ok, rev, error })

  const sentSoFar = () => {
    try {
      return Number(sent()) || 0
    }
    catch {
      return 0
    }
  }

  const countSend = () => {
    try {
      onSend()
    }
    catch {
      // the count is the caller's
    }
  }

  /** Nothing more is sent by itself: `maxSends` sends have been made. */
  const atLimit = () => sentSoFar() >= o.maxSends

  const limitReached = () => {
    const message = `this browser has sent ${sentSoFar()} saves, the most allowed (${o.maxSends}); what changes now is kept in this browser and not sent`
    if (current.error?.kind !== 'limit') setStatus('error', { kind: 'limit', status: 0, message })
    if (!limitReported) {
      limitReported = true
      warn(message)
      try {
        onLimit(sentSoFar())
      }
      catch {
        // reporting it is best effort
      }
    }
    return message
  }

  /** After a request ends: is there something newer to send? */
  const after = () => {
    const snap = snapshot()
    if (snap && snap.rev > snap.savedRev && snap.rev !== refusedRev) {
      if (atLimit()) {
        limitReached()
        return
      }
      if (firstChange === null) firstChange = Date.now()
      setStatus('pending')
      schedule(o.debounce)
    }
    else if (current.status !== 'error') {
      setStatus('saved')
    }
  }

  /**
   * Sends the snapshot if it is ahead of the server.
   * @param {object} [how] - How this send was started
   * @param {boolean} [how.force] - Not held back by `maxPerMinute`
   * @param {boolean} [how.asked] - Started by `sync()`: allowed up to twice `maxSends`
   * @returns {Promise<SaveOutcome>} How it ended
   */
  async function attempt({ force = false, asked = false } = {}) {
    if (stopped) return outcome(false, 0, 'stopped')
    if (inFlight) return outcome(false, 0, 'a save is in progress')
    clear()
    const snap = snapshot()
    if (!snap) return outcome(false, 0, 'nothing to save yet')
    if (snap.rev <= snap.savedRev) {
      firstChange = null
      failures = 0
      setStatus('saved')
      return outcome(true, snap.savedRev)
    }
    if (halted) return outcome(false, snap.rev, current.error?.message || 'conflict')
    if (snap.rev === refusedRev) return outcome(false, snap.rev, current.error?.message || 'refused')
    if (sentSoFar() >= (asked ? o.maxSends * 2 : o.maxSends)) return outcome(false, snap.rev, limitReached())
    // A clock that only goes forward: a change to the system clock must not
    // keep old sends in the window
    const started = monotonic()
    sends = sends.filter(t => started - t < 60_000)
    if (!force && sends.length >= o.maxPerMinute) {
      if (!warnedRunaway) {
        warnedRunaway = true
        warn(`more than ${o.maxPerMinute} saves in a minute; waiting before the next one`)
      }
      setStatus('pending')
      // @ts-expect-error sends[0] is typed as possibly missing; the list is not empty here when maxPerMinute is at least 1
      schedule(sends[0] + 60_000 - started)
      return outcome(false, snap.rev, 'too many saves')
    }

    /** @type {string} */
    let body
    try {
      body = snap.body()
    }
    catch (err) {
      warn('could not build the save: ' + err)
      // Not a failed send: the next change is tried as usual
      failures = 0
      return outcome(false, snap.rev, String(err))
    }
    // Over maxBytes as text, it may still fit gzipped (decided in the chain
    // below, because compressing is asynchronous)
    const bytes = byteSize(body, o.maxBytes)
    const big = bytes > o.maxBytes
    /**
     * @param {number|null} [sentBytes] - The body's size gzipped, when it was gzipped
     * @returns {SaveOutcome} The outcome
     */
    const tooBig = (sentBytes = null) => {
      refusedRev = snap.rev
      failures = 0
      const message = `the record is ${bytes} bytes${sentBytes ? ` (${sentBytes} gzipped)` : ''}, over the limit; it is kept in this browser and not sent`
      setStatus('error', { kind: 'oversize', status: 413, message })
      try {
        onOversize(bytes)
      }
      catch {
        // reporting it is best effort
      }
      return outcome(false, snap.rev, message)
    }
    if (big && (!compress || byteSize(body, o.maxTextBytes) > o.maxTextBytes)) return tooBig()

    firstChange = null
    highestSent = Math.max(highestSent, snap.rev)
    setStatus('saving')
    const OVERSIZE = {}
    inFlight = Promise.resolve()
      .then(async () => {
        /** @type {SendBody} */
        let payload = body
        if (big) {
          // @ts-expect-error compress is typed as possibly null; `big` is true here only when it is set (the check before this request)
          const zipped = await compress(body)
          if (!zipped || zipped.length > o.maxBytes) return { [OVERSIZE_KEY]: OVERSIZE, sentBytes: zipped?.length ?? null }
          payload = zipped
        }
        sends.push(started)
        countSend()
        return send(payload, { rev: snap.rev, keepalive: false })
      })
      .catch(err => ({ status: 0, message: String(err) }))
    const res = await inFlight
    inFlight = null
    if (stopped) return outcome(false, snap.rev, 'stopped')
    if (res?.[OVERSIZE_KEY] === OVERSIZE) return tooBig(res.sentBytes)
    return settle(snap.rev, res)
  }

  /**
   * Acts on a send's answer.
   * @param {number} rev - The rev that was sent
   * @param {InFlightResult|null|undefined} res - The answer
   * @returns {SaveOutcome} How the save ended
   */
  function settle(rev, res) {
    const status = Number(res?.status) || 0
    const message = res?.message || (status ? `HTTP ${status}` : 'no answer from the server')
    switch (classify(status, res?.marker)) {
      case 'ok':
        failures = 0
        try {
          onConfirmed(rev)
        }
        catch (err) {
          warn('could not record the save: ' + err)
        }
        setStatus('saved')
        after()
        return outcome(true, rev)
      case 'conflict':
        if (rev < highestSent) {
          // An older send of ours arrived after a newer one: nothing to do
          after()
          return outcome(true, rev)
        }
        halted = true
        setStatus('error', { kind: 'conflict', status, message })
        try {
          onConflict(res?.serverRev)
        }
        catch {
          // handled in the page, if at all
        }
        return outcome(false, rev, message)
      case 'gone': {
        let goesOn = false
        try {
          goesOn = onGone(res?.marker) === true
        }
        catch {
          // nothing more to do
        }
        if (goesOn) {
          // The caller keeps the record and saves it as a new row
          failures = 0
          setStatus('pending')
          schedule(0)
          return outcome(false, rev, message)
        }
        stopped = true
        clear()
        setStatus('error', { kind: 'refused', status, message })
        return outcome(false, rev, message)
      }
      case 'stop':
        // The same body would be refused again. A later change is tried.
        failures = 0
        refusedRev = rev
        setStatus('error', { kind: 'refused', status, message })
        after()
        return outcome(false, rev, message)
      default: {
        failures += 1
        const wait = Math.min(o.backoffMax, o.backoffStart * 2 ** (failures - 1)) * (0.5 + random() / 2)
        schedule(wait)
        setStatus(isOnline() ? 'error' : 'offline', { kind: 'retrying', status, message }, dueAt)
        return outcome(false, rev, message)
      }
    }
  }

  return {
    /** The snapshot changed. */
    changed() {
      if (stopped || halted || taking) return
      if (atLimit()) {
        limitReached()
        return
      }
      const t = Date.now()
      if (firstChange === null) firstChange = t
      // In flight: sent when the request ends. Failing: sent at the next try.
      if (inFlight || failures) return
      setStatus('pending')
      schedule(Math.min(o.debounce, Math.max(0, firstChange + o.maxWait - t)))
    },

    /**
     * Sends now and waits for the answer (after any request in flight).
     * @returns {Promise<{ ok: boolean, rev: number, error: string|null }>} Never rejects
     */
    async sync() {
      try {
        while (inFlight) await inFlight
        return await attempt({ force: true, asked: true })
      }
      catch (err) {
        return outcome(false, 0, String(err))
      }
    },

    /**
     * The page is hidden or closing: send what's unsent now, in a request
     * that can outlive the page when the body is small enough for one.
     */
    hidden() {
      if (stopped || halted || atLimit()) return
      const snap = snapshot()
      if (!snap || snap.rev <= snap.savedRev || snap.rev === refusedRev) return
      /** @type {string} */
      let body
      try {
        body = snap.body()
      }
      catch {
        return
      }
      /** @param {SendBody} payload - The text, or its gzipped bytes */
      const sendClosing = (payload) => {
        highestSent = Math.max(highestSent, snap.rev)
        countSend()
        Promise.resolve()
          .then(() => send(payload, { rev: snap.rev, keepalive: true }))
          .then((res) => {
            if (stopped || classify(Number(res?.status) || 0, res?.marker) !== 'ok') return
            onConfirmed(snap.rev)
            if (!inFlight && !failures) after()
          })
          .catch(() => {})
      }
      // Too large to outlive the page as it is; if the page stays, an ordinary send
      const ordinary = () => {
        if (!inFlight && byteSize(body, o.maxBytes) <= o.maxBytes) attempt({ force: true })
      }
      if (byteSize(body, o.keepaliveBytes) <= o.keepaliveBytes) {
        sendClosing(body)
        return
      }
      if (!compress || byteSize(body, o.maxBytes) > o.maxBytes) {
        ordinary()
        return
      }
      // Gzipped it may fit (a record compresses about 5 times). Compressing
      // takes a few milliseconds the page may not have: best effort.
      Promise.resolve()
        .then(() => compress(body))
        .then((zipped) => {
          if (stopped) return
          if (zipped && zipped.length <= o.keepaliveBytes) sendClosing(zipped)
          else ordinary()
        })
        .catch(() => ordinary())
    },

    /** The browser is back online. */
    online() {
      if (stopped || halted || inFlight) return
      failures = 0
      attempt()
    },

    /** The browser went offline. */
    offline() {
      if (stopped || halted) return
      if (current.status === 'pending' || current.status === 'saving') setStatus('offline', current.error)
    },

    /** Stops for good (a reset). */
    stop() {
      stopped = true
      clear()
    },

    get status() {
      return current
    },
  }
}
