<script setup>
/**
 * @fileoverview Reset button component for presentation mode
 * Provides a tooltip-enabled button to return to the main page
 */

// Icon imports

// UI component imports

// Composables

/**
 * Initialize SMILE API instance
 * @constant {Object} api Global API instance
 */
const api = useAPI()

/**
 * Component props
 * @type {Object} props Component properties
 */
const props = defineProps(['icon'])
</script>

<template>
  <!-- Tooltip provider wrapper -->
  <TooltipProvider>
    <Tooltip>
      <!-- Tooltip trigger button -->
      <TooltipTrigger as-child>
        <Button size="menu" variant="outline" @click="api.resetLocalState()">
          <i-lucide-home />
        </Button>
      </TooltipTrigger>
      <!-- Tooltip content -->
      <TooltipContent>
        <p>Return to main page</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
