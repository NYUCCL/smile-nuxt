/**
 * @fileoverview Client-only plugin that syncs store.dev changes back to the
 * dev cookie. Needed because Pinia SSR hydration replaces the useCookie() ref
 * with a plain object, breaking the two-way cookie binding.
 */
import { defineNuxtPlugin } from '#imports'
import { watch } from 'vue'
import useSmileStore from '../stores/smilestore'
import appconfig from '../core/config.js'

export default defineNuxtPlugin(() => {
  if (appconfig.mode !== 'development') return

  const store = useSmileStore()
  const cookieName = `smile_${appconfig.codeName}_dev`

  // Sync store.dev → cookie on every change, writing directly to document.cookie
  watch(
    () => store.dev,
    (val) => {
      const encoded = encodeURIComponent(JSON.stringify(val))
      document.cookie = `${cookieName}=${encoded}; path=/; max-age=${86400 * 365}; SameSite=Lax`
    },
    { deep: true }
  )
})
