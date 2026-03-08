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
  <!-- Reset local state button with tooltip -->
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          size="menu"
          variant="outline"
          @click="api.resetLocalState()"
        >
          <Zap />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Reset local state (Ctrl + R)
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
