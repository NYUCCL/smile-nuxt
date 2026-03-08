<script setup>
import { RotateCcw } from 'lucide-vue-next'
// UI components
import useAPI from '../../../composables/useAPI'

// API composable

/**
 * API instance for accessing application state and methods
 */
const api = useAPI()
</script>

<template>
  <!-- Reload browser button with tooltip -->
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          size="menu"
          variant="outline"
          @click="api.reloadBrowser()"
        >
          <RotateCcw :stroke-width="2.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Reload browser (Cmd + R)
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
