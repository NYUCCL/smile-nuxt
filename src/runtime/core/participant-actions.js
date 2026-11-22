/**
 * @fileoverview Actions on the participant's state that both the API
 * (composables/useAPI.js) and the navigation middleware
 * (middleware/timeline.global.js) perform. Plain functions: each takes the
 * store and whatever else it needs.
 */
import seedrandom from 'seedrandom'
import { uuidv4 } from '../utils/uuid.js'
import { initCookieState } from '../stores/smilestore'
import { legacyDataKey } from './sync/snapshot.js'

/**
 * The app's base URL with a leading and a trailing slash.
 * @param {string|undefined} baseURL - `useRuntimeConfig().app.baseURL`
 * @returns {string} '/' when unset, otherwise e.g. '/study/'
 */
export function normalizeBase(baseURL) {
  let base = baseURL || '/'
  if (!base.startsWith('/')) base = '/' + base
  return base.endsWith('/') ? base : base + '/'
}

/**
 * The URL of a file under the app's base URL.
 * @param {string|undefined} baseURL - `useRuntimeConfig().app.baseURL`
 * @param {string} name - Path relative to the base; a leading slash is ignored
 * @returns {string} e.g. withBase('/study/', '/a.png') is '/study/a.png'
 */
export function withBase(baseURL, name) {
  return normalizeBase(baseURL) + String(name).replace(/^\/+/, '')
}

/**
 * Removes everything the browser stores for this participant (the local
 * snapshot and the cookies), then loads the app's first page: '/', '/dev/'
 * or '/presentation/' under the base URL, matching where the browser is now.
 *
 * The store is not reset (no $reset): the store-sync watchers would write the
 * default values back to the cookies and localStorage before the page loads.
 * @param {object} store - The smile store
 * @param {string} [baseURL] - `useRuntimeConfig().app.baseURL`
 * @returns {void}
 */
export function resetLocalState(store, baseURL) {
  // Stop snapshots first: otherwise the write made as the page closes puts the state back.
  store.stopSnapshots()
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(store.config.localStorageKey)
    localStorage.removeItem(legacyDataKey(store.config.localStorageKey))
  }
  if (typeof document !== 'undefined') {
    const prefix = `smile_${store.config.codeName}_`
    for (const key of Object.keys(initCookieState)) {
      document.cookie = `${prefix}${key}=; path=/; max-age=0; SameSite=Lax`
    }
  }
  if (typeof window !== 'undefined') {
    const base = normalizeBase(baseURL)
    const pathname = window.location.pathname
    // The path below the base URL, with its leading slash
    const path = pathname.startsWith(base) ? pathname.slice(base.length - 1) : pathname
    let target = ''
    if (path.startsWith('/dev/') || path === '/dev') target = 'dev/'
    else if (path.startsWith('/presentation/') || path === '/presentation') target = 'presentation/'
    window.location.href = window.location.origin + base + target
  }
}

/**
 * Records consent, and makes the participant known (which creates their
 * server record) if they are not yet.
 * @param {object} store - The smile store
 * @returns {Promise<void>}
 */
export async function completeConsent(store) {
  store.setConsented()
  if (!store.cookieState.knownUser) {
    await store.setKnown()
  }
}

/**
 * Makes sure the participant has a server record and the store is connected
 * to it: a new participant is made known and consented; a known participant
 * whose data is not loaded yet (after a page load) has it loaded (#58).
 * @param {object} store - The smile store
 * @returns {Promise<void>}
 */
export async function connectDB(store) {
  if (!store.cookieState.knownUser) {
    await store.setKnown()
    store.setConsented()
  }
  else if (!store.isDataLoaded) {
    await store.loadData()
  }
}

/**
 * Seeds the global random number generator (Math.random).
 * @param {string} [seed] - The seed; a random UUID when not given
 * @returns {void}
 */
export function randomSeed(seed = uuidv4()) {
  seedrandom(seed, { global: true })
}
