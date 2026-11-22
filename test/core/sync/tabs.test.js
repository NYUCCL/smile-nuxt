import { describe, it, expect } from 'vitest'
import { createTabGuard, isNewer } from '../../../src/runtime/core/sync/tabs.js'

/**
 * Step 5 of plans/sync_engine.md: two tabs. The channel here delivers a
 * message to every other tab on it, as BroadcastChannel does (never to the
 * sender). The store's side (what pausing does) is in snapshotStore.test.js.
 */
function network() {
  const channels = []
  return {
    channel() {
      const c = {
        onmessage: null,
        closed: false,
        postMessage(data) {
          if (c.closed) throw new Error('closed')
          for (const other of channels) {
            if (other !== c && !other.closed) other.onmessage?.({ data: structuredClone(data) })
          }
        },
        close() {
          c.closed = true
        },
      }
      channels.push(c)
      return c
    },
    /** Something else on the channel says this. */
    say(data) {
      for (const c of channels) c.onmessage?.({ data })
    },
  }
}

function tab(net, id, startedAt, { active = true } = {}) {
  const t = { id, active, paused: 0 }
  t.guard = createTabGuard({
    channel: net ? net.channel() : null,
    id,
    startedAt,
    isActive: () => t.active && !t.paused,
    onOtherTab: () => {
      t.paused += 1
    },
  })
  return t
}

describe('two tabs', () => {
  it('the tab opened last is the newer; the id settles a tie', () => {
    expect(isNewer({ startedAt: 2, id: 'a' }, { startedAt: 1, id: 'b' })).toBe(true)
    expect(isNewer({ startedAt: 1, id: 'a' }, { startedAt: 2, id: 'b' })).toBe(false)
    expect(isNewer({ startedAt: 1, id: 'b' }, { startedAt: 1, id: 'a' })).toBe(true)
    expect(isNewer({ startedAt: 1, id: 'a' }, { startedAt: 1, id: 'b' })).toBe(false)
  })

  it('a second tab pauses the first, and is not paused itself', () => {
    const net = network()
    const first = tab(net, 'a', 100)
    first.guard.announce()
    const second = tab(net, 'b', 200)
    second.guard.announce()
    expect(first.paused).toBe(1)
    expect(second.paused).toBe(0)
  })

  it('a third tab pauses the second; the first, already paused, is not told again', () => {
    const net = network()
    const tabs = [tab(net, 'a', 100), tab(net, 'b', 200), tab(net, 'c', 300)]
    for (const t of tabs) t.guard.announce()
    expect(tabs.map(t => t.paused)).toEqual([1, 1, 0])
  })

  it('a reload makes a paused tab the newest again', () => {
    const net = network()
    const first = tab(net, 'a', 100)
    const second = tab(net, 'b', 200)
    second.guard.announce()
    expect(first.paused).toBe(1)
    first.guard.close()
    const reloaded = tab(net, 'a2', 300) // "Continue here"
    reloaded.guard.announce()
    expect(second.paused).toBe(1)
    expect(reloaded.paused).toBe(0)
  })

  it('two tabs restored together: whichever loads first, only the older stops', () => {
    for (const order of [['a', 'b'], ['b', 'a']]) {
      const net = network()
      const tabs = { a: tab(net, 'a', 100), b: tab(net, 'b', 200) }
      for (const id of order) tabs[id].guard.announce()
      expect([tabs.a.paused, tabs.b.paused], order.join()).toEqual([1, 0])
    }
  })

  it('two tabs started in the same millisecond: exactly one stops', () => {
    for (const order of [['a', 'b'], ['b', 'a']]) {
      const net = network()
      const tabs = { a: tab(net, 'a', 100), b: tab(net, 'b', 100) }
      for (const id of order) tabs[id].guard.announce()
      expect(tabs.a.paused + tabs.b.paused, order.join()).toBe(1)
    }
  })

  it('a tab that holds no participant (before consent, a docs page) is left alone', () => {
    const net = network()
    const idle = tab(net, 'a', 100, { active: false })
    const second = tab(net, 'b', 200)
    second.guard.announce()
    expect(idle.paused).toBe(0)
    // and when it loads the participant later, it is the one that stops:
    // the newer tab answers its hello
    idle.active = true
    idle.guard.announce()
    expect(idle.paused).toBe(1)
    expect(second.paused).toBe(0)
  })

  it('ignores whatever else arrives on the channel', () => {
    const net = network()
    const t = tab(net, 'a', 100)
    const bad = [
      null, undefined, 'hello', 42, [], {}, { type: 'hello' }, { type: 'hello', id: 'z' },
      { type: 'hello', id: '', startedAt: 999 }, { type: 'hello', id: 7, startedAt: 999 },
      { type: 'hello', id: 'z', startedAt: '999' }, { type: 'hello', id: 'z', startedAt: NaN },
      { type: 'hello', id: 'z', startedAt: Infinity }, { type: 'bye', id: 'z', startedAt: 999 },
      { type: 'hello', id: 'a', startedAt: 999 }, // its own id
    ]
    for (const data of bad) expect(() => net.say(data)).not.toThrow()
    expect(t.paused).toBe(0)
    net.say({ type: 'hello', id: 'z', startedAt: 999 })
    expect(t.paused).toBe(1)
  })

  it('a getter that throws, or a callback that throws, does not escape', () => {
    const net = network()
    createTabGuard({
      channel: net.channel(),
      id: 'a',
      startedAt: 1,
      isActive: () => true,
      onOtherTab: () => {
        throw new Error('pause failed')
      },
    })
    expect(() => net.say({ type: 'hello', id: 'z', startedAt: 9 })).not.toThrow()
    expect(() => net.say({ get type() {
      throw new Error('bad message')
    } })).not.toThrow()
  })

  it('does nothing without a channel, and survives a closed one', () => {
    const none = tab(null, 'a', 100)
    expect(() => none.guard.announce()).not.toThrow()
    expect(() => none.guard.close()).not.toThrow()

    const net = network()
    const t = tab(net, 'b', 100)
    t.guard.close()
    expect(() => t.guard.announce()).not.toThrow()
    net.say({ type: 'hello', id: 'z', startedAt: 999 })
    expect(t.paused).toBe(0)
  })
})
