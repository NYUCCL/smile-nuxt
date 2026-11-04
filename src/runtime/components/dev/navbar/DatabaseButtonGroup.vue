<script setup>
import { Database, RefreshCw } from 'lucide-vue-next'
// Vue composables
import { computed } from 'vue'

// Local components
import CircleProgress from './CircleProgress.vue'
import useAPI from '../../../composables/useAPI'

/**
 * API instance for accessing application state and methods
 */
const api = useAPI()

/** Data size as a percentage of config.dataSizeReference, one decimal */
const dataPercent = computed(() =>
  Math.round((api.store.localState.approxDataSize / api.config.dataSizeReference) * 1000) / 10,
)

/**
 * Computed tooltip text showing database status and data usage
 *
 * @returns {string} Formatted tooltip message with record status, sync status, and data usage
 */
const database_tooltip = computed(() => {
  let msg = ''
  if (api.store.browserEphemeral.dataLoaded) {
    msg += 'Record created | '
  }
  else {
    msg += 'No record yet | '
  }
  if (api.store.browserEphemeral.unsavedChanges) {
    msg += 'Unsaved changes '
  }
  else {
    msg += 'Saved '
  }
  if (api.store.browserEphemeral.dataLoaded) {
    msg += '| '
    msg += dataPercent.value + '% data used'
  }
  return msg
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

          <!-- Sync icon with status styling -->
          <template v-if="!api.store.browserEphemeral.dataLoaded">
            <RefreshCw class="has-text-grey" />
          </template>
          <template v-else-if="api.store.browserEphemeral.unsavedChanges && api.store.browserEphemeral.dataLoaded">
            <RefreshCw class="outofsync" />
          </template>
          <template v-else>
            <RefreshCw class="insync" />
          </template>

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
/* Connected and saved: --sd-done (sky). Not connected (no record yet):
   faded. Unsaved changes: amber. Same states as the side panel's progress. */
.disconnected,
.has-text-grey {
  color: var(--sd-text-muted);
  opacity: 0.55;
}
.connected {
  color: var(--sd-done);
}
.outofsync {
  color: var(--sd-warn);
}
.insync {
  color: var(--sd-done);
}
</style>
