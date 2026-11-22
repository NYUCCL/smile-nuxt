<script setup>
/**
 * Covers the page when a returning participant's record could not be loaded:
 * the server could not be reached and this browser has no copy of it (the
 * store's `loadFailed`). Without the record, anything done on the page would
 * be thrown away once it loads, so the page waits here. The load is tried
 * again every few seconds and when the browser comes back online; when it
 * works, the store reloads the page from the record.
 */
import { onBeforeUnmount, watch } from 'vue'
import useSmileStore from '../../stores/smilestore'

defineProps({
  // In the dev tools: in place of the page instead of over the whole window
  inline: { type: Boolean, default: false },
})

const RETRY_MS = 3000

const store = useSmileStore()
let timer = null
let trying = false

async function retry() {
  if (trying || !store.browserEphemeral.loadFailed) return
  trying = true
  try {
    await store.loadData()
  }
  finally {
    trying = false
  }
}

function stop() {
  clearInterval(timer)
  timer = null
  if (typeof window !== 'undefined') window.removeEventListener('online', retry)
}

watch(() => store.browserEphemeral.loadFailed, (failed) => {
  stop()
  if (!failed || typeof window === 'undefined') return
  timer = setInterval(retry, RETRY_MS)
  window.addEventListener('online', retry)
}, { immediate: true })
onBeforeUnmount(stop)
</script>

<template>
  <div
    v-if="store.browserEphemeral.loadFailed"
    class="flex items-center justify-center bg-background/95 p-6"
    :class="inline ? 'h-full w-full' : 'fixed inset-0 z-[1000]'"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="reconnecting-title"
    data-testid="reconnecting-notice"
  >
    <div class="max-w-md text-center">
      <h2
        id="reconnecting-title"
        class="text-xl font-semibold mb-3"
      >
        Reconnecting
      </h2>
      <p class="mb-5 text-muted-foreground">
        We couldn't load your progress. Please check your internet connection.
        This page will continue by itself, from where you left off, as soon as the connection is back.
      </p>
      <button
        type="button"
        class="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        data-testid="reconnecting-retry"
        @click="retry"
      >
        Try again now
      </button>
    </div>
  </div>
</template>
