<script setup>
import { ArrowRight } from 'lucide-vue-next'
import useViewAPI from '../../composables/useViewAPI'

/**
 * Initialize the Smile API for navigation and configuration access
 * @type {import('@/core/composables/useViewAPI').default}
 */
const api = useViewAPI()

/**
 * Component props definition
 * @typedef {object} Props
 * @property {object} debriefText - The debrief text component to display
 */
const _props = defineProps({
  debriefText: {
    type: Object,
    required: true,
  },
})

/**
 * Handles the completion of the debrief view
 * @description Advances to the next view in the experiment flow
 * @returns {void}
 */
function finish() {
  // Navigate to the next view in the experiment
  api.goNextView()
}
</script>

<template>
  <!-- Main debrief container with responsive task window layout -->
  <ConstrainedTaskWindow
    variant="ghost"
    :responsive-u-i="api.config.responsiveUI"
    :width="api.config.windowsizerRequest.width"
    :height="api.config.windowsizerRequest.height"
    class="p-8"
  >
    <!-- Content container with centered layout -->
    <div class="w-[80%] h-[80%]">
      <!-- Dynamic debrief text component -->
      <component :is="debriefText" />

      <!-- Visual separator between content and navigation -->
      <hr class="border-border my-6">

      <!-- Navigation section with next button -->
      <div class="flex justify-end mt-4">
        <Button
          variant="default"
          @click="finish()"
        >
          next
          <ArrowRight />
        </Button>
      </div>
    </div>
  </ConstrainedTaskWindow>
</template>
