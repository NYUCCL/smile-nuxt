<script setup>
import { BugPlay } from 'lucide-vue-next'
// Component imports
import StepInfoButtonGroup from './StepInfoButtonGroup.vue'
import ViewInfoButtonGroup from './ViewInfoButtonGroup.vue'
import ResetButton from './ResetButton.vue'
import ReloadButton from './ReloadButton.vue'
import ColorModeButton from './ColorModeButton.vue'
import DatabaseButtonGroup from './DatabaseButtonGroup.vue'
import FullScreenButton from './FullScreenButton.vue'
import PanelButtonGroup from './PanelButtonGroup.vue'
import DevModeLabel from './DevModeLabel.vue'
import KeyCommandNotification from './KeyCommandNotification.vue'
import LogoutButton from '../presentation/LogoutButton.vue'

// Icon imports

// Vue composables
import { ref } from 'vue'
import { onKeyDown } from '@vueuse/core'
import useAPI from '../../../composables/useAPI'
import * as actions from '../devActions'

// API composable

/**
 * API instance for accessing application state and methods
 */
const api = useAPI()

/**
 * Reactive refs for notification system
 */
const showNotification = ref(false)
const notificationCommand = ref('')
const notificationAction = ref('')
const notificationType = ref('default')

/**
 * Shows a temporary notification with a command and action that automatically hides after 1.5 seconds
 *
 * @param {string} command - The command text to display in the notification
 * @param {string} action - The action text to display in the notification
 * @param {string} type - The type of notification ('default' or 'error')
 */
const showTemporaryNotification = (command, action, type = 'default') => {
  notificationCommand.value = command
  notificationAction.value = action
  notificationType.value = type
  showNotification.value = true
  setTimeout(() => {
    showNotification.value = false
  }, 1500) // Hide after 1.5 seconds
}

/**
 * Developer mode keyboard shortcuts. What each one does is in ../devActions.js,
 * shared with the `:` command palette (../palette/).
 *
 * Navigation:
 * - ArrowUp: Go to previous view
 * - ArrowDown: Go to next view
 *
 * Panel Controls:
 * - Ctrl+1: Toggle sidebar
 * - Ctrl+`: Toggle console
 * - Ctrl+2: Cycle through sidebar tabs (Steps -> Random -> DB Info)
 * - Ctrl+3: Cycle through console tabs (Browse -> Log -> Config)
 * - Ctrl+R: Reset local state
 * - Ctrl+D: Connect to database
 * - Ctrl+A: Autofill current view (if available)
 * - Ctrl+P: Pin/unpin current route
 */
const ctrlShortcuts = {
  '1': ['Ctrl + 1', actions.toggleSideBar],
  '`': ['Ctrl + `', actions.toggleConsole],
  '2': ['Ctrl + 2', actions.cycleSideBarTab],
  '3': ['Ctrl + 3', actions.cycleConsoleTab],
  'r': ['Ctrl + R', actions.resetLocalState],
  'd': ['Ctrl + D', actions.connectDatabase],
  'a': ['Ctrl + A', actions.autofillView],
  'p': ['Ctrl + P', actions.togglePinnedRoute],
}

onKeyDown((e) => {
  // Previous / next view (no toast)
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault()
    if (e.key === 'ArrowUp') actions.goPrevView(api)
    else actions.goNextView(api)
    return
  }
  if (!e.ctrlKey) return
  const shortcut = ctrlShortcuts[e.key]
  if (!shortcut) return
  e.preventDefault()
  const [command, run] = shortcut
  // Only a failure gets a toast; a success shows itself
  const { action, type } = run(api)
  if (type === 'error') showTemporaryNotification(command, action, type)
})
</script>

<template>
  <!-- Main navigation bar: mode and version on the left, controls on the right.
       Controls are borderless toolbar buttons in groups, separated by thin rules. -->
  <nav class="flex items-center justify-between gap-4 w-full border-b border-sd-line h-9 px-3 text-xs">
    <DevModeLabel
      :icon="BugPlay"
      label="Developer mode"
      short="Dev"
    />

    <div class="flex items-center gap-1 flex-shrink-0">
      <LogoutButton />
      <ReloadButton />
      <ResetButton />
      <ColorModeButton v-if="api.store.dev.isFullscreen && api.currentRouteName() !== 'recruit'" />
      <FullScreenButton v-if="api.currentRouteName() !== 'recruit'" />
      <div class="sd-toolbar-rule" />
      <DatabaseButtonGroup />
      <div class="sd-toolbar-rule" />
      <StepInfoButtonGroup />
      <div class="sd-toolbar-rule hidden md:block" />
      <div class="hidden md:flex items-center">
        <ViewInfoButtonGroup />
      </div>
      <div class="sd-toolbar-rule" />
      <PanelButtonGroup />
    </div>
  </nav>

  <!-- Keyboard command notification overlay -->
  <KeyCommandNotification
    :show="showNotification"
    :command="notificationCommand"
    :action="notificationAction"
    :type="notificationType"
  />
</template>
