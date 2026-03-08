<script setup>
import StepExplorerPanel from './StepExplorerPanel.vue'
import ConfigurationVariablesPanel from './ConfigurationVariablesPanel.vue'
import DatabaseStatusInfoPanel from './DatabaseStatusInfoPanel.vue'
import RandomizationSidebarPanel from './RandomizationSidebarPanel.vue'
import StudyInfoPanel from './StudyInfoPanel.vue'
import AppProgressPanel from './AppProgressPanel.vue'
import useAPI from '../../../composables/useAPI'

/**
 * API instance for accessing store and navigation
 * @type {import('@/core/composables/useAPI')}
 */
const api = useAPI()
</script>

<template>
  <!-- Main sidebar container -->
  <div class="sidebar-container">
    <!-- Tabbed content area -->
    <div class="sidebar-content">
      <Tabs
        v-model="api.store.dev.sideBarTab"
        class="w-full border-t border-border py-2"
      >
        <!-- Tab navigation -->
        <TabsList class="mx-auto text-xs">
          <TabsTrigger
            value="steps"
            class="text-[0.75rem] font-mono"
          >
            Steps
          </TabsTrigger>
          <TabsTrigger
            value="randomization"
            class="text-[0.75rem] font-mono"
          >
            Random
          </TabsTrigger>
          <TabsTrigger
            value="db"
            class="text-[0.75rem] font-mono"
          >
            Info
          </TabsTrigger>
        </TabsList>

        <!-- Steps explorer tab -->
        <TabsContent value="steps">
          <StepExplorerPanel />
        </TabsContent>

        <!-- Randomization controls tab -->
        <TabsContent value="randomization">
          <RandomizationSidebarPanel />
        </TabsContent>

        <!-- Database info tab -->
        <TabsContent value="db">
          <DatabaseStatusInfoPanel />
        </TabsContent>
      </Tabs>
    </div>

    <!-- Footer panels -->
    <div class="sidebar-footer">
      <ConfigurationVariablesPanel />
      <AppProgressPanel />
      <StudyInfoPanel />
    </div>
  </div>
</template>

<style scoped>
.sidebar-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 100%;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
}

.sidebar-footer {
  margin-top: auto;
  padding-top: 1rem;
}
</style>
