<script setup>
/**
 * A small icon in the status bar that shows the participant whether their
 * progress is being saved. It is meant to be easy to ignore: muted, no text
 * (the words are in the tooltip and for screen readers), and nothing at all
 * until the participant has a record.
 *
 * Saves are frequent and take a fraction of a second, so the "saving" icon
 * is held for a moment after each one; otherwise it would only flicker.
 */
import { CloudAlert, CloudCheck, CloudOff, CloudUpload } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import useSmileStore from '../../stores/smilestore'
import { syncDisplay } from '../../core/sync/display'

const HOLD_MS = 800

const store = useSmileStore()

const display = computed(() => syncDisplay({
  loaded: store.browserEphemeral.dataLoaded,
  sync: store.browserEphemeral.sync,
  unsaved: store.browserEphemeral.unsavedChanges,
  otherTab: store.browserEphemeral.otherTab,
}))

// 'active' stays true for HOLD_MS after the last save finishes
const held = ref(false)
let timer = null
watch(() => display.value.active, (active) => {
  clearTimeout(timer)
  if (active) held.value = true
  else {
    timer = setTimeout(() => {
      held.value = false
    }, HOLD_MS)
  }
}, { immediate: true })
onBeforeUnmount(() => clearTimeout(timer))

const VIEWS = {
  saving: { icon: CloudUpload, text: 'Saving your progress' },
  saved: { icon: CloudCheck, text: 'Your progress is saved' },
  offline: { icon: CloudOff, text: 'No connection. Your progress is kept on this device and will be saved when the connection is back.' },
  retrying: { icon: CloudOff, text: 'Your progress could not be saved just now. It is kept on this device and will be tried again.' },
  stopped: { icon: CloudAlert, text: 'Your latest progress is kept on this device but is not being saved.' },
}

const view = computed(() => {
  const { state } = display.value
  // No record yet: nothing to show. Another tab: its notice covers the page.
  if (state === 'none' || state === 'paused') return null
  if (state === 'pending' || state === 'saving' || (state === 'saved' && held.value)) return { key: 'saving', ...VIEWS.saving }
  return { key: state, ...VIEWS[state] }
})
</script>

<template>
  <span
    v-if="view"
    class="inline-flex items-center text-muted-foreground/60"
    role="status"
    :title="view.text"
    :data-state="view.key"
    data-testid="sync-indicator"
  >
    <component
      :is="view.icon"
      class="size-4"
      :class="{ 'animate-pulse': view.key === 'saving' }"
      aria-hidden="true"
    />
    <span class="sr-only">{{ view.text }}</span>
  </span>
</template>
