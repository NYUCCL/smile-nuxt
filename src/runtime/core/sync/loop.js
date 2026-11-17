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
 *
 * Plain functions and timers: no Vue, no Pinia, no fetch. The store supplies
 * `take` (the snapshot as it is now) and `send`. Nothing here throws.
 */

export const SYNC_DEFAULTS = {
  debounce: 1000,
  maxWait: 5000,
  maxPerMinute: 30,
  backoffStart: 1000,
  backoffMax: 60_000,
  // The largest body sent. Vercel refuses bodies over 4.5 MB.
  maxBytes: 4_000_000,
  // Browsers cap the body of a keepalive request (one that can outlive the
  // page) at 64 KiB.
  keepaliveBytes: 60_000,
}

/**
 * What to do about a send's answer.
 * @param {number} status - The HTTP status; 0 when there was no answer
 * @returns {'ok'|'retry'|'conflict'|'gone'|'stop'} The class
 */
export function classify(status) {
  if (status >= 200 && status < 300) return 'ok'
  if (status === 409) return 'conflict'
  if (status === 403) return 'gone'
  if (status === 408 || status === 429) return 'retry'
  if (status >= 400 && status < 500) return 'stop'
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
 * @typedef {object} SyncStatus
 * @property {'saved'|'pending'|'saving'|'offline'|'error'} status - 'pending':
 *   a change is waiting to be sent
 * @property {object|null} error - The last error: `{ kind, status, message }`
 *   with kind 'retrying' | 'refused' | 'oversize' | 'conflict'
 * @property {number|null} retryAt - When the next try is (ms since the epoch)
 */

/**
 * @param {object} deps - What the loop works with
 * @param {Function} deps.take - () => `{ rev, savedRev, body() }`, or null
 *   when there is nothing to send yet
 * @param {Function} deps.send - async (body, { rev, keepalive }) =>
 *   `{ status, message?, serverRev? }`
 * @param {Function} deps.onConfirmed - (rev) => void: the server has `rev`
 * @param {Function} [deps.onStatus] - (SyncStatus) => void
 * @param {Function} [deps.onGone] - The server no longer accepts this participant (403)
 * @param {Function} [deps.onConflict] - (serverRev): another copy saved something newer
 * @param {Function} [deps.onOversize] - (bytes): the record is over `maxBytes`
 * @param {Function} [deps.isOnline] - () => boolean
 * @param {Function} [deps.warn] - (message) => void
 * @param {Function} [deps.random] - () => [0, 1), for the retry jitter
 * @param {object} [deps.options] - Overrides for SYNC_DEFAULTS
 * @returns {object} `{ changed, sync, hidden, online, offline, stop, status }`
 */
export function createSyncLoop(deps) {
  const {
    take, send, onConfirmed,
    onStatus = () => {}, onGone = () => {}, onConflict = () => {}, onOversize = () => {},
    isOnline = () => true, warn = () => {}, random = Math.random,
  } = deps
  const o = { ...SYNC_DEFAULTS, ...deps.options }

  let timer = null
  let dueAt = 0
  let firstChange = null // when the oldest unsent change was made
  let inFlight = null
  let taking = false
  let failures = 0
  let refusedRev = 0 // the server refused this rev for what it holds; not sent again
  let highestSent = 0
  let halted = false // a conflict: nothing more is sent from this page
  let stopped = false
  let sends = [] // when each send of the last minute started
  let warnedRunaway = false
  let current = { status: 'saved', error: null, retryAt: null }

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

  const outcome = (ok, rev, error = null) => ({ ok, rev, error })

  /** After a request ends: is there something newer to send? */
  const after = () => {
    const snap = snapshot()
    if (snap && snap.rev > snap.savedRev && snap.rev !== refusedRev) {
      if (firstChange === null) firstChange = Date.now()
      setStatus('pending')
      schedule(o.debounce)
    }
    else if (current.status !== 'error') {
      setStatus('saved')
    }
  }

  async function attempt({ force = false } = {}) {
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
    const started = Date.now()
    sends = sends.filter(t => started - t < 60_000)
    if (!force && sends.length >= o.maxPerMinute) {
      if (!warnedRunaway) {
        warnedRunaway = true
        warn(`more than ${o.maxPerMinute} saves in a minute; waiting before the next one`)
      }
      setStatus('pending')
      schedule(sends[0] + 60_000 - started)
      return outcome(false, snap.rev, 'too many saves')
    }

    let body
    try {
      body = snap.body()
    }
    catch (err) {
      warn('could not build the save: ' + err)
      return outcome(false, snap.rev, String(err))
    }
    const bytes = byteSize(body, o.maxBytes)
    if (bytes > o.maxBytes) {
      refusedRev = snap.rev
      const message = `the record is ${bytes} bytes, over the ${o.maxBytes} byte limit; it is kept in this browser and not sent`
      setStatus('error', { kind: 'oversize', status: 413, message })
      try {
        onOversize(bytes)
      }
      catch {
        // reporting it is best effort
      }
      return outcome(false, snap.rev, message)
    }

    sends.push(started)
    firstChange = null
    highestSent = Math.max(highestSent, snap.rev)
    setStatus('saving')
    inFlight = Promise.resolve()
      .then(() => send(body, { rev: snap.rev, keepalive: false }))
      .catch(err => ({ status: 0, message: String(err) }))
    const res = await inFlight
    inFlight = null
    if (stopped) return outcome(false, snap.rev, 'stopped')
    return settle(snap.rev, res)
  }

  /** Acts on a send's answer. */
  function settle(rev, res) {
    const status = Number(res?.status) || 0
    const message = res?.message || (status ? `HTTP ${status}` : 'no answer from the server')
    switch (classify(status)) {
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
      case 'gone':
        stopped = true
        clear()
        setStatus('error', { kind: 'refused', status, message })
        try {
          onGone()
        }
        catch {
          // nothing more to do
        }
        return outcome(false, rev, message)
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
        return await attempt({ force: true })
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
      if (stopped || halted) return
      const snap = snapshot()
      if (!snap || snap.rev <= snap.savedRev || snap.rev === refusedRev) return
      let body
      try {
        body = snap.body()
      }
      catch {
        return
      }
      if (byteSize(body, o.keepaliveBytes) > o.keepaliveBytes) {
        // Too large to outlive the page; if the page stays, an ordinary send
        if (!inFlight && byteSize(body, o.maxBytes) <= o.maxBytes) attempt({ force: true })
        return
      }
      highestSent = Math.max(highestSent, snap.rev)
      Promise.resolve()
        .then(() => send(body, { rev: snap.rev, keepalive: true }))
        .then((res) => {
          if (stopped || classify(Number(res?.status) || 0) !== 'ok') return
          onConfirmed(snap.rev)
          if (!inFlight && !failures) after()
        })
        .catch(() => {})
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
