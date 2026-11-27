<template>
  <NuxtLayout name="experiment">
    <!-- The view's files are still loading (design.js `preload`, #30) -->
    <PreloadingView
      v-if="viewConfig && viewConfig.component && gate.status !== 'ready'"
      :gate="gate"
    />
    <component
      :is="viewConfig.component"
      v-else-if="viewConfig && viewConfig.component"
      v-bind="viewConfig.props"
    />
    <div v-else-if="viewConfig === null && timelineReady">
      <h1>Page not found</h1>
      <p>No view registered for path: {{ route.path }}</p>
    </div>
  </NuxtLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useNuxtApp, navigateTo } from '#imports'
import useViewGate from '../composables/useViewGate'
import PreloadingView from '../components/builtins/PreloadingView.vue'

const route = useRoute()
const nuxtApp = useNuxtApp()

// Timeline plugin is client-only, so $timeline is undefined during SSR.
// We wait until the client has hydrated before showing any content.
const timelineReady = ref(false)

const viewConfig = computed(() => {
  if (!timelineReady.value) return undefined
  const timeline = nuxtApp.$timeline
  if (!timeline) return undefined
  return timeline.getViewForPath(route.path)
})

// Holds the view back until the files it lists under `preload` are in memory
const gate = useViewGate(viewConfig)

onMounted(() => {
  timelineReady.value = true
})

// Handle redirect routes (e.g., `/` → `/welcome`)
watch(viewConfig, (config) => {
  if (config && config.redirect) {
    if (config.redirect.name) {
      // Resolve the redirect target's path from the timeline routes
      const target = nuxtApp.$timeline.routes.find(r => r.name === config.redirect.name)
      if (target) {
        navigateTo(target.path)
      }
    }
    else if (config.redirect.path) {
      navigateTo(config.redirect.path)
    }
  }
}, { immediate: true })
</script>
