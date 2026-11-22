import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  normalizeBase,
  withBase,
  resetLocalState,
  completeConsent,
  connectDB,
  randomSeed,
} from '../../src/runtime/core/participant-actions.js'
import { initCookieState } from '../../src/runtime/stores/smilestore'
import { legacyDataKey } from '../../src/runtime/core/sync/snapshot.js'

function mockStore(overrides = {}) {
  return {
    config: { localStorageKey: 'smilestore-test', codeName: 'test' },
    cookieState: { knownUser: false },
    isDataLoaded: false,
    stopSnapshots: vi.fn(),
    setKnown: vi.fn(async () => {}),
    setConsented: vi.fn(),
    loadData: vi.fn(async () => {}),
    ...overrides,
  }
}

describe('normalizeBase / withBase', () => {
  it.each([
    [undefined, '/'],
    ['', '/'],
    ['/', '/'],
    ['/study', '/study/'],
    ['/study/', '/study/'],
    ['study', '/study/'],
  ])('normalizeBase(%j) is %j', (base, expected) => {
    expect(normalizeBase(base)).toBe(expected)
  })

  it.each([
    [undefined, 'a.png', '/a.png'],
    ['/', '/a.png', '/a.png'],
    ['/study/', 'a.png', '/study/a.png'],
    ['/study/', '/a.png', '/study/a.png'],
    ['/study', 'stimuli/a.png', '/study/stimuli/a.png'],
  ])('withBase(%j, %j) is %j', (base, name, expected) => {
    expect(withBase(base, name)).toBe(expected)
  })
})

describe('resetLocalState', () => {
  let originalLocation
  let cookieWrites

  beforeEach(() => {
    originalLocation = window.location
    cookieWrites = []
    vi.spyOn(document, 'cookie', 'set').mockImplementation((value) => {
      cookieWrites.push(value)
    })
    vi.spyOn(window.localStorage, 'removeItem')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })

  function setLocation(pathname) {
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://localhost:3000', pathname, href: 'http://localhost:3000' + pathname },
      writable: true,
    })
  }

  it('stops snapshots, removes the local copies and expires every cookie the store keeps', () => {
    setLocation('/consent')
    const store = mockStore()

    resetLocalState(store, '/')

    expect(store.stopSnapshots).toHaveBeenCalled()
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('smilestore-test')
    expect(window.localStorage.removeItem).toHaveBeenCalledWith(legacyDataKey('smilestore-test'))
    expect(cookieWrites).toEqual(
      Object.keys(initCookieState).map(key => `smile_test_${key}=; path=/; max-age=0; SameSite=Lax`),
    )
    // The nine cookies the store has
    expect(Object.keys(initCookieState).sort()).toEqual(
      ['completionCode', 'consented', 'done', 'knownUser', 'lastRoute', 'participantId', 'seedID', 'seedSet', 'withdrawn'],
    )
  })

  it.each([
    ['/', '/consent', 'http://localhost:3000/'],
    ['/', '/dev', 'http://localhost:3000/dev/'],
    ['/', '/dev/consent', 'http://localhost:3000/dev/'],
    ['/', '/presentation/consent', 'http://localhost:3000/presentation/'],
    [undefined, '/developer', 'http://localhost:3000/'],
    ['/study/', '/study/consent', 'http://localhost:3000/study/'],
    ['/study/', '/study/dev/consent', 'http://localhost:3000/study/dev/'],
    ['/study', '/study/presentation', 'http://localhost:3000/study/presentation/'],
    ['/study/', '/study', 'http://localhost:3000/study/'],
  ])('with base %j at %j, loads %j', (base, pathname, expected) => {
    setLocation(pathname)

    resetLocalState(mockStore(), base)

    expect(window.location.href).toBe(expected)
  })
})

describe('completeConsent', () => {
  it('records consent and makes an unknown participant known', async () => {
    const store = mockStore()
    await completeConsent(store)
    expect(store.setConsented).toHaveBeenCalled()
    expect(store.setKnown).toHaveBeenCalled()
  })

  it('does not make a known participant known again', async () => {
    const store = mockStore({ cookieState: { knownUser: true } })
    await completeConsent(store)
    expect(store.setConsented).toHaveBeenCalled()
    expect(store.setKnown).not.toHaveBeenCalled()
  })
})

describe('connectDB', () => {
  it('makes a new participant known and consented', async () => {
    const store = mockStore()
    await connectDB(store)
    expect(store.setKnown).toHaveBeenCalled()
    expect(store.setConsented).toHaveBeenCalled()
    expect(store.loadData).not.toHaveBeenCalled()
  })

  it('loads the data of a known participant whose data is not loaded', async () => {
    const store = mockStore({ cookieState: { knownUser: true }, isDataLoaded: false })
    await connectDB(store)
    expect(store.loadData).toHaveBeenCalled()
    expect(store.setKnown).not.toHaveBeenCalled()
    expect(store.setConsented).not.toHaveBeenCalled()
  })

  it('does nothing for a known participant whose data is loaded', async () => {
    const store = mockStore({ cookieState: { knownUser: true }, isDataLoaded: true })
    await connectDB(store)
    expect(store.loadData).not.toHaveBeenCalled()
    expect(store.setKnown).not.toHaveBeenCalled()
  })
})

describe('randomSeed', () => {
  const originalRandom = Math.random

  afterEach(() => {
    Math.random = originalRandom
  })

  it('gives the same numbers for the same seed', () => {
    randomSeed('abc')
    const first = [Math.random(), Math.random()]
    randomSeed('abc')
    expect([Math.random(), Math.random()]).toEqual(first)
  })

  it('uses a new seed each time when none is given', () => {
    randomSeed()
    const first = Math.random()
    randomSeed()
    expect(Math.random()).not.toBe(first)
  })
})
