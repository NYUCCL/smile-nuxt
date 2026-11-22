import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// test/setup/mocks.js replaces the log store for every test; this file tests the real one.
vi.unmock('../../../src/runtime/stores/log')

const toast = vi.hoisted(() => ({ warning: vi.fn(), error: vi.fn(), success: vi.fn() }))
vi.mock('vue-sonner', () => ({ toast }))

const smilestore = vi.hoisted(() => ({ dev: { notificationFilter: 'Errors only' } }))
vi.mock('../../../src/runtime/stores/smilestore.js', () => ({ default: () => smilestore }))

const { default: useLog, MAX_HISTORY } = await import('../../../src/runtime/stores/log.js')

describe('log store', () => {
  let log

  beforeEach(() => {
    setActivePinia(createPinia())
    log = useLog()
    smilestore.dev.notificationFilter = 'Errors only'
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the newest MAX_HISTORY entries of history and page_history', () => {
    expect(MAX_HISTORY).toBe(2000)
    for (let i = 0; i < MAX_HISTORY + 25; i++) log.log('message', i)

    for (const list of [log.history, log.page_history]) {
      expect(list).toHaveLength(MAX_HISTORY)
      expect(list[0].message).toBe('message 25')
      expect(list.at(-1).message).toBe(`message ${MAX_HISTORY + 24}`)
    }
  })

  it('caps entries added with addToHistory too', () => {
    for (let i = 0; i < MAX_HISTORY + 1; i++) log.addToHistory({ type: 'log', message: String(i) })
    expect(log.history).toHaveLength(MAX_HISTORY)
    expect(log.history[0].message).toBe('1')
  })

  it('clearing the page history leaves the session history', () => {
    log.log('one')
    log.clearPageHistory()
    log.log('two')
    expect(log.history.map(m => m.message)).toEqual(['one', 'two'])
    expect(log.page_history.map(m => m.message)).toEqual(['two'])
  })

  it('records the type, the message and where the call was made', () => {
    log.warn('careful', { a: 1 })
    const entry = log.history[0]
    expect(entry.type).toBe('warn')
    expect(entry.message).toBe('careful {"a":1}')
    expect(typeof entry.time).toBe('string')
    // the trace is the caller of log.warn: this file
    expect(entry.trace).toContain('log.test.js')
  })

  it('prints each level to the console as before', () => {
    log.log('a')
    expect(console.log).not.toHaveBeenCalled()
    log.debug('b')
    expect(console.log).toHaveBeenCalledWith('b')
    log.warn('c')
    expect(console.warn).toHaveBeenCalledWith('c')
    log.error('d')
    expect(console.error).toHaveBeenCalledWith('d')
    log.success('e')
    expect(console.log).toHaveBeenCalledWith('e')
    expect(log.history.map(m => m.type)).toEqual(['log', 'debug', 'warn', 'error', 'success'])
  })

  it.each([
    ['None', []],
    ['Errors only', ['error']],
    ['Warnings only', ['warning']],
    ['Warnings and Errors', ['warning', 'error']],
    ['Success only', ['success']],
    ['All', ['success']],
  ])('with the notification filter %j, shows toasts for %j', (filter, shown) => {
    smilestore.dev.notificationFilter = filter
    log.log('a')
    log.debug('a')
    log.warn('a')
    log.error('a')
    log.success('a')
    for (const kind of ['warning', 'error', 'success']) {
      expect(toast[kind]).toHaveBeenCalledTimes(shown.includes(kind) ? 1 : 0)
    }
  })
})
