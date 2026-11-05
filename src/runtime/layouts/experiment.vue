<script setup>
// Explicit, not auto-imported: auto-imports don't reach the module's runtime
// files once it's installed in a project (node_modules).
import { defineAsyncComponent } from 'vue'
import { useHead } from '#imports'
import useWindowSizer from '#smile-composables/useWindowSizer'
import { useParticipantColorMode } from '#smile-composables/useColorMode'

const { showAggressiveOverlay } = useWindowSizer()

// The `:` command palette: local dev server only (left out of builds)
const DevCommandPalette = import.meta.dev
  ? defineAsyncComponent(() => import('#smile-dev/palette/DevCommandPalette.vue'))
  : null

// Light, dark, or the participant's system setting, per VITE_COLOR_MODE (#32).
// On <html> so dialogs and menus (rendered at the end of <body>) match.
const colorMode = useParticipantColorMode()
useHead({ htmlAttrs: { class: colorMode } })
</script>

<template>
  <div class="@container bg-background text-foreground experiment-container flex flex-col h-screen">
    <ClientOnly>
      <LocalDevBanner />
      <DevCommandPalette
        v-if="DevCommandPalette"
        context="participant"
      />
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
