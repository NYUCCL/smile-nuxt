<script setup>
import { Dices, Info, ListTree } from 'lucide-vue-next'
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
        class="w-full gap-0"
      >
        <!-- Tab navigation -->
        <TabsList class="sd-tabs">
          <TabsTrigger
            value="steps"
            class="sd-tab"
          >
            <ListTree />
            Steps
          </TabsTrigger>
          <TabsTrigger
            value="randomization"
            class="sd-tab"
          >
            <Dices />
            Random
          </TabsTrigger>
          <TabsTrigger
            value="db"
            class="sd-tab"
          >
            <Info />
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
      <div class="border-t border-sd-line">
        <ConfigurationVariablesPanel />
      </div>
      <div>
        <AppProgressPanel />
      </div>
      <div class="border-t border-sd-line">
        <StudyInfoPanel />
      </div>
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
  background-color: var(--sd-chrome);
}
</style>
