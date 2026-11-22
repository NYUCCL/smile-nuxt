<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import useAPI from '../../../composables/useAPI'
import { syncDisplay } from '../../../core/sync/display'
import { SYNC_DEFAULTS } from '../../../core/sync/loop'

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

/** The state of saving, as every indicator shows it (core/sync/display.js) */
const sync = computed(() => syncDisplay({
  loaded: api.store.browserEphemeral.dataLoaded,
  sync: api.syncStatus,
  unsaved: api.store.browserEphemeral.unsavedChanges,
  otherTab: api.store.browserEphemeral.otherTab,
}))

/**
 * A size in KB or MB
 * @param {number} bytes - The size in bytes
 * @returns {string} The size with its unit
 */
const kb = bytes => bytes >= 1_000_000 ? (bytes / 1_000_000).toFixed(2) + ' MB' : (bytes / 1000).toFixed(1) + ' KB'

/** Seconds until the next try of a failed save (updated by the timer below) */
const retry_in = ref(null)

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
    const retryAt = api.syncStatus.retryAt
    retry_in.value = retryAt ? Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)) : null
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
          Saves
        </td>
        <td class="sd-table-cell-base sd-table-cell-left sd-mono break-all">
          {{ api.store.localState.totalWrites }} confirmed<br>{{ api.store.localState.totalSends }} sent {{ api.config.maxWrites > 0 ? 'of ' + api.config.maxWrites.toLocaleString() : '(no limit)' }}
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
      <!-- Sync status row -->
      <tr class="sd-table-row-base sd-table-row-even hidden sm:table-row">
        <td class="sd-table-cell-base sd-table-cell-left sd-label whitespace-nowrap">
          Sync
        </td>
        <td
          class="sd-table-cell-base sd-table-cell-left sd-mono break-all"
          data-testid="sync-status"
        >
          <span
            class="sd-sync-label"
            :data-state="sync.state"
          >{{ sync.label }}</span>
          <template v-if="retry_in !== null">
            (in {{ retry_in }} s)
          </template>
          <br><span class="text-sd-text-muted">{{ api.syncStatus.status }}, rev {{ api.store.browserEphemeral.savedRev }} of {{ api.store.browserEphemeral.rev }}</span>
          <template v-if="sync.detail">
            <br>{{ sync.detail }}
          </template>
        </td>
      </tr>
      <!-- Browser copy row: only when the local copy couldn't be written -->
      <tr
        v-if="api.store.browserEphemeral.localCopyError"
        class="sd-table-row-base sd-table-row-even hidden sm:table-row"
      >
        <td class="sd-table-cell-base sd-table-cell-left sd-label whitespace-nowrap">
          Browser copy
        </td>
        <td
          class="sd-table-cell-base sd-table-cell-left sd-mono break-all"
          data-testid="local-copy-error"
        >
          <span
            class="sd-sync-label"
            data-state="stopped"
          >Not written</span><br>{{ api.store.browserEphemeral.localCopyError }}
        </td>
      </tr>
      <!-- Last send row: what the last save cost -->
      <tr
        v-if="api.store.browserEphemeral.lastSend"
        class="sd-table-row-base sd-table-row-even hidden sm:table-row"
      >
        <td class="sd-table-cell-base sd-table-cell-left sd-label whitespace-nowrap">
          Last send
        </td>
        <td
          class="sd-table-cell-base sd-table-cell-left sd-mono break-all"
          data-testid="last-send"
        >
          {{ kb(api.store.browserEphemeral.lastSend.sentBytes) }} sent
          <template v-if="api.store.browserEphemeral.lastSend.sentBytes < api.store.browserEphemeral.lastSend.textBytes">
            ({{ kb(api.store.browserEphemeral.lastSend.textBytes) }} before gzip)
          </template>
          <br>{{ api.store.browserEphemeral.lastSend.ms }} ms, {{ api.store.browserEphemeral.lastSend.status || 'no answer' }}
        </td>
      </tr>
      <!-- Size row -->
      <tr class="sd-table-row-base sd-table-row-odd hidden sm:table-row sd-table-border-bottom">
        <td class="sd-table-cell-base sd-table-cell-left sd-label whitespace-nowrap">
          Size
        </td>
        <td class="sd-table-cell-base sd-table-cell-left sd-mono break-all">
          {{ kb(api.store.localState.approxDataSize) }} as JSON (most: {{ kb(SYNC_DEFAULTS.maxTextBytes) }})
          <br><span class="text-sd-text-muted">a save must fit {{ kb(SYNC_DEFAULTS.maxBytes) }} on the network, compressed; see Last send</span>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
/* Same colors as the nav bar's sync icon and the progress above */
.sd-sync-label[data-state='saved'] {
  color: var(--sd-done);
}
.sd-sync-label[data-state='pending'],
.sd-sync-label[data-state='saving'] {
  color: var(--sd-warn);
}
.sd-sync-label[data-state='offline'],
.sd-sync-label[data-state='retrying'],
.sd-sync-label[data-state='stopped'],
.sd-sync-label[data-state='paused'] {
  color: var(--sd-error);
}
</style>
