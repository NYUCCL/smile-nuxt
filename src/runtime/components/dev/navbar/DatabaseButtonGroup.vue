<script setup>
import ILucideDatabase from '~icons/lucide/database'
import ILucideRefreshCw from '~icons/lucide/refresh-cw'
// Vue composables
import { computed } from 'vue'

// Local components
import CircleProgress from './CircleProgress.vue'
import useAPI from '../../../composables/useAPI'

/**
 * API instance for accessing application state and methods
 */
const api = useAPI()

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
    msg += Math.round((api.store.localState.approxDataSize / 1048576) * 1000) / 1000 + '% data used'
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
          variant="outline"
        >
          <!-- Database icon with status styling -->
          <i-lucide-database
            style="font-size: 2em"
            class="disconnected"
            :class="{ connected: api.store.browserEphemeral.dataLoaded }"
          />

          <!-- Sync icon with status styling -->
          <template v-if="!api.store.browserEphemeral.dataLoaded">
            <i-lucide-refresh-cw class="has-text-grey" />
          </template>
          <template v-else-if="api.store.browserEphemeral.unsavedChanges && api.store.browserEphemeral.dataLoaded">
            <i-lucide-refresh-cw class="outofsync" />
          </template>
          <template v-else>
            <i-lucide-refresh-cw class="insync" />
          </template>

          <!-- Progress circle for data usage -->
          <template v-if="!api.store.browserEphemeral.dataLoaded">
            <div class="mt-1">
              <CircleProgress
                :percentage="Math.round(api.store.localState.approxDataSize / 1048576) * 100"
                :size="12"
                :stroke-width="40"
                slicecolor="#aaa"
                basecolor="#aaa"
              />
            </div>
          </template>
          <template v-else>
            <div class="mt-1">
              <CircleProgress
                :percentage="Math.round(api.store.localState.approxDataSize / 1048576) * 100"
                :size="12"
                :stroke-width="40"
                slicecolor="var(--primary-button)"
                basecolor="var(--status-green)"
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
.disconnected {
  color: var(--status-red);
}
.connected {
  color: var(--status-green);
}
.outofsync {
  color: var(--status-yellow);
}
.insync {
  color: var(--status-green);
}
</style>
