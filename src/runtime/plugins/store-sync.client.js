/**
 * @fileoverview Client-only plugin that handles all persistence sync for the store.
 *
 * Pinia SSR hydration replaces useCookie() refs with plain objects, breaking
 * two-way bindings. This plugin runs on the client after hydration and:
 *
 * 1. Prevents Pinia SSR hydration from overwriting client-side state
 * 2. Restores the position (stepper states, conditions, the current View)
 *    from the local snapshot
 * 3. Watches store.cookieState → writes changes to document.cookie
 * 4. Watches the record and the position → writes the snapshot, one value
 *    in localStorage (core/sync/snapshot.js)
 */
import { defineNuxtPlugin } from '#imports'
import { watch } from 'vue'
import useSmileStore, { initDev, COOKIE_MAX_AGE } from '../stores/smilestore'
import { RESUME_KEYS, LOCAL_KEYS } from '../core/sync/snapshot.js'
import appconfig from '../core/config.js'

/** @type {import('#app').Plugin} */
export default defineNuxtPlugin((nuxtApp) => {
  // Prevent Pinia SSR hydration from overwriting our store state.
  // The server-rendered state has stale/default values; the client
  // should read from cookies and localStorage instead.
  delete nuxtApp.payload?.pinia?.smilestore

  const store = useSmileStore()
  const prefix = `smile_${appconfig.codeName}_`

  // --- 1. Restore the position from the local snapshot ---
  // The record itself is restored by store.loadData(), which compares the
  // local copy with the server's.
  try {
    store.restoreLocal()
  }
  catch (e) {
    console.warn('[store-sync] Could not read the local snapshot:', e)
  }

  // --- 2. Watch cookieState → document.cookie ---
  watch(
    () => ({ ...store.cookieState }),
    (val) => {
      Object.entries(val).forEach(([key, value]) => {
        const encoded = encodeURIComponent(JSON.stringify(value))
        document.cookie = `${prefix}${key}=${encoded}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
      })
    },
    { deep: true },
  )

  // --- 3. Watch store.dev — reset to defaults if externally cleared to null ---
  watch(
    () => store.dev,
    (val) => {
      if (val === null || val === undefined) {
        store.dev = { ...initDev }
      }
    },
  )

  // --- 4. Watch the record and the position → the local snapshot ---
  // Everything a reload needs is written together, as one value, so the
  // record and the position can't disagree. The watcher only says "something
  // changed": the store waits a moment (one event changes several things),
  // compares with the last snapshot, bumps rev if they differ, and writes.
  watch(
    () => [
      store.data,
      store.private,
      store.cookieState.lastRoute,
      store.cookieState.participantId,
      store.browserEphemeral.dataLoaded,
      store.browserEphemeral.loadFailed,
      ...RESUME_KEYS.map(key => store.localState[key]),
      ...LOCAL_KEYS.map(key => store.localState[key]),
    ],
    () => store.requestSnapshot(),
    { deep: true },
  )

  // --- 5. When the page is hidden or closing, or the network changes ---
  // Write the snapshot at once and send what's unsent (core/sync/loop.js).
  const captureNow = () => {
    try {
      store.captureSnapshot()
    }
    catch (e) {
      console.warn('[store-sync] Could not write the local snapshot:', e)
    }
  }
  const hidden = () => {
    captureNow()
    try {
      store.saveOnClose()
    }
    catch (e) {
      console.warn('[store-sync] Could not send the snapshot:', e)
    }
  }
  window.addEventListener('pagehide', hidden)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hidden()
  })
  // Settings from before the sync loop, which no longer do anything
  if (import.meta.dev) {
    const old = ['VITE_AUTO_SAVE_DATA', 'VITE_MAX_WRITES', 'VITE_MIN_WRITE_INTERVAL'].filter(key => import.meta.env[key] !== undefined && import.meta.env[key] !== '')
    if (old.length) {
      console.warn(`[smile] ${old.join(', ')} no longer ${old.length > 1 ? 'have' : 'has'} an effect: data is saved by itself about a second after every change. Remove ${old.length > 1 ? 'them' : 'it'} from your env files.`)
    }
  }

  window.addEventListener('online', () => store.networkChanged(true))
  window.addEventListener('offline', () => store.networkChanged(false))
})
