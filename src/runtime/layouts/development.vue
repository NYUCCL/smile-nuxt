<script setup>
import { computed, defineAsyncComponent, ref, onMounted } from 'vue'
import { Toaster } from 'vue-sonner'
import 'vue-sonner/style.css'

import SmileDevAppMenu from '#smile-dev/menu/SmileDevAppMenu.vue'
import DevNavBar from '#smile-dev/navbar/SmileDevNavBar.vue'
import DevConsole from '#smile-dev/console/SmileDevConsole.vue'
import DevSideBar from '#smile-dev/sidebar/SmileDevSideBar.vue'
import ResponsiveDeviceContainer from '#smile-dev/ResponsiveDeviceContainer.vue'
import SmileDevPresentationView from '#smile-dev/SmileDevPresentationView.vue'
// Dashboard is hidden until the feature is complete
// import SmileDevDashboardView from '#smile-dev/dashboard/SmileDevDashboardView.vue'
import useAPI from '../composables/useAPI'
import useWindowSizer from '#smile-composables/useWindowSizer'
import { applyDevPalette } from '#smile-composables/useDevPalette'
import DevScope from '#smile-dev/DevScope.vue'

const api = useAPI()

// Docs mode exists only on the dev server (pnpm dev). In a build, even with
// SMILE_DEV_TOOLS=include, import.meta.dev is false, so the view, its styles and
// its route are left out (a saved 'docs' view opens developer mode instead).
const hasDocs = import.meta.dev
const SmileDevDocsView = import.meta.dev
  ? defineAsyncComponent(() => import('#smile-dev/docs/SmileDevDocsView.vue'))
  : null
const { showAggressiveOverlay } = useWindowSizer({ useDeviceContainer: true })

const height_pct = computed(() => `${api.store.dev.consoleBarHeight}px`)

const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})

const isLoading = computed(() => {
  return !mounted.value
})

const isRouteNotFound = computed(() => {
  return mounted.value && api.currentRouteName() === undefined
})

// The dev tools' palette, on <html> (only the dev tools' colors use it)
applyDevPalette()
</script>

<template>
  <ClientOnly>
    <!-- Toast notification system -->
    <Toaster
      close-button
      position="top-left"
      :rich-colors="true"
      class="custom-toaster"
    />

    <!-- Main sidebar provider for developer tools -->
    <SidebarProvider
      :default-open="false"
      :style="{
        '--sidebar-width': '48px',
      }"
    >
      <!-- Developer app menu sidebar -->
      <DevScope>
        <SmileDevAppMenu />
      </DevScope>

      <!-- Main content area -->
      <SidebarInset>
        <!-- Main app container for developer mode -->
        <div class="app-container">
          <!-- Presentation Mode - inline (shares DOM and store for dark mode sync) -->
          <SmileDevPresentationView
            v-if="api.store.dev.mainView === 'presentation'"
          />

          <!-- Dashboard Mode - browse past data from the linked database (hidden until the feature is complete)
          <SmileDevDashboardView
            v-else-if="api.store.dev.mainView === 'dashboard'"
          />
          -->

          <!-- Docs Mode - the docs for the installed version -->
          <SmileDevDocsView
            v-else-if="hasDocs && api.store.dev.mainView === 'docs'"
          />

          <!-- Developer Mode - Full interface with toolbar, sidebar, console -->
          <template v-else>
            <!-- Top toolbar with navigation controls -->
            <DevScope>
              <div class="toolbar sd-root">
                <DevNavBar />
              </div>
            </DevScope>

            <!-- Middle row - content and sidebar -->
            <div class="content-wrapper">
              <!-- Main content area with console -->
              <div class="content-and-console">
                <!-- Main content - scrollable experiment container -->
                <div class="main-content @container bg-sd-stage text-foreground relative">
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
                  <!-- Experiment content via slot -->
                  <template v-else>
                    <ResponsiveDeviceContainer>
                      <WindowSizerView
                        v-if="showAggressiveOverlay"
                        triggered
                      />
                      <slot v-else />
                    </ResponsiveDeviceContainer>
                  </template>
                </div>

                <!-- Bottom console - can be toggled -->
                <Transition name="console-slide">
                  <div
                    v-if="api.store.dev.showConsoleBar"
                    class="console sd-root"
                  >
                    <DevScope>
                      <DevConsole />
                    </DevScope>
                  </div>
                </Transition>
              </div>

              <!-- Sidebar - can be toggled, transitions in/out -->
              <Transition name="sidebar-slide">
                <div
                  v-if="api.store.dev.showSideBar"
                  class="sidebar sd-root"
                >
                  <DevScope>
                    <DevSideBar />
                  </DevScope>
                </div>
              </Transition>
            </div>
          </template>
        </div>
      </SidebarInset>
    </SidebarProvider>
  </ClientOnly>
</template>

<style>
/* Toast notification positioning */
.custom-toaster {
  --toast-offset-x: 60px;
  --toast-offset-y: 50px;
}

.custom-toaster {
  top: var(--toast-offset-y) !important;
  left: var(--toast-offset-x) !important;
}

/* Override SidebarProvider's min-h-svh to prevent overflow beyond viewport */
[data-slot="sidebar-wrapper"] {
  min-height: 0 !important;
  height: 100vh;
  overflow: hidden;
}
</style>

<style scoped>
/* Main app container */
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  overflow: hidden;
}

/* Docs mode container */
/* Developer mode layout */
.toolbar {
  margin-top: auto;
  margin-bottom: auto;
  height: 36px;
  width: full;
  background-color: var(--sd-bar);
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

.sidebar {
  flex: 0 0 300px;
  height: 100%;
  overflow-y: auto;
  border-left: 1px solid var(--sd-line);
  background-color: var(--sd-bg);
}

.console {
  height: v-bind(height_pct);
  width: 100%;
  background-color: var(--sd-bg);
  border-top: 1px solid var(--sd-line);
  overflow: hidden;
  overflow-x: hidden;
  min-width: 0;
  max-width: 100%;
}

/* Transition effects */
.sidebar-slide-enter-active,
.sidebar-slide-leave-active {
  transition: all 0.3s ease-in-out;
}

.sidebar-slide-enter-from,
.sidebar-slide-leave-to {
  flex: 0 0 0px;
  width: 0px;
  overflow: hidden;
}

.console-slide-enter-active,
.console-slide-leave-active {
  transition: height 0.3s ease-in-out;
}

.console-slide-enter-from,
.console-slide-leave-to {
  height: 0;
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
  border: 4px solid var(--sd-spinner-track);
  border-top: 4px solid var(--sd-spinner);
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
  color: var(--sd-text-muted);
  font-size: 0.875rem;
}

.not-found-message code {
  background-color: var(--sd-chrome);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.8rem;
}
</style>
