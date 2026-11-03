<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import useAPI from '../../../composables/useAPI'

/**
 * API instance for accessing Smile app state and actions
 * @type {import('@/core/composables/useAPI')}
 */
const api = useAPI()

/**
 * Database info fetched from server
 * @type {import('vue').Ref<{type: string, url: string}|null>}
 */
const dbInfo = ref(null)
if (import.meta.client) {
  fetch('/api/db-info')
    .then(r => r.json())
    .then((data) => { dbInfo.value = data })
    .catch(() => {})
}

/**
 * Timer ref for updating last write time
 * @type {import('vue').Ref<number|null>}
 */
const timer = ref(null)

/**
 * Computed sync state for UI display
 * @type {import('vue').ComputedRef<string>}
 */
const _sync_state = computed(() => {
  if (api.store.browserEphemeral.unsavedChanges && api.store.browserEphemeral.dataLoaded) {
    return 'is-warning is-completed'
  }
  else if (!api.store.browserEphemeral.unsavedChanges && api.store.browserEphemeral.dataLoaded) {
    return 'is-success is-completed'
  }
  else {
    return ''
  }
})

/**
 * Stops the timer interval
 */
const stopTimer = () => {
  clearInterval(timer.value)
  timer.value = null
}

/**
 * Starts the timer interval for updating last write time
 */
const startTimer = () => {
  timer.value = setInterval(() => {
    if (!api.store.browserEphemeral.dataLoaded) {
      last_write_time_string.value = `Never saved`
    }
    else {
      let time = ((Date.now() - api.store.localState.lastWrite) / 1000).toFixed(1)
      if (time < 60) {
        last_write_time_string.value = `${time} secs ago`
      }
      else if (time < 180) {
        time = (time / 60).toFixed(2)
        last_write_time_string.value = `${time} mins ago`
      }
      else if (time < 60 * 10) {
        last_write_time_string.value = `a few mins ago`
      }
      else {
        last_write_time_string.value = `a long time ago`
      }
    }
  }, 500)
}

/**
 * Last write time string for display
 * @type {import('vue').Ref<string>}
 */
const last_write_time_string = ref('') // default

onMounted(() => {
  startTimer()
})

onBeforeUnmount(() => {
  stopTimer()
})
</script>

<template>
  <!-- Database status info panel -->
  <table class="w-full">
    <tbody>
      <!-- Database row -->
      <tr
        v-if="dbInfo"
        class="sd-table-row-base sd-table-row-even hidden sm:table-row"
      >
        <td class="sd-table-cell-base sd-table-cell-left sd-label whitespace-nowrap">
          Database
        </td>
        <td class="sd-table-cell-base sd-table-cell-left sd-mono break-all">
          {{ dbInfo.type }}<br><span class="text-sd-text-muted">{{ dbInfo.url }}</span>
        </td>
      </tr>
      <!-- Last route row -->
      <tr class="sd-table-row-base sd-table-row-odd hidden sm:table-row">
        <td class="sd-table-cell-base sd-table-cell-left sd-label whitespace-nowrap">
          Last route
        </td>
        <td class="sd-table-cell-base sd-table-cell-left sd-mono break-all">
          {{ '/' + api.store.cookieState.lastRoute }}
        </td>
      </tr>
      <!-- Mode row -->
      <tr class="sd-table-row-base sd-table-row-even hidden sm:table-row">
        <td class="sd-table-cell-base sd-table-cell-left sd-label whitespace-nowrap">
          Mode
        </td>
        <td class="sd-table-cell-base sd-table-cell-left sd-mono break-all">
          {{ api.config.mode }}
        </td>
      </tr>
      <!-- DocRef row -->
      <tr class="sd-table-row-base sd-table-row-odd">
        <td class="sd-table-cell-base sd-table-cell-left sd-label whitespace-nowrap">
          Participant ID
        </td>
        <td class="sd-table-cell-base sd-table-cell-left sd-mono break-all">
          {{ api.store.cookieState.participantId || '(none)' }}
        </td>
      </tr>
      <!-- Writes row -->
      <tr class="sd-table-row-base sd-table-row-even hidden sm:table-row">
        <td class="sd-table-cell-base sd-table-cell-left sd-label whitespace-nowrap">
          Writes
        </td>
        <td class="sd-table-cell-base sd-table-cell-left sd-mono break-all">
          {{ api.store.localState.totalWrites }} out of {{ api.config.maxWrites }} max
        </td>
      </tr>
      <!-- Last write row -->
      <tr class="sd-table-row-base sd-table-row-odd hidden sm:table-row">
        <td class="sd-table-cell-base sd-table-cell-left sd-label whitespace-nowrap">
          Last save
        </td>
        <td class="sd-table-cell-base sd-table-cell-left sd-mono break-all">
          {{ last_write_time_string }}
        </td>
      </tr>
      <!-- Auto save row -->
      <tr class="sd-table-row-base sd-table-row-even hidden sm:table-row">
        <td class="sd-table-cell-base sd-table-cell-left sd-label whitespace-nowrap">
          Auto save
        </td>
        <td class="sd-table-cell-base sd-table-cell-left sd-mono break-all">
          {{ api.config.autoSave }}
        </td>
      </tr>
      <!-- Size row -->
      <tr class="sd-table-row-base sd-table-row-odd hidden sm:table-row sd-table-border-bottom">
        <td class="sd-table-cell-base sd-table-cell-left sd-label whitespace-nowrap">
          Size
        </td>
        <td class="sd-table-cell-base sd-table-cell-left sd-mono break-all">
          {{ api.store.localState.approxDataSize.toLocaleString() }} / {{ api.config.dataSizeReference.toLocaleString() }} ({{
            Math.round((api.store.localState.approxDataSize / api.config.dataSizeReference) * 1000) / 10
          }}%)
        </td>
      </tr>
    </tbody>
  </table>
</template>
