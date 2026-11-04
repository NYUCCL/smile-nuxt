<script setup>
import { computed } from 'vue'
import useAPI from '../../../composables/useAPI'
import DevNumberInput from '../DevNumberInput.vue'
import { useSmileColorMode } from '../../../composables/useColorMode'

const api = useAPI()

/** The study-state switches in the first row (label, read, write) */
const stateSwitches = [
  { label: 'Consent', get: () => api.store.cookieState.consented, set: (v) => { api.store.cookieState.consented = v } },
  { label: 'Known', get: () => api.store.cookieState.knownUser, set: (v) => { api.store.cookieState.knownUser = v } },
  { label: 'Done', get: () => api.store.cookieState.done, set: (v) => { api.store.cookieState.done = v } },
  { label: 'Withdrew', get: () => api.store.cookieState.withdrawn, set: (v) => { api.store.cookieState.withdrawn = v } },
  { label: 'Visible', get: () => api.store.data.verifiedVisibility, set: (v) => { api.store.data.verifiedVisibility = v } },
]

/**
 * Color mode composable for experiment color mode
 * @type {ReturnType<typeof useSmileColorMode>}
 */
const { system, mode: experimentColorMode } = useSmileColorMode('experiment')

/**
 * Computed property that syncs the dropdown with the actual color mode
 * @type {import('vue').ComputedRef<string>}
 */
const colorModeSelect = computed({
  get: () => experimentColorMode.value,
  set: (value) => {
    experimentColorMode.value = value
    // Also update the API config to keep it in sync
    api.config.colorMode = value
  },
})

/**
 * Computed property for the display text in the SelectTrigger
 * @type {import('vue').ComputedRef<string>}
 */
const colorModeDisplayText = computed(() => {
  switch (colorModeSelect.value) {
    case 'light':
      return 'Light'
    case 'dark':
      return 'Dark'
    case 'auto':
      return `System (${system.value})`
    default:
      return colorModeSelect.value
  }
})
</script>

<template>
  <!-- Study state switches and participant-facing settings -->
  <div class="sd-config">
    <!-- Study state (cookie): consent, known, done, withdrew, verified visibility -->
    <div class="sd-config-row">
      <label
        v-for="item in stateSwitches"
        :key="item.label"
        class="sd-config-switch"
      >
        <span class="sd-label">{{ item.label }}</span>
        <Switch
          :model-value="item.get()"
          @update:model-value="item.set"
        />
      </label>
    </div>

    <!-- Minimum window size and aggressive mode -->
    <div
      class="sd-config-row"
      :class="{ 'sd-config-alert': api.store.browserEphemeral.tooSmall }"
    >
      <div class="sd-config-field">
        <span class="sd-label">Min window size (W × H)</span>
        <div class="flex items-center gap-1.5">
          <DevNumberInput
            v-model="api.config.windowsizerRequest.width"
            :step="10"
            label="minimum width"
          />
          <span class="sd-label">×</span>
          <DevNumberInput
            v-model="api.config.windowsizerRequest.height"
            :step="10"
            label="minimum height"
          />
        </div>
      </div>
      <label class="sd-config-check">
        <Checkbox v-model="api.config.windowsizerAggressive" />
        <span class="sd-label">Aggressive</span>
      </label>
    </div>

    <!-- Responsive UI, color mode, recruitment service -->
    <div class="sd-config-row">
      <div class="sd-config-field">
        <span class="sd-label">Color mode</span>
        <Select v-model="colorModeSelect">
          <SelectTrigger class="sd-field w-32">
            <SelectValue>{{ colorModeDisplayText }}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">
              Light
            </SelectItem>
            <SelectItem value="dark">
              Dark
            </SelectItem>
            <SelectItem value="auto">
              System ({{ system }})
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="sd-config-field">
        <span class="sd-label">Service</span>
        <Select v-model="api.store.data.recruitmentService">
          <SelectTrigger class="sd-field w-24">
            <SelectValue :placeholder="api.store.data.recruitmentService" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="(cond, key) in api.store.browserEphemeral.urls"
              :key="key"
              :value="key"
            >
              {{ key }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label class="sd-config-check">
        <Checkbox v-model="api.config.responsiveUI" />
        <span class="sd-label">Responsive UI</span>
      </label>
    </div>
  </div>
</template>

<style scoped>
.sd-config-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px 16px;
  padding: 10px 12px;
  border-top: 1px solid var(--sd-line);
}

.sd-config-alert {
  background-color: var(--sd-error-bg);
}
.sd-config-alert .sd-label {
  color: var(--sd-error);
}

.sd-config-switch,
.sd-config-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sd-config-switch {
  align-items: center;
  cursor: pointer;
}

.sd-config-check {
  display: flex;
  align-items: center;
  gap: 6px;
  height: var(--sd-control-h);
  cursor: pointer;
}
</style>
