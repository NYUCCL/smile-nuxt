<script setup>
import { computed } from 'vue'
import { Toaster } from 'vue-sonner'
import 'vue-sonner/style.css'

import SmileDevAppMenu from '#smile-dev/menu/SmileDevAppMenu.vue'
import DevNavBar from '#smile-dev/navbar/SmileDevNavBar.vue'
import DevConsole from '#smile-dev/console/SmileDevConsole.vue'
import DevSideBar from '#smile-dev/sidebar/SmileDevSideBar.vue'
import ResponsiveDeviceContainer from '#smile-dev/ResponsiveDeviceContainer.vue'
import SmileDevPresentationView from '#smile-dev/SmileDevPresentationView.vue'

const api = useAPI()

const height_pct = computed(() => `${api.store.dev.consoleBarHeight}px`)

const isLoading = computed(() => {
  return api.currentRouteName() === undefined
})
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
      <SmileDevAppMenu />

      <!-- Main content area -->
      <SidebarInset>
        <!-- Main app container for developer mode -->
        <div class="app-container">
          <!-- Presentation Mode - inline (shares DOM and store for dark mode sync) -->
          <SmileDevPresentationView
            v-if="api.store.dev.mainView === 'presentation'"
          />

          <!-- Docs Mode - Clean full-screen documentation -->
          <div
            v-else-if="api.store.dev.mainView === 'docs'"
            class="docs-container"
          >
            <iframe
              src="https://smile.gureckislab.org"
              class="docs-iframe"
              frameborder="0"
              title="Documentation"
            />
          </div>

          <!-- Developer Mode - Full interface with toolbar, sidebar, console -->
          <template v-else>
            <LocalDevBanner />
            <!-- Top toolbar with navigation controls -->
            <div class="toolbar">
              <DevNavBar />
            </div>

            <!-- Middle row - content and sidebar -->
            <div class="content-wrapper">
              <!-- Main content area with console -->
              <div class="content-and-console">
                <!-- Main content - scrollable experiment container -->
                <div class="main-content @container bg-background text-foreground">
                  <!-- Loading state -->
                  <div
                    v-if="isLoading"
                    class="loading-container"
                  >
                    <div class="loading-spinner" />
                    <p>Loading...</p>
                  </div>
                  <!-- Experiment content via slot -->
                  <template v-else>
                    <ResponsiveDeviceContainer>
                      <slot />
                    </ResponsiveDeviceContainer>
                  </template>
                </div>

                <!-- Bottom console - can be toggled -->
                <Transition name="console-slide">
                  <div
                    v-if="api.store.dev.showConsoleBar"
                    class="console"
                  >
                    <DevConsole />
                  </div>
                </Transition>
              </div>

              <!-- Sidebar - can be toggled, transitions in/out -->
              <Transition name="sidebar-slide">
                <div
                  v-if="api.store.dev.showSideBar"
                  class="sidebar"
                >
                  <DevSideBar />
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
.docs-container {
  height: 100vh;
  width: 100%;
  overflow: hidden;
}

.docs-iframe {
  width: 100%;
  height: 100%;
  border: none;
  overflow: hidden;
}

/* Developer mode layout */
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

.sidebar {
  flex: 0 0 300px;
  height: 100%;
  overflow-y: auto;
  border-left: 1px solid var(--dev-lines);
  background-color: var(--dev-bg);
}

.console {
  height: v-bind(height_pct);
  width: 100%;
  background-color: var(--muted);
  border-top: 1px solid var(--dev-lines);
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
