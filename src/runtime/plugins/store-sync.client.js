/**
 * @fileoverview Client-only plugin that handles all persistence sync for the store.
 *
 * Pinia SSR hydration replaces useCookie() refs with plain objects, breaking
 * two-way bindings. This plugin runs on the client after hydration and:
 *
 * 1. Prevents Pinia SSR hydration from overwriting client-side state
 * 2. Patches store.localState from localStorage (restoring Tier 2 data)
 * 3. Watches store.cookieState → writes changes to document.cookie
 * 4. Watches store.localState → writes changes to localStorage
 */
import { defineNuxtPlugin } from '#imports'
import { watch } from 'vue'
import useSmileStore, { initLocalState, initDev, COOKIE_MAX_AGE } from '../stores/smilestore'
import appconfig from '../core/config.js'

export default defineNuxtPlugin((nuxtApp) => {
  // Prevent Pinia SSR hydration from overwriting our store state.
  // The server-rendered state has stale/default values; the client
  // should read from cookies and localStorage instead.
  delete nuxtApp.payload?.pinia?.smilestore

  const store = useSmileStore()
  const prefix = `smile_${appconfig.codeName}_`

  // --- 1. Patch localState from localStorage ---
  const raw = localStorage.getItem(appconfig.localStorageKey)
  if (raw) {
    try {
      const saved = JSON.parse(raw)
      Object.keys(initLocalState).forEach((key) => {
        if (key in saved) {
          store.localState[key] = saved[key]
        }
      })
    }
    catch (e) {
      console.warn('[store-sync] Failed to parse localStorage:', e)
    }
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
  if (appconfig.mode === 'development') {
    watch(
      () => store.dev,
      (val) => {
        if (val === null || val === undefined) {
          store.dev = { ...initDev }
        }
      },
    )
  }

  // --- 4. Watch localState → localStorage ---
  watch(
    () => store.localState,
    (val) => {
      localStorage.setItem(appconfig.localStorageKey, JSON.stringify(val))
    },
    { deep: true },
  )
})
