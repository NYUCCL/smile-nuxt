<script setup>
import { ChevronDown, Database, Settings, Terminal } from 'lucide-vue-next'
/**
 * @fileoverview Main console component for developer mode
 * Provides a tabbed interface for database browsing, log viewing, and configuration
 */

import ConsoleDatabaseBrowsePanel from './ConsoleDatabaseBrowsePanel.vue'
import ConsoleLogPanel from './ConsoleLogPanel.vue'
import ConsoleConfigPanel from './ConsoleConfigPanel.vue'
import useAPI from '../../../composables/useAPI'

/**
 * Initialize the API instance for accessing store and navigation
 */
const api = useAPI()
</script>

<template>
  <!-- Main console container with left sidebar and right content area -->
  <div class="w-full h-full flex overflow-hidden border-t border-sd-line">
    <!-- Left sidebar - 36px wide with tab navigation -->
    <div class="sd-rail h-full">
      <!-- Top section with tab buttons -->
      <div>
        <!-- Magnifying glass button - Browse tab -->
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="toolbar"
                size="icon"
                class="sd-field w-6 px-0"
                :class="{
                  'bg-sd-selected text-sd-selected-fg hover:bg-sd-selected-hover': api.store.dev.consoleBarTab === 'browse',
                }"
                @click="api.store.dev.consoleBarTab = 'browse'"
              >
                <Database class="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Data Explorer</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <!-- Book button - Log tab -->
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="toolbar"
                size="icon"
                class="sd-field w-6 px-0"
                :class="{
                  'bg-sd-selected text-sd-selected-fg hover:bg-sd-selected-hover': api.store.dev.consoleBarTab === 'log',
                }"
                @click="api.store.dev.consoleBarTab = 'log'"
              >
                <Terminal class="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Narrative Log</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <!-- Config gear button - Config tab -->
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="toolbar"
                size="icon"
                class="sd-field w-6 px-0"
                :class="{
                  'bg-sd-selected text-sd-selected-fg hover:bg-sd-selected-hover': api.store.dev.consoleBarTab === 'config',
                }"
                @click="api.store.dev.consoleBarTab = 'config'"
              >
                <Settings class="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Configuration</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <!-- Hide button - anchored to bottom -->
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="toolbar"
              size="icon"
              class="sd-field w-6 px-0"
              @click="api.store.dev.showConsoleBar = false"
            >
              <ChevronDown class="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Hide Console</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <!-- Right column - remaining width with panel content -->
    <div class="flex-1 h-full flex flex-col min-w-0 overflow-hidden">
      <!-- Panel content area -->
      <div class="flex-1 overflow-hidden">
        <ConsoleDatabaseBrowsePanel v-if="api.store.dev.consoleBarTab === 'browse'" />
        <ConsoleLogPanel v-if="api.store.dev.consoleBarTab === 'log'" />
        <ConsoleConfigPanel v-if="api.store.dev.consoleBarTab === 'config'" />
      </div>
    </div>
  </div>
</template>
