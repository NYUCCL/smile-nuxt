<template>
  <NuxtLayout name="development">
    <!-- Dev mode landing: show RecruitmentChooserView at /dev/ -->
    <RecruitmentChooserView v-if="isDevRoot && timelineReady" />
    <template v-else-if="viewConfig && viewConfig.component">
      <ExperimentStatusBar />
      <component :is="viewConfig.component" v-bind="viewConfig.props" />
    </template>
    <div v-else-if="viewConfig === null && timelineReady">
      <h1>Page not found</h1>
      <p>No view registered for path: {{ experimentPath }}</p>
    </div>
  </NuxtLayout>
</template>

<script setup>
import RecruitmentChooserView from '#smile-dev/RecruitmentChooserView.vue'

const route = useRoute()
const nuxtApp = useNuxtApp()

const timelineReady = ref(false)

// Strip the /dev prefix to resolve against timeline routes
const experimentPath = computed(() => {
  return route.path.replace(/^\/dev/, '') || '/'
})

// Show RecruitmentChooserView at the dev root
const isDevRoot = computed(() => {
  return experimentPath.value === '/'
})

const rawViewConfig = computed(() => {
  if (!timelineReady.value) return undefined
  if (isDevRoot.value) return undefined // handled by RecruitmentChooserView
  const timeline = nuxtApp.$timeline
  if (!timeline) return undefined
  return timeline.getViewForPath(experimentPath.value)
})

// Resolve string component names to actual component references
const viewConfig = computed(() => {
  const config = rawViewConfig.value
  if (!config || !config.component) return config
  if (typeof config.component === 'string') {
    return { ...config, component: resolveComponent(config.component) }
  }
  return config
})

onMounted(() => {
  timelineReady.value = true
})

// Handle redirect routes — prepend /dev to keep in dev mode
watch(viewConfig, (config) => {
  if (config && config.redirect) {
    if (config.redirect.name) {
      const target = nuxtApp.$timeline.routes.find((r) => r.name === config.redirect.name)
      if (target) {
        navigateTo('/dev' + target.path)
      }
    } else if (config.redirect.path) {
      navigateTo('/dev' + config.redirect.path)
    }
  }
}, { immediate: true })
</script>
