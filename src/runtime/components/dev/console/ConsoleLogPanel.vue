<script setup>
import { ChevronRight, Clock, Database, GitBranch, Settings, Timer } from 'lucide-vue-next'
/**
 * @fileoverview Console log panel component
 * Displays application logs with filtering and search capabilities
 */

import { computed } from 'vue'
import useLog from '../../../stores/log'
import useAPI from '../../../composables/useAPI'

// Import shadcn/ui components

/**
 * Initialize the API instance for accessing store and configuration
 */
const api = useAPI()

/**
 * Initialize the log store for accessing log history
 */
const log = useLog()

/**
 * Compute the height percentage for the log display area
 * @returns {string} Height in pixels
 */
const height_pct = computed(() => `${api.store.dev.consoleBarHeight - 55}px`)

/**
 * Filter log messages based on search text and log type
 * @param {object} msg - Log message object
 * @param {string} msg.message - Log message text
 * @param {string} msg.type - Log type (debug, warn, error, etc.)
 * @returns {boolean} Whether the message should be displayed
 */
function filter_log(msg) {
  const search_match = msg.message.toLowerCase().includes(api.store.dev.searchParams.toLowerCase())
  let type_match = true
  switch (api.store.dev.logFilter) {
    case 'All':
      break
    case 'Debug only':
      type_match = msg.type === 'debug'
      break
    case 'Warnings and Errors only':
      type_match = msg.type === 'warn' || msg.type === 'error'
      break
    case 'Warnings only':
      type_match = msg.type === 'warn'
      break
    case 'Errors only':
      type_match = msg.type === 'error'
      break
  }
  return search_match && type_match
}

/**
 * Get the background CSS class for a log message based on its type
 * @param {object} msg - Log message object
 * @param {string} msg.type - Log type
 * @returns {string} CSS class name for background styling
 */
function getBgClass(msg) {
  // A row per message; warnings, errors and successes get a tint and a mark
  return {
    warn: 'sd-log-warn',
    error: 'sd-log-error',
    success: 'sd-log-ok',
    debug: 'sd-log-debug',
  }[msg.type] ?? ''
}
</script>

<template>
  <!-- Console log panel with controls and log display -->
  <div class="h-full p-0 m-0 overflow-hidden">
    <!-- Control bar with filters and search -->
    <div class="sd-controlbar justify-end">
      <div class="flex items-center justify-end gap-4">
        <!-- Since last view toggle -->
        <div class="flex items-center gap-2">
          <Label class="sd-label font-normal">Since last view</Label>
          <Switch
            v-model="api.store.dev.lastViewLimit"
            size="sm"
          />
        </div>

        <!-- Search input -->
        <div class="flex items-center gap-2">
          <Label class="sd-label font-normal">Search</Label>
          <Input
            v-model="api.store.dev.searchParams"
            placeholder="Filter text"
            class="sd-field w-32"
          />
        </div>

        <!-- Log type filter -->
        <div class="flex items-center gap-2">
          <Label class="sd-label font-normal">Filter</Label>
          <Select v-model="api.store.dev.logFilter">
            <SelectTrigger class="sd-field">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">
                All
              </SelectItem>
              <SelectItem value="Current page only">
                Current page only
              </SelectItem>
              <SelectItem value="Debug only">
                Debug only
              </SelectItem>
              <SelectItem value="Warnings and Errors only">
                Warnings and Errors only
              </SelectItem>
              <SelectItem value="Warnings only">
                Warnings only
              </SelectItem>
              <SelectItem value="Errors only">
                Errors only
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Notification filter -->
        <div class="flex items-center gap-2">
          <Label class="sd-label font-normal">Notifications</Label>
          <Select v-model="api.store.dev.notificationFilter">
            <SelectTrigger class="sd-field">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">
                All
              </SelectItem>
              <SelectItem value="None">
                None
              </SelectItem>
              <SelectItem value="Warnings and Errors">
                Warnings and Errors
              </SelectItem>
              <SelectItem value="Warnings only">
                Warnings only
              </SelectItem>
              <SelectItem value="Errors only">
                Errors only
              </SelectItem>
              <SelectItem value="Success only">
                Success only
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>

    <!-- Log display area with scrollable content -->
    <div
      class="w-full overflow-hidden overflow-y-scroll flex flex-col-reverse box-border"
      :style="{ height: height_pct }"
    >
      <div class="w-full min-w-0">
        <!-- Log messages list - filtered by last view setting -->
        <ul
          v-if="api.store.dev.lastViewLimit"
          class="w-full min-w-0"
        >
          <template
            v-for="(msg, idx) in log.page_history"
            :key="idx"
          >
            <li
              v-if="filter_log(msg)"
              :class="[
                getBgClass(msg),
                'sd-log-row',
              ]"
            >
              <div class="flex items-start gap-1.5 min-w-0">
                <!-- Icon indicator based on message content -->
                <div class="sd-log-icon">
                  <GitBranch
                    v-if="msg.message.includes('ROUTER GUARD')"
                    class="size-3.5"
                  />
                  <Database
                    v-else-if="msg.message.includes('SMILESTORE')"
                    class="size-3.5"
                  />
                  <Settings
                    v-else-if="msg.message.includes('DEV MODE')"
                    class="size-3.5"
                  />
                  <Clock
                    v-else-if="msg.message.includes('TIMELINE STEPPER')"
                    class="size-3.5"
                  />
                  <Timer
                    v-else-if="msg.message.includes('TRIAL STEPPER')"
                    class="size-3.5"
                  />
                  <Database
                    v-else-if="msg.message.includes('DATABASE')"
                    class="size-3.5"
                  />
                  <ChevronRight
                    v-else
                    class="size-3.5"
                  />
                </div>
                <!-- Message content -->
                <div class="min-w-0 flex-1">
                  <div class="sd-log-message">
                    <span class="sd-log-time">{{ msg.time }}</span> {{ msg.message }}
                  </div>
                  <div class="sd-log-trace">
                    {{ msg.trace }}
                  </div>
                </div>
              </div>
            </li>
          </template>
        </ul>
        <!-- Log messages list - full history -->
        <ul
          v-else
          class="w-full min-w-0"
        >
          <template
            v-for="(msg, idx) in log.history"
            :key="idx"
          >
            <li
              v-if="filter_log(msg)"
              :class="[
                getBgClass(msg),
                'sd-log-row',
              ]"
            >
              <div class="flex items-start gap-1.5 min-w-0">
                <!-- Icon indicator based on message content -->
                <div class="sd-log-icon">
                  <GitBranch
                    v-if="msg.message.includes('ROUTER GUARD')"
                    class="size-3.5"
                  />
                  <Database
                    v-else-if="msg.message.includes('SMILESTORE')"
                    class="size-3.5"
                  />
                  <Settings
                    v-else-if="msg.message.includes('DEV MODE')"
                    class="size-3.5"
                  />
                  <Clock
                    v-else-if="msg.message.includes('TIMELINE STEPPER')"
                    class="size-3.5"
                  />
                  <Timer
                    v-else-if="msg.message.includes('TRIAL STEPPER')"
                    class="size-3.5"
                  />
                  <Database
                    v-else-if="msg.message.includes('DATABASE')"
                    class="size-3.5"
                  />
                  <ChevronRight
                    v-else
                    class="size-3.5"
                  />
                </div>
                <!-- Message content -->
                <div class="min-w-0 flex-1">
                  <div class="sd-log-message">
                    <span class="sd-log-time">{{ msg.time }}</span> {{ msg.message }}
                  </div>
                  <div class="sd-log-trace">
                    {{ msg.trace }}
                  </div>
                </div>
              </div>
            </li>
          </template>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overflow-y-scroll::-webkit-scrollbar {
  width: 6px;
}
.overflow-y-scroll::-webkit-scrollbar-track {
  background: var(--sd-scrollbar-track);
}
.overflow-y-scroll::-webkit-scrollbar-thumb {
  background: var(--sd-scrollbar-thumb);
  border-radius: 3px;
}
.overflow-y-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--sd-scrollbar-thumb-hover);
}

/* One log message: content background, mono, a hairline between rows */
.sd-log-row {
  width: 100%;
  min-width: 0;
  padding: 5px 12px 5px 10px;
  border-bottom: 1px solid var(--sd-line);
  border-left: 2px solid transparent;
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: var(--sd-font-xs);
  line-height: 1.5;
  color: var(--sd-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.sd-log-warn {
  background-color: var(--sd-log-warn-bg);
  border-left-color: var(--sd-log-warn);
}
.sd-log-error {
  background-color: var(--sd-log-error-bg);
  border-left-color: var(--sd-log-error);
}
.sd-log-ok {
  background-color: var(--sd-log-info-bg);
  border-left-color: var(--sd-log-info);
}
.sd-log-debug {
  color: var(--sd-text-muted);
}

.sd-log-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--sd-text-muted);
}
.sd-log-warn .sd-log-icon {
  color: var(--sd-log-warn);
}
.sd-log-error .sd-log-icon {
  color: var(--sd-log-error);
}
.sd-log-ok .sd-log-icon {
  color: var(--sd-log-info);
}

.sd-log-time {
  color: var(--sd-text-muted);
}
.sd-log-trace {
  color: var(--sd-text-muted);
  font-size: 10px;
}
</style>
