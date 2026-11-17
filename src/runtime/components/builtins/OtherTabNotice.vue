<script setup>
/**
 * Covers the page when the study is open in another tab or window of this
 * browser and that one has the participant now (the store's `otherTab`; see
 * core/sync/tabs.js). This tab has stopped saving. "Continue here" reloads
 * it: it starts from the newest copy and the other tab gets this notice.
 */
import useSmileStore from '../../stores/smilestore'

defineProps({
  // In the dev tools: in place of the page instead of over the whole window
  inline: { type: Boolean, default: false },
})

const store = useSmileStore()

function continueHere() {
  window.location.reload()
}
</script>

<template>
  <div
    v-if="store.browserEphemeral.otherTab"
    class="flex items-center justify-center bg-background/95 p-6"
    :class="inline ? 'h-full w-full' : 'fixed inset-0 z-[1000]'"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="other-tab-title"
    data-testid="other-tab-notice"
  >
    <div class="max-w-md text-center">
      <h2
        id="other-tab-title"
        class="text-xl font-semibold mb-3"
      >
        This study is open in another tab
      </h2>
      <p class="mb-5 text-muted-foreground">
        Your progress is saved. Go back to the other tab or window to continue, or continue in this one.
        Only one can be used at a time.
      </p>
      <button
        type="button"
        class="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        data-testid="other-tab-continue"
        @click="continueHere"
      >
        Continue here
      </button>
    </div>
  </div>
</template>
