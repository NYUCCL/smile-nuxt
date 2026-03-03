<template>
  <NuxtLayout name="presentation">
    <component v-if="viewConfig && viewConfig.component" :is="viewConfig.component" v-bind="viewConfig.props" />
    <div v-else-if="viewConfig === null && timelineReady">
      <h1>Page not found</h1>
      <p>No view registered for path: {{ experimentPath }}</p>
    </div>
  </NuxtLayout>
</template>

<script setup>
const route = useRoute()
const nuxtApp = useNuxtApp()

const timelineReady = ref(false)

// Strip the /presentation prefix to resolve against timeline routes
const experimentPath = computed(() => {
  return route.path.replace(/^\/presentation/, '') || '/'
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
watch(viewConfig, (config) => {
  if (config && config.redirect) {
    if (config.redirect.name) {
      const target = nuxtApp.$timeline.routes.find((r) => r.name === config.redirect.name)
      if (target) {
        navigateTo('/presentation' + target.path)
      }
    } else if (config.redirect.path) {
      navigateTo('/presentation' + config.redirect.path)
    }
  }
}, { immediate: true })
</script>
