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
    <div class="flex-1 min-h-0 overflow-auto">
      <slot />
    </div>
    <!-- Aggressive window sizer overlay -->
    <div
      v-if="showAggressiveOverlay"
      class="fixed inset-0 z-50 bg-background/95 overflow-auto"
    >
      <WindowSizerView triggered />
    </div>
  </div>
</template>
