<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'

/**
 * API instance for accessing Smile app state and actions
 * @type {import('@/core/composables/useAPI')}
 */
const api = useAPI()

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
  <table class="w-full text-sm table-border-top">
    <tbody>
      <!-- Last route row -->
      <tr class="table-row-base table-row-even hidden sm:table-row">
        <td class="table-cell-base table-cell-left table-cell-small">
          <b>Last route:</b>
        </td>
        <td class="table-cell-base table-cell-left table-cell-mono table-cell-small">
          {{ '/' + api.store.cookieState.lastRoute }}
        </td>
      </tr>
      <!-- Mode row -->
      <tr class="table-row-base table-row-odd hidden sm:table-row">
        <td class="table-cell-base table-cell-left table-cell-small">
          <b>Mode:</b>
        </td>
        <td class="table-cell-base table-cell-left table-cell-mono table-cell-small">
          {{ api.config.mode }}
        </td>
      </tr>
      <!-- DocRef row -->
      <tr class="table-row-base table-row-even">
        <td class="table-cell-base table-cell-left table-cell-small">
          <b>DocRef:</b>
        </td>
        <td class="table-cell-base table-cell-left table-cell-mono table-cell-small">
          {{ api.store.cookieState.docRef || '(none)' }}
        </td>
      </tr>
      <!-- Writes row -->
      <tr class="table-row-base table-row-odd hidden sm:table-row">
        <td class="table-cell-base table-cell-left table-cell-small">
          <b>Writes:</b>
        </td>
        <td class="table-cell-base table-cell-left table-cell-mono table-cell-small">
          {{ api.store.localState.totalWrites }} out of {{ api.config.maxWrites }} max
        </td>
      </tr>
      <!-- Last write row -->
      <tr class="table-row-base table-row-even hidden sm:table-row">
        <td class="table-cell-base table-cell-left table-cell-small">
          <b>Last save:</b>
        </td>
        <td class="table-cell-base table-cell-left table-cell-mono table-cell-small">
          {{ last_write_time_string }}
        </td>
      </tr>
      <!-- Auto save row -->
      <tr class="table-row-base table-row-odd hidden sm:table-row">
        <td class="table-cell-base table-cell-left table-cell-small">
          <b>Auto save:</b>
        </td>
        <td class="table-cell-base table-cell-left table-cell-mono table-cell-small">
          {{ api.config.autoSave }}
        </td>
      </tr>
      <!-- Size row -->
      <tr class="table-row-base table-row-even hidden sm:table-row table-border-bottom">
        <td class="table-cell-base table-cell-left table-cell-small">
          <b>Size:</b>
        </td>
        <td class="table-cell-base table-cell-left table-cell-mono table-cell-small">
          {{ api.store.localState.approxDataSize }} / 1,048,576 max ({{
            Math.round((api.store.localState.approxDataSize / 1048576) * 1000) / 1000
          }}%)
        </td>
      </tr>
    </tbody>
  </table>
</template>
