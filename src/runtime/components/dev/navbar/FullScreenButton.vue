<script setup>
// UI components
import useAPI from '../../../composables/useAPI'

// API composable

/**
 * API instance for accessing application state and methods
 */
const api = useAPI()
</script>

<template>
  <!-- Fullscreen toggle button with tooltip -->
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          size="menu"
          variant="outline"
          @click="api.store.dev.isFullscreen = !api.store.dev.isFullscreen"
        >
          <i-ic-outline-fullscreen
            v-if="!api.store.dev.isFullscreen"
            :stroke-width="2.5"
          />
          <i-ic-outline-fullscreen-exit
            v-else
            :stroke-width="2.5"
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p v-if="api.store.dev.isFullscreen">
          Responsive Mode
        </p>
        <p v-else>
          Fullscreen
        </p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
