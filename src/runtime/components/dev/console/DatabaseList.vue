<script setup>
import { ChevronRight, House } from 'lucide-vue-next'
/**
 * @fileoverview Database list component
 * Displays hierarchical data structures with navigation capabilities
 */

import { computed } from 'vue'
import useAPI from '../../../composables/useAPI'

/**
 * Component props for data and selection state
 * @typedef {object} Props
 * @property {string|null} data - The data path to display
 * @property {string|null} selected - Currently selected item
 */
const props = defineProps(['data', 'selected'])

/**
 * Initialize the API instance for accessing data and store
 */
const api = useAPI()

/**
 * Define component emits for selection events
 */
const emit = defineEmits(['selected'])

/**
 * Truncate text to a maximum length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length before truncation
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength = 20) {
  if (!text) return text
  const textStr = String(text)
  if (textStr.length <= maxLength) return textStr
  return textStr.substring(0, maxLength) + '...'
}

/**
 * Compute the header text from the data path
 * @returns {string|null} Header text or null if no data
 */
const header = computed(() => {
  if (props.data === undefined || props.data === null) {
    return null
  }
  else {
    const pieces = props.data.split('.')
    return pieces[pieces.length - 1]
  }
})

/**
 * Compute the data field to display based on the current path
 * @returns {object | null} Data object or null if invalid path
 */
const data_field = computed(() => {
  if (props.data !== undefined && props.data !== null) {
    const pieces = props.data.split('.')
    let view_data = api.all_data
    for (let i = 0; i < pieces.length; i++) {
      if (view_data[pieces[i]]) {
        view_data = view_data[pieces[i]]
      }
    }
    return view_data
  }
  else {
    return null
  }
})

/**
 * Handle option selection and emit the selected event
 * @param {string} option - Selected option key
 */
function option_selected(option) {
  emit('selected', option)
}
</script>

<template>
  <!-- Database list container with header and scrollable content -->
  <aside
    class="w-full h-full flex flex-col database-list-container"
    style="background-color: var(--background)"
  >
    <!-- Header section with navigation title -->
    <div
      v-if="header"
      class="bg-sd-chrome text-sd-text-muted px-3 text-xs border-b border-sd-line h-7 flex items-center"
    >
      <template v-if="header == '/'">
        <House class="size-3.5" />
      </template>
      <template v-else>
        <span class="font-mono">{{ header }}</span>
      </template>
    </div>

    <!-- Scrollable list content -->
    <div class="flex-1 overflow-y-auto overflow-x-hidden">
      <ul class="space-y-0.5 p-1">
        <!-- Empty state message -->
        <li
          v-if="
            (data_field === null || data_field === undefined || Object.keys(data_field).length == 0) && header !== null
          "
        >
          <div class="px-2 py-1.5 text-sd-text text-xs font-mono">
            Empty currently
          </div>
        </li>

        <!-- Data items list -->
        <li
          v-for="(option, key) in data_field"
          :key="key"
        >
          <!-- Non-object values (display only) -->
          <div
            v-if="option === null || (typeof option != 'object' && !Array.isArray(option))"
            class="px-2 py-1.5 text-xs font-mono primitive-item"
          >
            <span class="font-mono font-medium text-sd-text item-key">{{ truncateText(key) }}</span>
            <span class="text-sd-text item-value">: {{ option === null ? 'null' : truncateText(String(option)) }}</span>
          </div>

          <!-- Object values (clickable navigation) -->
          <button
            v-else
            :class="[
              'w-full text-left px-2 py-1.5 text-xs font-mono rounded transition-colors duration-150 object-item',
              'hover:bg-accent hover:text-accent-foreground',
              'focus:outline-none focus:ring-1 focus:ring-ring',
              key === props.selected ? 'bg-accent text-accent-foreground border border-sd-line' : 'text-sd-text',
            ]"
            @click="option_selected(key)"
          >
            <div class="flex items-center justify-between">
              <span class="font-medium text-sd-text item-key">{{ truncateText(key) }}</span>
              <ChevronRight class="text-sd-text-muted size-3.5" />
            </div>
          </button>
        </li>
      </ul>
    </div>
  </aside>
</template>

<style scoped>
/* Custom scrollbar styling for better UX */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: var(--sd-scrollbar-track);
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: var(--sd-scrollbar-thumb);
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: var(--sd-scrollbar-thumb-hover);
}

/* Semantic styling for database list items */
.item-key {
  color: var(--sd-key);
  font-weight: 400;
}

.primitive-item .item-value {
  color: var(--sd-value);
  font-weight: 400;
}

.object-item .item-key {
  color: var(--sd-key);
  font-weight: 400;
}

.object-item .item-value {
  color: var(--sd-key);
  font-weight: 400;
}
</style>
