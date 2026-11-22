<script setup>
import { Database, RefreshCw } from 'lucide-vue-next'
// Vue composables
import { computed } from 'vue'

// Local components
import CircleProgress from './CircleProgress.vue'
import useAPI from '../../../composables/useAPI'
import { syncDisplay } from '../../../core/sync/display'
import { SYNC_DEFAULTS } from '../../../core/sync/loop'

/**
 * API instance for accessing application state and methods
 */
const api = useAPI()

/**
 * How much of the largest body that can be sent the record uses, as a
 * percentage with one decimal: what the last save weighed on the network
 * (compressed), or the record's size as JSON before any save has gone.
 */
const dataPercent = computed(() => {
  const sent = api.store.browserEphemeral.lastSend?.sentBytes
  return Math.min(100, Math.round(((sent ?? api.store.localState.approxDataSize) / SYNC_DEFAULTS.maxBytes) * 1000) / 10)
})

/** The state of saving, as every indicator shows it (core/sync/display.js) */
const sync = computed(() => syncDisplay({
  loaded: api.store.browserEphemeral.dataLoaded,
  sync: api.syncStatus,
  unsaved: api.store.browserEphemeral.unsavedChanges,
  otherTab: api.store.browserEphemeral.otherTab,
}))

/** Tooltip: the record, the state of saving, the size */
const database_tooltip = computed(() => {
  const loaded = api.store.browserEphemeral.dataLoaded
  const parts = [loaded ? 'Record created' : 'No record yet']
  if (sync.value.state !== 'none') parts.push(sync.value.detail ? `${sync.value.label} (${sync.value.detail})` : sync.value.label)
  if (api.store.browserEphemeral.localCopyError) parts.push('Browser copy not written')
  if (loaded) parts.push(dataPercent.value + '% of the size limit')
  return parts.join(' | ')
})
</script>

<template>
  <!-- Database status button with tooltip -->
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          size="menu"
          variant="toolbar"
        >
          <!-- Database icon with status styling -->
          <Database
            style="font-size: 2em"
            class="disconnected"
            :class="{ connected: api.store.browserEphemeral.dataLoaded }"
          />

          <!-- Sync icon: turns while saving, amber when a change is waiting, red when saving has a problem -->
          <RefreshCw
            class="sync-icon"
            :class="{ 'animate-spin': sync.state === 'saving' }"
            :data-state="sync.state"
            data-testid="nav-sync-icon"
          />

          <!-- Progress circle for data usage -->
          <template v-if="!api.store.browserEphemeral.dataLoaded">
            <div class="mt-1 disconnected">
              <CircleProgress
                :percentage="dataPercent"
                :size="12"
                :stroke-width="40"
                slicecolor="var(--sd-text-muted)"
                basecolor="var(--sd-line)"
              />
            </div>
          </template>
          <template v-else>
            <div class="mt-1">
              <CircleProgress
                :percentage="dataPercent"
                :size="12"
                :stroke-width="40"
                slicecolor="var(--sd-done)"
                basecolor="var(--sd-line)"
              />
            </div>
          </template>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {{ database_tooltip }}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>

<style scoped>
/* Connected and saved: --sd-done (sky). No record yet: faded. A change
   waiting or on its way: amber. Offline, failed, stopped or paused: red.
   Same states as the side panel's progress. */
.disconnected,
.sync-icon[data-state='none'] {
  color: var(--sd-text-muted);
  opacity: 0.55;
}
.connected,
.sync-icon[data-state='saved'] {
  color: var(--sd-done);
}
.sync-icon[data-state='pending'],
.sync-icon[data-state='saving'] {
  color: var(--sd-warn);
}
.sync-icon[data-state='offline'],
.sync-icon[data-state='retrying'],
.sync-icon[data-state='stopped'],
.sync-icon[data-state='paused'] {
  color: var(--sd-error);
}
</style>
