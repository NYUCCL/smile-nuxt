<script setup>
import { ref, computed, onMounted } from 'vue'
import { useNuxtApp } from '#imports'
import PresentationNavBar from '#smile-dev/presentation/PresentationNavBar.vue'
import PresentationModeView from '../builtins/PresentationModeView.vue'
import useSmileStore from '../../stores/smilestore'
import { useSmileColorMode } from '../../composables/useColorMode'

const nuxtApp = useNuxtApp()
const store = useSmileStore()
const api = useAPI()

// Ensure global color mode watcher is active so dark/light syncs with the dev sidebar
useSmileColorMode('global')

const timelineReady = ref(false)

// In inline mode we always show the root presentation home
const presentationHome = computed(() => {
  if (!timelineReady.value) return null
  return store.config.global_app_components?.presentation_home || PresentationModeView
})

const presentationHomeProps = computed(() => {
  if (!timelineReady.value) return {}
  return store.config.global_app_components?.presentation_home_props || {}
})

// Resolve the current view from the timeline based on the experiment path
const presentationPath = ref('/')

const viewConfig = computed(() => {
  if (!timelineReady.value) return undefined
  const timeline = nuxtApp.$timeline
  if (!timeline) return undefined
  return timeline.getViewForPath(presentationPath.value)
})

const isLoading = computed(() => {
  return !timelineReady.value
})

onMounted(() => {
  timelineReady.value = true
})
</script>

<template>
  <div class="presentation-container bg-background">
    <!-- Top toolbar with presentation navigation -->
    <div class="toolbar">
      <PresentationNavBar hide-dark-mode />
    </div>

    <!-- Content area -->
    <div class="content-wrapper">
      <div class="content-and-console">
        <div class="main-content @container bg-background text-foreground">
          <!-- Loading state -->
          <div
            v-if="isLoading"
            class="loading-container"
          >
            <div class="loading-spinner" />
            <p>Loading...</p>
          </div>
          <!-- Presentation home (root view) -->
          <template v-else>
            <component
              :is="presentationHome"
              v-if="presentationPath === '/' && timelineReady"
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
              <p>No view registered for path: {{ presentationPath }}</p>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.presentation-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  flex: 1;
  width: 100%;
}

.toolbar {
  margin-top: auto;
  margin-bottom: auto;
  height: 36px;
  width: full;
  background-color: var(--dev-bar-bg);
}

.content-wrapper {
  display: flex;
  flex: 1;
  overflow: hidden;
  width: 100%;
}

.content-and-console {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: auto;
  min-height: 0;
  min-width: 0;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
