<script setup>
import { ChevronLeft, ChevronRight, SquareMinus } from 'lucide-vue-next'
// API composable for stepper navigation
import useViewAPI from '../../../composables/useViewAPI'

// UI components

// Icons

/**
 * API instance for accessing stepper state and methods
 */
const api = useViewAPI()
</script>

<template>
  <!-- Step navigation button group with tooltips -->
  <TooltipProvider>
    <ButtonGroup
      variant="outline"
      size="menu"
    >
      <!-- Step back button -->
      <Tooltip>
        <TooltipTrigger as-child>
          <ButtonGroupItem
            :disabled="!api.store.dev.viewProvidesStepper || !api.hasPrevStep()"
            @click="api.goPrevStep()"
          >
            <ChevronLeft />
          </ButtonGroupItem>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Step back (Left Arrow)
        </TooltipContent>
      </Tooltip>

      <!-- Current path display -->
      <Tooltip>
        <TooltipTrigger as-child>
          <ButtonGroupItem :disabled="!api.store.dev.viewProvidesStepper || !api.hasSteps()">
            <span
              v-if="api.pathString"
              class="counter"
            >{{ api.pathString }}</span>
            <SquareMinus v-else />
          </ButtonGroupItem>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Current path
        </TooltipContent>
      </Tooltip>

      <!-- Step forward button -->
      <Tooltip>
        <TooltipTrigger as-child>
          <ButtonGroupItem
            :disabled="!api.store.dev.viewProvidesStepper || !api.hasNextStep()"
            @click="api.goNextStep()"
          >
            <ChevronRight />
          </ButtonGroupItem>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Step forward (Right Arrow)
        </TooltipContent>
      </Tooltip>
    </ButtonGroup>
  </TooltipProvider>
</template>

<style scoped>
.counter {
  font-size: 0.95em;
  font-family: monospace;
  font-weight: 500;
}
</style>
