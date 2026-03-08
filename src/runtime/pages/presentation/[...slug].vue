<template>
  <NuxtLayout name="presentation">
    <!-- Presentation home page at /presentation/ root -->
    <component
      :is="presentationHome"
      v-if="isRoot && timelineReady"
      v-bind="presentationHomeProps"
    />
    <!-- Normal timeline view resolution -->
    <component
      :is="viewConfig.component"
      v-else-if="viewConfig && viewConfig.component"
      v-bind="viewConfig.props"
    />
    <div v-else-if="viewConfig === null && timelineReady">
      <h1>Page not found</h1>
      <p>No view registered for path: {{ experimentPath }}</p>
    </div>
  </NuxtLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useNuxtApp, navigateTo } from '#imports'
import PresentationModeView from '../../components/builtins/PresentationModeView.vue'
import useSmileStore from '../../stores/smilestore'

const route = useRoute()
const nuxtApp = useNuxtApp()
const store = useSmileStore()

const timelineReady = ref(false)

// Strip the /presentation prefix to resolve against timeline routes
const experimentPath = computed(() => {
  return route.path.replace(/^\/presentation/, '') || '/'
})

const isRoot = computed(() => {
  return experimentPath.value === '/'
})

// Resolve the presentation home component — allow override via setAppComponent('presentation_home', Component)
const presentationHome = computed(() => {
  if (!timelineReady.value) return null
  return store.config.global_app_components?.presentation_home || PresentationModeView
})

// Props for the presentation home — set via setAppComponent('presentation_home_props', {...})
const presentationHomeProps = computed(() => {
  if (!timelineReady.value) return {}
  return store.config.global_app_components?.presentation_home_props || {}
})

const viewConfig = computed(() => {
  if (!timelineReady.value) return undefined
  const timeline = nuxtApp.$timeline
  if (!timeline) return undefined
  return timeline.getViewForPath(experimentPath.value)
})

onMounted(() => {
  timelineReady.value = true
})

// Handle redirect routes — prepend /presentation to keep in presentation mode
// Skip redirects for root path (handled by presentation home)
watch(viewConfig, (config) => {
  if (isRoot.value) return
  if (config && config.redirect) {
    if (config.redirect.name) {
      const target = nuxtApp.$timeline.routes.find(r => r.name === config.redirect.name)
      if (target) {
        navigateTo('/presentation' + target.path)
      }
    }
    else if (config.redirect.path) {
      navigateTo('/presentation' + config.redirect.path)
    }
  }
}, { immediate: true })
</script>
