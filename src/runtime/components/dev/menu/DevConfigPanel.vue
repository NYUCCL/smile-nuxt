<script setup>
import { RotateCcw } from 'lucide-vue-next'
/**
 * @fileoverview Developer configuration panel component for adjusting developer mode settings
 */

/**
 * Import Vue composition API functions
 * Note: No Vue composition API functions are currently used in this component
 */

/**
 * Import SMILE API composable for accessing application state and methods
 * @requires useAPI SMILE API composable
 */

/**
 * Import UI components from shadcn-vue
 * @requires ResponsiveDeviceSelect Component for device selection
 * @requires Label Label component for form inputs
 * @requires Switch Switch component for toggles
 * @requires Button Button component for actions
 * @requires Separator Separator component for visual dividers
 * @requires Select Select components for dropdown menus
 * @requires Tooltip Tooltip components for enhanced UX
 */
import ResponsiveDeviceSelect from './ResponsiveDeviceSelect.vue'
import { useSmileColorMode } from '../../../composables/useColorMode'
import { DEV_PALETTES, useDevPalette } from '../../../composables/useDevPalette'

/**
 * Import shared device presets
 * @requires devicePresets Shared device presets for responsive testing
 */
import { devicePresets } from '../devicePresets.js'
import useAPI from '../../../composables/useAPI'

/**
 * Initialize SMILE API instance
 * @constant {object} api Global API instance
 */
const api = useAPI()

/** The dev tools' own theme mode (the same setting the app menu's button cycles) */
const { mode: devColorMode, system } = useSmileColorMode('global')

/** The dev tools' palette */
const devPalette = useDevPalette()

/**
 * Check if current dimensions match any preset and update selected device
 *
 * Compares current device dimensions against all presets, checking both
 * normal and rotated orientations. Updates the selected device in the store.
 *
 * @function checkForMatchingPreset
 * @returns {void}
 */
const checkForMatchingPreset = () => {
  for (const [key, preset] of Object.entries(devicePresets)) {
    // Check both normal orientation and rotated orientation
    const matchesNormal = api.store.dev.deviceWidth === preset.width && api.store.dev.deviceHeight === preset.height
    const matchesRotated = api.store.dev.deviceWidth === preset.height && api.store.dev.deviceHeight === preset.width

    if (matchesNormal || matchesRotated) {
      api.store.dev.selectedDevice = key
      return
    }
  }
  // If no match found, keep as custom
  api.store.dev.selectedDevice = 'custom'
}

/**
 * Toggle rotation by swapping width and height dimensions
 *
 * Swaps the device width and height values and updates the rotation state.
 * Also checks if the new dimensions match any preset.
 *
 * @function toggleRotation
 * @returns {void}
 */
const toggleRotation = () => {
  const tempWidth = api.store.dev.deviceWidth
  api.store.dev.deviceWidth = api.store.dev.deviceHeight
  api.store.dev.deviceHeight = tempWidth
  api.store.dev.isRotated = !api.store.dev.isRotated

  // Check if the new dimensions match any preset
  checkForMatchingPreset()
}

/**
 * Reset developer mode settings to default values
 *
 * Removes developer mode settings from localStorage and reloads the page
 * to restore default configuration.
 *
 * @function resetDevState
 * @returns {void}
 */
function resetDevState() {
  localStorage.removeItem(api.config.devLocalStorageKey) // delete the local store (legacy)
  // Reset cookie-backed dev state to defaults
  const defaults = { viewProvidesAutofill: null, viewProvidesStepper: false, showConsoleBar: false, showSideBar: false, pinnedRoute: null, mainView: 'devmode', consoleBarHeight: 300, consoleBarTab: 'browse', sideBarTab: 'steps', searchParams: '', logFilter: 'All', notificationFilter: 'Errors only', lastViewLimit: false, dataPath: null, configPath: null, selectedDevice: 'desktop2', deviceWidth: 1024, deviceHeight: 768, isRotated: false, isFullscreen: false, routePanelVisible: false, globalColorMode: 'auto', devPalette: 'default', experimentColorMode: null }
  Object.assign(api.store.dev, defaults)
  location.reload()
}
</script>

<template>
  <!-- Dev tools settings: appearance, panels, responsive preview -->
  <div class="sd-settings">
    <div class="sd-settings-title">
      Dev tools settings
    </div>

    <!-- Appearance (the dev tools only; the palette picker joins it here) -->
    <div class="sd-section">
      Appearance
    </div>
    <div class="sd-settings-group">
      <div class="sd-settings-row">
        <Label class="sd-label font-normal">Palette</Label>
        <Select v-model="devPalette">
          <SelectTrigger class="sd-field w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="p in DEV_PALETTES"
              :key="p.value"
              :value="p.value"
            >
              {{ p.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="sd-settings-row">
        <Label class="sd-label font-normal">Mode</Label>
        <Select v-model="devColorMode">
          <SelectTrigger class="sd-field w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">
              System ({{ system }})
            </SelectItem>
            <SelectItem value="light">
              Light
            </SelectItem>
            <SelectItem value="dark">
              Dark
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <!-- Panels -->
    <div class="sd-section">
      Panels
    </div>
    <div class="sd-settings-group">
      <div class="sd-settings-row">
        <Label
          for="sd-show-sidebar"
          class="sd-label font-normal"
        >Side panel</Label>
        <div class="flex items-center gap-2">
          <Select v-model="api.store.dev.sideBarTab">
            <SelectTrigger class="sd-field w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="steps">
                Steps
              </SelectItem>
              <SelectItem value="randomization">
                Random
              </SelectItem>
              <SelectItem value="db">
                Info
              </SelectItem>
            </SelectContent>
          </Select>
          <Switch
            id="sd-show-sidebar"
            v-model="api.store.dev.showSideBar"
          />
        </div>
      </div>
      <div class="sd-settings-row">
        <Label
          for="sd-show-console"
          class="sd-label font-normal"
        >Console</Label>
        <div class="flex items-center gap-2">
          <Select v-model="api.store.dev.consoleBarTab">
            <SelectTrigger class="sd-field w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="browse">
                Data
              </SelectItem>
              <SelectItem value="log">
                Log
              </SelectItem>
              <SelectItem value="config">
                Config
              </SelectItem>
            </SelectContent>
          </Select>
          <Switch
            id="sd-show-console"
            v-model="api.store.dev.showConsoleBar"
          />
        </div>
      </div>
    </div>

    <!-- Responsive preview -->
    <div class="sd-section">
      Preview
    </div>
    <div class="sd-settings-group">
      <div class="sd-settings-row">
        <Label
          for="sd-fullscreen"
          class="sd-label font-normal"
        >Full screen</Label>
        <Switch
          id="sd-fullscreen"
          v-model="api.store.dev.isFullscreen"
        />
      </div>
      <div class="sd-settings-row">
        <Label class="sd-label font-normal">Device</Label>
        <div class="flex items-center gap-1">
          <ResponsiveDeviceSelect />
          <Button
            variant="toolbar"
            size="menu"
            title="Rotate device"
            @click="toggleRotation"
          >
            <RotateCcw :class="{ 'text-sd-link': api.store.dev.isRotated }" />
          </Button>
        </div>
      </div>
    </div>

    <div class="sd-settings-footer">
      <Button
        variant="panel"
        class="sd-field px-2.5"
        @click="resetDevState"
      >
        Reset to defaults
      </Button>
    </div>
  </div>
</template>

<style scoped>
.sd-settings {
  width: 280px;
  color: var(--sd-text);
  font-size: var(--sd-font-sm);
}

.sd-settings-title {
  padding: 10px 12px;
  font-size: var(--sd-font-md);
  font-weight: 600;
}

.sd-settings-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px 10px;
}

.sd-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: var(--sd-control-h);
}

.sd-settings-footer {
  display: flex;
  justify-content: flex-end;
  padding: 8px 12px;
  border-top: 1px solid var(--sd-line);
}
</style>
