<script setup>
import { computed, ref, onMounted } from 'vue'

import PresentationNavBar from '#smile-dev/presentation/PresentationNavBar.vue'

const api = useAPI()

const mounted = ref(false)
onMounted(() => { mounted.value = true })

const isLoading = computed(() => {
  return !mounted.value
})

const isRouteNotFound = computed(() => {
  return mounted.value && api.currentRouteName() === undefined
})
</script>

<template>
  <ClientOnly>
    <!-- Main app container for presentation mode -->
    <div class="app-container">
      <LocalDevBanner />

      <!-- Top toolbar with navigation -->
      <div class="toolbar">
        <PresentationNavBar />
      </div>

      <!-- Middle row - content area -->
      <div class="content-wrapper">
        <div class="content-and-console">
          <!-- Main content - scrollable -->
          <div class="main-content @container bg-background text-foreground">
            <!-- Loading state -->
            <div
              v-if="isLoading"
              class="loading-container"
            >
              <div class="loading-spinner" />
              <p>Loading...</p>
            </div>
            <!-- Route not found -->
            <div
              v-else-if="isRouteNotFound"
              class="loading-container"
            >
              <p class="not-found-title">
                Route Not Found
              </p>
              <p class="not-found-message">
                The path <code>{{ api.route.path }}</code> is not registered in the timeline.
              </p>
            </div>
            <!-- Main app content via slot -->
            <template v-else>
              <slot />
            </template>
          </div>
        </div>
      </div>
    </div>
  </ClientOnly>
</template>

<style scoped>
/* Main app container layout */
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
}

/* Top toolbar styling */
.toolbar {
  margin-top: auto;
  margin-bottom: auto;
  height: 36px;
  width: full;
  background-color: var(--dev-bar-bg);
}

/* Content wrapper layout */
.content-wrapper {
  display: flex;
  flex: 1;
  overflow: hidden;
  width: 100%;
}

/* Content and console container */
.content-and-console {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

/* Main content area */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: auto;
  min-height: 0;
  min-width: 0;
}

/* Loading styles */
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
  border: 4px solid var(--spinner-track);
  border-top: 4px solid var(--spinner-active);
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

.not-found-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--destructive);
}

.not-found-message {
  color: var(--muted-foreground);
  font-size: 0.875rem;
}

.not-found-message code {
  background-color: var(--muted);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.8rem;
}
</style>
