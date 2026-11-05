<script setup>
import { Zap } from 'lucide-vue-next'
// UI components
import useAPI from '../../../composables/useAPI'

// API composable

/**
 * API instance for accessing application state and methods
 */
const api = useAPI()
</script>

<template>
  <!-- Zap (reset) local state button with tooltip -->
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          size="menu"
          variant="toolbar"
          @click="api.resetLocalState()"
        >
          <Zap />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Zap local state (Ctrl + R)
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
