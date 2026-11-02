<script setup>
import useWindowSizer from '#smile-composables/useWindowSizer'

const { showAggressiveOverlay } = useWindowSizer()
</script>

<template>
  <div class="@container bg-background text-foreground experiment-container flex flex-col h-screen">
    <ClientOnly>
      <LocalDevBanner />
      <ExperimentStatusBar />
    </ClientOnly>
    <div class="relative flex-1 min-h-0 overflow-auto">
      <slot />
      <!-- Aggressive window sizer overlay. It covers the content area only, so
           the status bar (and its withdraw button, which the overlay's text
           points to) stays usable, and its box sits where the size check
           measures: below the bar (#33). -->
      <div
        v-if="showAggressiveOverlay"
        class="absolute inset-0 z-50 bg-background/95 overflow-auto"
      >
        <WindowSizerView triggered />
      </div>
    </div>
  </div>
</template>
