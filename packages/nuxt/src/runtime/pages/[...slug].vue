<template>
  <component v-if="viewConfig && viewConfig.component" :is="viewConfig.component" v-bind="viewConfig.props" />
  <div v-else-if="viewConfig === null && timelineReady">
    <h1>Page not found</h1>
    <p>No view registered for path: {{ route.path }}</p>
  </div>
</template>

<script setup>
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

onMounted(() => {
  timelineReady.value = true
})

// Handle redirect routes (e.g., `/` → `/welcome`)
watch(viewConfig, (config) => {
  if (config && config.redirect) {
    if (config.redirect.name) {
      // Resolve the redirect target's path from the timeline routes
      const target = nuxtApp.$timeline.routes.find((r) => r.name === config.redirect.name)
      if (target) {
        navigateTo(target.path)
      }
    } else if (config.redirect.path) {
      navigateTo(config.redirect.path)
    }
  }
}, { immediate: true })
</script>
