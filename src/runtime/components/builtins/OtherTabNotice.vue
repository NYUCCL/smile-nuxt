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
      <!-- A newer tab said so: this page knows another tab has the study -->
      <template v-if="store.browserEphemeral.otherTab === 'newer-tab'">
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
      </template>
      <!-- The server refused a save because it holds something newer: this
           page can't tell where that came from -->
      <template v-else>
        <h2
          id="other-tab-title"
          class="text-xl font-semibold mb-3"
        >
          Your progress was saved somewhere else
        </h2>
        <p class="mb-5 text-muted-foreground">
          A newer copy of your progress was saved from another tab or window. Press Continue to carry on from
          the latest saved point. If the study is open in another tab, you can go back to that one instead.
        </p>
      </template>
      <button
        type="button"
        class="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        data-testid="other-tab-continue"
        @click="continueHere"
      >
        {{ store.browserEphemeral.otherTab === 'newer-tab' ? 'Continue here' : 'Continue' }}
      </button>
    </div>
  </div>
</template>
