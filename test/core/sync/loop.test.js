import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createSyncLoop, classify, byteSize, SYNC_DEFAULTS } from '../../../src/runtime/core/sync/loop.js'

/**
 * Step 4 of plans/sync_engine.md: the sync loop, with fake timers and a fake
 * server. The store's side of it (what is sent, creating the participant,
 * private data) is in snapshotStore.test.js.
 */

/** A participant's snapshot and a server that answers as the test says. */
function setup(options = {}) {
  const world = {
    rev: 0,
    savedRev: 0,
    text: 'x',
    online: true,
    sent: [], // { rev, keepalive, body }
    answers: [], // one per send, in order; a function, an object, or a held promise
    statuses: [],
    confirmed: [],
    warnings: [],
    gone: [],
    goOn: false, // what onGone answers
    conflicts: [],
    oversize: [],
    count: 0, // sends so far, as the store keeps it
    limits: [],
    // Gzip for a closing page's send: by default a tenth of the size
    compress: async text => new Uint8Array(Math.ceil(text.length / 10)),
  }
  world.answer = (...answers) => world.answers.push(...answers)
  /** A send that stays in flight until `release(answer)` is called. */
  world.hold = () => {
    let release
    world.answers.push(new Promise((resolve) => {
      release = resolve
    }))
    return release
  }
  world.loop = createSyncLoop({
    take: () => (world.rev === 0
      ? null
      : { rev: world.rev, savedRev: world.savedRev, body: () => JSON.stringify({ rev: world.rev, text: world.text }) }),
    send: async (body, { rev, keepalive }) => {
      world.sent.push({ rev, keepalive, body })
      const next = world.answers.shift()
      if (next === undefined) return { status: 200 }
      if (next instanceof Error) throw next
      return await (typeof next === 'function' ? next() : next)
    },
    onConfirmed: (rev) => {
      world.confirmed.push(rev)
      world.savedRev = Math.max(world.savedRev, rev)
    },
    onStatus: s => world.statuses.push(s),
    onGone: (marker) => {
      world.gone.push(marker)
      return world.goOn
    },
    compress: text => world.compress(text),
    onConflict: rev => world.conflicts.push(rev),
    onOversize: bytes => world.oversize.push(bytes),
    sent: () => world.count,
    onSend: () => {
      world.count += 1
    },
    onLimit: n => world.limits.push(n),
    isOnline: () => world.online,
    warn: m => world.warnings.push(m),
    random: () => 1, // no jitter: the full wait
    options,
  })
  /** The participant did something. */
  world.change = () => {
    world.rev += 1
    world.loop.changed()
  }
  return world
}

const tick = ms => vi.advanceTimersByTimeAsync(ms)

describe('the sync loop', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('sorting answers', () => {
    it.each([
      [200, 'ok'], [201, 'ok'], [204, 'ok'],
      [0, 'retry'], [408, 'retry'], [429, 'retry'], [500, 'retry'], [502, 'retry'], [503, 'retry'], [504, 'retry'], [302, 'retry'], [NaN, 'retry'],
      [400, 'retry'], [401, 'retry'], [413, 'retry'], [415, 'retry'], [422, 'retry'],
      [409, 'conflict'], [403, 'retry'], [404, 'retry'],
    ])('%s is %s', (status, expected) => {
      expect(classify(status)).toBe(expected)
    })

    it('a 403 or 404 means the participant is gone only with the server\'s own mark', () => {
      expect(classify(403, 'bad-token')).toBe('gone')
      expect(classify(404, 'no-participant')).toBe('gone')
      expect(classify(403, 'no-participant')).toBe('retry')
      expect(classify(404, 'bad-token')).toBe('retry')
      expect(classify(403, undefined)).toBe('retry')
      expect(classify(200, 'bad-token')).toBe('ok')
    })

    it('a 400 or 413 stops that body only with the save route\'s own mark', () => {
      expect(classify(400, 'refused')).toBe('stop')
      expect(classify(413, 'refused')).toBe('stop')
      expect(classify(400, undefined)).toBe('retry')
      expect(classify(401, 'refused')).toBe('stop')
    })
  })

  describe('when a change is sent', () => {
    it('one second after the last change', async () => {
      const w = setup()
      w.change()
      expect(w.loop.status.status).toBe('pending')
      await tick(999)
      expect(w.sent).toHaveLength(0)
      await tick(1)
      expect(w.sent).toEqual([expect.objectContaining({ rev: 1, keepalive: false })])
      expect(w.confirmed).toEqual([1])
      expect(w.loop.status).toEqual({ status: 'saved', error: null, retryAt: null })
    })

    it('changes that keep coming are sent at least every 5 seconds', async () => {
      const w = setup()
      for (let i = 0; i < 12; i += 1) {
        w.change()
        await tick(500)
      }
      // 6 s of changes 500 ms apart: one send at 5 s, not none
      expect(w.sent.map(s => s.rev)).toEqual([10])
      await tick(1000)
      expect(w.sent.map(s => s.rev)).toEqual([10, 12])
    })

    it('several changes close together are one send, of the newest', async () => {
      const w = setup()
      w.change()
      w.change()
      w.change()
      await tick(1000)
      expect(w.sent.map(s => s.rev)).toEqual([3])
    })

    it('nothing is sent when nothing changed', async () => {
      const w = setup()
      await tick(60_000)
      expect(w.sent).toHaveLength(0)
      expect(w.statuses).toHaveLength(0)
    })

    it('nothing is sent while there is nothing to take (before consent)', async () => {
      const w = setup()
      w.loop.changed()
      await tick(5000)
      expect(w.sent).toHaveLength(0)
    })
  })

  describe('one request at a time', () => {
    it('a change made during a request is sent after it, not alongside it', async () => {
      const w = setup()
      const release = w.hold()
      w.change()
      await tick(1000)
      expect(w.sent).toHaveLength(1)
      expect(w.loop.status.status).toBe('saving')

      w.change()
      w.change()
      await tick(10_000)
      expect(w.sent).toHaveLength(1)

      release({ status: 200 })
      await tick(0)
      expect(w.confirmed).toEqual([1])
      expect(w.loop.status.status).toBe('pending')
      await tick(1000)
      expect(w.sent.map(s => s.rev)).toEqual([1, 3])
      expect(w.loop.status.status).toBe('saved')
    })

    it('an answer for an older rev does not mark a newer one saved', async () => {
      const w = setup()
      const release = w.hold()
      w.change()
      await tick(1000)
      w.change()
      release({ status: 200 })
      await tick(0)
      expect(w.savedRev).toBe(1)
      expect(w.loop.status.status).toBe('pending')
    })
  })

  describe('failed sends', () => {
    it.each([0, 408, 429, 500, 502, 503])('status %s is tried again, with a wait that doubles up to a minute', async (status) => {
      const w = setup()
      for (let i = 0; i < 9; i += 1) w.answer({ status })
      w.change()
      await tick(1000)
      expect(w.sent).toHaveLength(1)
      expect(w.loop.status).toMatchObject({ status: 'error', error: { kind: 'retrying', status } })
      expect(w.loop.status.retryAt).toBe(Date.now() + 1000)

      const waits = [1000, 2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000]
      for (const [i, wait] of waits.entries()) {
        await tick(wait - 1)
        expect(w.sent).toHaveLength(i + 1)
        await tick(1)
        expect(w.sent).toHaveLength(i + 2)
      }
      // The tenth try gets through
      await tick(60_000)
      expect(w.confirmed).toEqual([1])
      expect(w.loop.status).toEqual({ status: 'saved', error: null, retryAt: null })
    })

    it('a send that throws is a failed send', async () => {
      const w = setup()
      w.answer(new Error('boom'))
      w.change()
      await tick(1000)
      expect(w.loop.status.error).toMatchObject({ kind: 'retrying', status: 0 })
      await tick(1000)
      expect(w.confirmed).toEqual([1])
    })

    it('the wait has jitter: between half of it and all of it', async () => {
      const w = setup()
      const loop = createSyncLoop({
        take: () => ({ rev: 1, savedRev: 0, body: () => '{}' }),
        send: async () => {
          w.sent.push(1)
          return { status: 500 }
        },
        onConfirmed: () => {},
        random: () => 0,
      })
      loop.changed()
      await tick(1000)
      expect(w.sent).toHaveLength(1)
      await tick(499)
      expect(w.sent).toHaveLength(1)
      await tick(1)
      expect(w.sent).toHaveLength(2)
      loop.stop()
    })

    it('a retry sends the newest snapshot, and a change does not shorten the wait', async () => {
      const w = setup()
      w.answer({ status: 500 }, { status: 500 })
      w.change()
      await tick(1000) // first try fails; next in 1 s
      await tick(1000) // second fails; next in 2 s
      w.change()
      w.change()
      await tick(1999)
      expect(w.sent).toHaveLength(2)
      await tick(1)
      expect(w.sent.map(s => s.rev)).toEqual([1, 1, 3])
      expect(w.confirmed).toEqual([3])
    })

    it.each([400, 413, 422])('status %s is not sent again as it is, and a later change is tried', async (status) => {
      const w = setup()
      w.answer({ status, message: 'no', marker: 'refused' })
      w.change()
      await tick(1000)
      expect(w.loop.status).toMatchObject({ status: 'error', error: { kind: 'refused', status, message: 'no' }, retryAt: null })
      await tick(120_000)
      expect(w.sent).toHaveLength(1)

      w.change()
      await tick(1000)
      expect(w.sent.map(s => s.rev)).toEqual([1, 2])
      expect(w.loop.status.status).toBe('saved')
    })

    it('a marked 404: the participant is gone, and nothing more is sent', async () => {
      const w = setup()
      w.answer({ status: 404, marker: 'no-participant' })
      w.change()
      await tick(1000)
      expect(w.gone).toEqual(['no-participant'])
      w.change()
      await tick(10_000)
      expect(w.sent).toHaveLength(1)
      expect(w.loop.status).toMatchObject({ status: 'error', error: { kind: 'refused' } })
    })

    it('a marked 403 the caller can go on from: the same record is sent again at once', async () => {
      const w = setup()
      w.goOn = true
      w.answer({ status: 403, marker: 'bad-token' })
      w.change()
      await tick(1000)
      expect(w.gone).toEqual(['bad-token'])
      await tick(10)
      expect(w.sent.map(s => s.rev)).toEqual([1, 1])
      expect(w.loop.status.status).toBe('saved')
    })

    it.each([400, 401, 403, 404, 413])('an unmarked %s is tried again like any failure', async (status) => {
      const w = setup()
      w.answer({ status })
      w.change()
      await tick(1000)
      expect(w.gone).toEqual([])
      expect(w.loop.status).toMatchObject({ status: 'error', error: { kind: 'retrying' } })
      await tick(1000)
      expect(w.sent).toHaveLength(2)
      expect(w.loop.status.status).toBe('saved')
    })

    it('409: another copy saved something newer; nothing more is sent from this page', async () => {
      const w = setup()
      w.answer({ status: 409, serverRev: 40 })
      w.change()
      await tick(1000)
      expect(w.conflicts).toEqual([40])
      expect(w.loop.status).toMatchObject({ status: 'error', error: { kind: 'conflict' } })
      w.change()
      await tick(10_000)
      expect(w.sent).toHaveLength(1)
      await expect(w.loop.sync()).resolves.toMatchObject({ ok: false })
      expect(w.sent).toHaveLength(1)
    })
  })

  describe('offline', () => {
    it('sends fail and are tried again; coming back online sends at once', async () => {
      const w = setup()
      w.online = false
      for (let i = 0; i < 5; i += 1) w.answer({ status: 0 })
      w.change()
      await tick(1000)
      expect(w.loop.status).toMatchObject({ status: 'offline', error: { kind: 'retrying' } })
      await tick(15_000) // 1 + 2 + 4 + 8: four more tries
      expect(w.sent).toHaveLength(5)

      w.online = true
      w.loop.online()
      await tick(0)
      expect(w.sent).toHaveLength(6)
      expect(w.confirmed).toEqual([1])
      expect(w.loop.status.status).toBe('saved')
    })

    it('going offline with a change waiting shows as offline', () => {
      const w = setup()
      w.change()
      w.online = false
      w.loop.offline()
      expect(w.loop.status.status).toBe('offline')
    })

    it('coming online with nothing unsent sends nothing', async () => {
      const w = setup()
      w.change()
      await tick(1000)
      w.loop.online()
      await tick(0)
      expect(w.sent).toHaveLength(1)
    })
  })

  describe('sync()', () => {
    it('sends now and resolves with the answer', async () => {
      const w = setup()
      w.change()
      await expect(w.loop.sync()).resolves.toEqual({ ok: true, rev: 1, error: null })
      expect(w.sent).toHaveLength(1)
      // The debounced send it replaced doesn't happen
      await tick(5000)
      expect(w.sent).toHaveLength(1)
    })

    it('with nothing unsent it resolves ok without sending', async () => {
      const w = setup()
      w.change()
      await w.loop.sync()
      await expect(w.loop.sync()).resolves.toEqual({ ok: true, rev: 1, error: null })
      expect(w.sent).toHaveLength(1)
    })

    it('waits for the request in flight, then sends what is newer', async () => {
      const w = setup()
      const release = w.hold()
      w.change()
      await tick(1000)
      w.change()
      const result = w.loop.sync()
      await tick(0)
      expect(w.sent).toHaveLength(1)
      release({ status: 200 })
      await expect(result).resolves.toEqual({ ok: true, rev: 2, error: null })
      expect(w.sent.map(s => s.rev)).toEqual([1, 2])
    })

    it('two calls at once: both resolve, and the record is sent once', async () => {
      const w = setup()
      w.change()
      const results = await Promise.all([w.loop.sync(), w.loop.sync()])
      expect(results).toEqual([{ ok: true, rev: 1, error: null }, { ok: true, rev: 1, error: null }])
      expect(w.sent).toHaveLength(1)
    })

    it('a failure resolves with the error (never rejects), and the loop keeps trying', async () => {
      const w = setup()
      w.answer({ status: 503, message: 'down' })
      w.change()
      await expect(w.loop.sync()).resolves.toEqual({ ok: false, rev: 1, error: 'down' })
      await tick(1000)
      expect(w.confirmed).toEqual([1])
    })

    it('sends during a retry wait, without waiting for it', async () => {
      const w = setup()
      w.answer({ status: 500 }, { status: 500 }, { status: 500 })
      w.change()
      await tick(1000 + 1000 + 2000) // three failures; the next try is 4 s away
      expect(w.sent).toHaveLength(3)
      await expect(w.loop.sync()).resolves.toMatchObject({ ok: true })
      expect(w.sent).toHaveLength(4)
    })

    it('before there is anything to save it says so', async () => {
      const w = setup()
      await expect(w.loop.sync()).resolves.toEqual({ ok: false, rev: 0, error: 'nothing to save yet' })
    })

    it('a take() that throws does not reject', async () => {
      const loop = createSyncLoop({
        take: () => {
          throw new Error('bad')
        },
        send: async () => ({ status: 200 }),
        onConfirmed: () => {},
      })
      await expect(loop.sync()).resolves.toMatchObject({ ok: false })
      expect(() => loop.changed()).not.toThrow()
      expect(() => loop.hidden()).not.toThrow()
    })
  })

  describe('the page is hidden or closing', () => {
    it('sends what is unsent at once, in a request that can outlive the page', async () => {
      const w = setup()
      w.change()
      w.loop.hidden()
      await tick(0)
      expect(w.sent).toEqual([expect.objectContaining({ rev: 1, keepalive: true })])
      // The page stayed: the answer counts, and the debounced send finds nothing to do
      expect(w.confirmed).toEqual([1])
      await tick(5000)
      expect(w.sent).toHaveLength(1)
      expect(w.loop.status.status).toBe('saved')
    })

    it('sends nothing when everything is saved', async () => {
      const w = setup()
      w.change()
      await tick(1000)
      w.loop.hidden()
      await tick(0)
      expect(w.sent).toHaveLength(1)
    })

    it('sends even while a request is in flight (the page closing would cancel that one)', async () => {
      const w = setup()
      const release = w.hold()
      w.change()
      await tick(1000)
      w.change()
      w.loop.hidden()
      await tick(0)
      expect(w.sent.map(s => [s.rev, s.keepalive])).toEqual([[1, false], [2, true]])
      expect(w.savedRev).toBe(2)

      // The older request is answered late with a 409: not a conflict
      release({ status: 409, serverRev: 2 })
      await tick(0)
      expect(w.conflicts).toHaveLength(0)
      expect(w.loop.status.status).toBe('saved')
      w.change()
      await tick(1000)
      expect(w.sent.map(s => s.rev)).toEqual([1, 2, 3])
    })

    it('a body over 60 KB is gzipped, and goes in the closing request when that fits', async () => {
      const w = setup()
      w.text = 'x'.repeat(70_000)
      w.change()
      w.loop.hidden()
      await tick(0)
      expect(w.sent).toHaveLength(1)
      expect(w.sent[0]).toMatchObject({ rev: 1, keepalive: true })
      expect(w.sent[0].body).toBeInstanceOf(Uint8Array)
      expect(w.sent[0].body.length).toBeLessThanOrEqual(60_000)
      expect(w.confirmed).toEqual([1])
    })

    it.each([
      ['still over 60 KB gzipped', async text => new Uint8Array(text.length)],
      ['the browser can\'t compress', async () => null],
      ['compressing fails', async () => {
        throw new Error('no')
      }],
    ])('a body over 60 KB goes as an ordinary request when %s', async (_name, compress) => {
      const w = setup()
      w.compress = compress
      w.text = 'x'.repeat(70_000)
      w.change()
      w.loop.hidden()
      await tick(0)
      expect(w.sent).toEqual([expect.objectContaining({ rev: 1, keepalive: false })])
      expect(typeof w.sent[0].body).toBe('string')
    })

    it('a failed closing send changes nothing; the loop goes on as it was', async () => {
      const w = setup()
      w.answer({ status: 0 })
      w.change()
      w.loop.hidden()
      await tick(0)
      expect(w.confirmed).toHaveLength(0)
      await tick(1000)
      expect(w.confirmed).toEqual([1])
    })
  })

  describe('limits', () => {
    it('no more than 30 sends a minute; the newest snapshot goes when the minute allows', async () => {
      const w = setup({ debounce: 100 })
      for (let i = 0; i < 40; i += 1) {
        w.change()
        await tick(200)
      }
      expect(w.sent).toHaveLength(30)
      expect(w.warnings).toHaveLength(1)
      expect(w.loop.status.status).toBe('pending')

      // 60 s after the first send, one more goes, with everything so far
      await tick(60_000 - 40 * 200 + 100)
      expect(w.sent).toHaveLength(31)
      expect(w.sent[30].rev).toBe(40)
      expect(w.savedRev).toBe(40)
    })

    it('sync() is not held back by the limit', async () => {
      const w = setup({ debounce: 100, maxPerMinute: 2 })
      for (let i = 0; i < 3; i += 1) {
        w.change()
        await tick(200)
      }
      expect(w.sent).toHaveLength(2)
      await expect(w.loop.sync()).resolves.toMatchObject({ ok: true, rev: 3 })
    })

    it('stops sending by itself after maxSends sends, and reports it once', async () => {
      const w = setup({ debounce: 100, maxSends: 3, maxPerMinute: 1000 })
      for (let i = 0; i < 6; i += 1) {
        w.change()
        await tick(200)
      }
      expect(w.sent).toHaveLength(3)
      expect(w.count).toBe(3)
      expect(w.limits).toEqual([3])
      expect(w.loop.status).toMatchObject({ status: 'error', error: { kind: 'limit' } })
      expect(w.warnings.filter(m => m.includes('most allowed'))).toHaveLength(1)

      // Nothing more by itself: not on a change, a hidden page, or coming back online
      w.change()
      w.loop.hidden()
      w.loop.online()
      await tick(120_000)
      expect(w.sent).toHaveLength(3)
      expect(w.limits).toEqual([3])
    })

    it('sync() still sends past maxSends, up to twice as many, then nothing is sent', async () => {
      const w = setup({ debounce: 100, maxSends: 2, maxPerMinute: 1000 })
      for (let i = 0; i < 3; i += 1) {
        w.change()
        await tick(200)
      }
      expect(w.sent).toHaveLength(2)
      await expect(w.loop.sync()).resolves.toMatchObject({ ok: true, rev: 3 })
      expect(w.loop.status.status).toBe('saved')
      w.change()
      await tick(1000)
      expect(w.sent).toHaveLength(3) // the change is not sent by itself
      expect(w.loop.status.error.kind).toBe('limit')
      await expect(w.loop.sync()).resolves.toMatchObject({ ok: true, rev: 4 })
      w.rev += 1
      const last = await w.loop.sync()
      expect(last).toMatchObject({ ok: false, rev: 5 })
      expect(last.error).toContain('most allowed')
      expect(w.sent).toHaveLength(4)
    })

    it('counts failed sends and close-time sends, and the count the caller starts with', async () => {
      const w = setup({ maxSends: 4, backoffStart: 100, backoffMax: 100 })
      w.count = 1 // from before a reload
      w.answer({ status: 500 }, { status: 500 })
      w.change()
      await tick(1000) // sent, fails
      await tick(150) // tried again, fails
      expect(w.count).toBe(3)
      w.loop.hidden()
      await tick(0)
      expect(w.count).toBe(4)
      expect(w.sent).toHaveLength(3)
      w.change()
      await tick(10_000)
      expect(w.sent).toHaveLength(3)
      expect(w.limits).toEqual([4])
    })

    it('a count that can\'t be read doesn\'t stop saving', async () => {
      const w = setup()
      w.count = NaN
      w.change()
      await tick(1000)
      expect(w.sent).toHaveLength(1)
    })

    it('a record over the size limit as text is sent gzipped when that fits, and counted as one send', async () => {
      const w = setup({ maxBytes: 1000 })
      w.text = 'x'.repeat(2000) // a tenth of that gzipped, in this test
      w.change()
      await tick(1000)
      expect(w.sent).toHaveLength(1)
      expect(w.sent[0].body).toBeInstanceOf(Uint8Array)
      expect(w.sent[0].body.length).toBeLessThanOrEqual(1000)
      expect(w.oversize).toHaveLength(0)
      expect(w.count).toBe(1)
      expect(w.loop.status.status).toBe('saved')
    })

    it('a record over the largest text the server takes is not gzipped at all', async () => {
      const w = setup({ maxBytes: 1000, maxTextBytes: 1500 })
      let asked = 0
      w.compress = async () => {
        asked += 1
        return new Uint8Array(10)
      }
      w.text = 'x'.repeat(2000)
      w.change()
      await tick(1000)
      expect(asked).toBe(0)
      expect(w.sent).toHaveLength(0)
      expect(w.oversize).toHaveLength(1)
    })

    it('a record over the size limit is not sent, and is reported once per snapshot', async () => {
      const w = setup({ maxBytes: 1000 })
      w.compress = async text => new Uint8Array(text.length) // doesn't shrink
      w.text = 'x'.repeat(2000)
      w.change()
      await tick(1000)
      expect(w.sent).toHaveLength(0)
      expect(w.oversize).toHaveLength(1)
      expect(w.loop.status).toMatchObject({ status: 'error', error: { kind: 'oversize' } })
      await tick(60_000)
      expect(w.oversize).toHaveLength(1)

      // Smaller again (the experiment removed something): it saves
      w.text = 'small'
      w.change()
      await tick(1000)
      expect(w.sent).toHaveLength(1)
      expect(w.loop.status.status).toBe('saved')
    })

    it('measures size in bytes, not characters', () => {
      expect(byteSize('abc', 10)).toBe(3)
      expect(byteSize('ééééé', 9)).toBe(10) // 5 characters, 10 bytes: over a limit of 9
      expect(byteSize('x'.repeat(50), 10)).toBeGreaterThan(10)
    })

    it('the defaults are the ones decided', () => {
      expect(SYNC_DEFAULTS).toMatchObject({ debounce: 1000, maxWait: 5000, maxPerMinute: 30, maxSends: 10_000, backoffMax: 60_000, maxBytes: 4_000_000 })
    })
  })

  describe('answers that arrive late, twice, or out of order', () => {
    it('a save whose answer was lost is sent again, and the second answer settles it', async () => {
      const w = setup()
      w.answer({ status: 0 }) // the server stored it; the answer never came
      w.change()
      await tick(1000)
      await tick(1000)
      expect(w.sent.map(s => s.rev)).toEqual([1, 1])
      expect(w.confirmed).toEqual([1])
    })

    it('stop() ends everything, including an answer still on its way', async () => {
      const w = setup()
      const release = w.hold()
      w.change()
      await tick(1000)
      w.loop.stop()
      release({ status: 200 })
      await tick(0)
      expect(w.confirmed).toHaveLength(0)
      w.change()
      await tick(10_000)
      expect(w.sent).toHaveLength(1)
    })

    it('callbacks that throw do not stop the loop', async () => {
      const sent = []
      let rev = 0
      let savedRev = 0
      const loop = createSyncLoop({
        take: () => ({ rev, savedRev, body: () => '{}' }),
        send: async (body, { rev: r }) => {
          sent.push(r)
          return { status: 200 }
        },
        onConfirmed: (r) => {
          savedRev = r
          throw new Error('confirm failed')
        },
        onStatus: () => {
          throw new Error('status failed')
        },
        warn: () => {},
      })
      rev = 1
      loop.changed()
      await tick(1000)
      rev = 2
      loop.changed()
      await tick(1000)
      expect(sent).toEqual([1, 2])
    })
  })
})
