<script setup>
import { ChevronLeft, ChevronRight, Home, Trash2 } from 'lucide-vue-next'
import { ref, computed, watch } from 'vue'
import StepNode from './StepNode.vue'
import StepDataViewer from './StepDataViewer.vue'
import useViewAPI from '../../../composables/useViewAPI'

/**
 * API instance for step navigation and data access
 * @type {import('@/core/composables/useViewAPI')}
 */
const api = useViewAPI()

/**
 * Computed state machine visualization data
 * @type {import('vue').ComputedRef<object>}
 */
const stateMachine = computed(() => api.steps.visualize())

/**
 * Converts array path to string format (e.g., [1, 1] -> "1/1")
 * @param {Array} pathArray - The path array to convert
 * @returns {string} The path as a string
 */
const _pathToString = (pathArray) => {
  return Array.isArray(pathArray) ? pathArray.join('/') : ''
}

/**
 * Checks if a node is currently selected
 * @param {string} nodePath - The path of the node to check
 * @returns {boolean} True if the node is selected
 */
const isNodeSelected = (nodePath) => {
  if (!api.path) return false
  const currentPathStr = api.pathString
  return nodePath === currentPathStr
}

/**
 * Formats an object with proper indentation for display
 * @param {*} obj - The object to format
 * @param {number} indent - The indentation level
 * @param {WeakSet} seen - Set to track circular references
 * @returns {string} The formatted object string
 */
const formatObjectWithIndent = (obj, indent = 0, seen = new WeakSet()) => {
  if (obj === null || obj === undefined) return 'null'

  // Handle circular references
  if (typeof obj === 'object' && seen.has(obj)) {
    return '[Circular]'
  }

  const spaces = ' '.repeat(indent * 2) // 2 spaces per indent level

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]'
    seen.add(obj)
    const items = obj.map(item => formatObjectWithIndent(item, indent + 1, seen)).join(',\n' + spaces + '  ')
    return `[\n${spaces}  ${items}\n${spaces}]`
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj)
    if (entries.length === 0) return '{}'
    seen.add(obj)
    const items = entries
      .map(([key, value]) => {
        const formattedValue = formatObjectWithIndent(value, indent + 1, seen)
        return `${key}: ${formattedValue}`
      })
      .join(', ')
    return `{ ${items} }`
  }

  // Handle primitive values
  if (typeof obj === 'string') return `"${obj}"`
  return String(obj)
}

/**
 * Computed formatted root node for display
 * @type {import('vue').ComputedRef<string>}
 */
const _formattedRootNode = computed(() => {
  return formatObjectWithIndent(stateMachine.value)
})

/**
 * Formats data for display in the tree
 * @param {*} data - The data to format
 * @returns {string} The formatted data string
 */
const formatData = (data) => {
  if (data === null || data === undefined) return ''

  try {
    if (typeof data === 'object' && data !== null) {
      const keys = Object.keys(data)
      if (keys.length > 0) {
        // Show up to 3 key-value pairs
        const previewKeys = keys.slice(0, 3)
        const preview = previewKeys
          .map((k) => {
            const val = data[k]
            const valStr
              = typeof val === 'object'
                ? '{...}'
                : typeof val === 'string'
                  ? `"${val.substring(0, 15)}${val.length > 15 ? '...' : ''}"`
                  : String(val)
            return `${k}: ${valStr}`
          })
          .join(', ')
        return `{${preview}${keys.length > 3 ? ', ...' : ''}}`
      }
      return '{}'
    }
    else if (Array.isArray(data)) {
      return `[${data.length > 0 ? '...' + data.length + ' items...' : ''}]`
    }
    else {
      return `(${String(data)})`
    }
  }
  catch {
    return '(data)'
  }
}

/**
 * Handles node click events for navigation
 * @param {string} path - The path of the clicked node
 */
const handleNodeClick = (path) => {
  console.log('Node clicked with path:', path)
  if (api.steps) {
    api.goToStep(path)
    // Scroll will happen via the watcher
  }
  else {
    console.warn('Stepper not available for path reset')
  }
}

/**
 * Handles page reload
 */
const _handleReload = () => {
  window.location.reload()
}

/**
 * Reference to the tree container for scrolling
 * @type {import('vue').Ref<HTMLElement|null>}
 */
const treeContainer = ref(null)

/**
 * Scrolls to the currently selected node
 */
const scrollToSelectedNode = () => {
  if (!api.path) return

  setTimeout(() => {
    // Use the component's scope to find the selected node
    if (!treeContainer.value) return

    const selectedNode = treeContainer.value.querySelector('.node-selected')
    if (!selectedNode) return

    try {
      // Get the container's scroll position and dimensions
      const container = treeContainer.value
      const containerRect = container.getBoundingClientRect()
      const nodeRect = selectedNode.getBoundingClientRect()

      // Calculate the relative position of the node within the container
      const relativeTop = nodeRect.top - containerRect.top
      const _relativeBottom = nodeRect.bottom - containerRect.top

      // Calculate the center position we want
      const targetPosition = relativeTop - containerRect.height / 2 + nodeRect.height / 2

      // Smoothly scroll to the target position
      container.scrollTop += targetPosition
    }
    catch (e) {
      console.error('Error scrolling to selected node:', e)
    }
  }, 100)
}

/**
 * Watcher for path changes to trigger scroll to selected node
 */
watch(
  () => api.path,
  (newPath) => {
    if (newPath) {
      scrollToSelectedNode()
    }
  },
)
</script>

<template>
  <!-- Main step explorer container -->
  <div
    v-if="api.steps"
    class="tree-viewer-container"
  >
    <!-- Navigation controls section -->
    <div :class="{ disabled: api.nSteps === 0 }">
      <div class="path-display-container">
        <!-- Current path display -->
        <div class="path-info">
          <div class="path-display sd-mono">
            {{ api.pathString }}
          </div>
        </div>

        <!-- Navigation buttons -->
        <TooltipProvider>
          <ButtonGroup
            variant="toolbar"
            size="menu"
          >
            <Tooltip>
              <TooltipTrigger as-child>
                <ButtonGroupItem
                  :disabled="!api.hasSteps()"
                  @click="api.goPrevStep()"
                >
                  <ChevronLeft />
                </ButtonGroupItem>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Previous Step
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger as-child>
                <ButtonGroupItem
                  :disabled="!api.hasSteps()"
                  @click="api.goNextStep()"
                >
                  <ChevronRight />
                </ButtonGroupItem>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Next Step
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger as-child>
                <ButtonGroupItem
                  :disabled="!api.hasSteps()"
                  @click="api.goFirstStep()"
                >
                  <Home />
                </ButtonGroupItem>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                First Step
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger as-child>
                <ButtonGroupItem
                  :disabled="!api.hasSteps()"
                  @click="api.clear()"
                >
                  <Trash2 />
                </ButtonGroupItem>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Clear Steps
              </TooltipContent>
            </Tooltip>
          </ButtonGroup>
        </TooltipProvider>
      </div>
    </div>

    <!-- Tree structure display -->
    <div
      ref="treeContainer"
      class="tree-container"
    >
      <div v-if="api.nSteps > 0">
        <!-- Step index display -->
        <div class="index-display">
          <Tooltip>
            <TooltipTrigger>{{ api.stepIndex }}/{{ api.nSteps }}</TooltipTrigger>
            <TooltipContent side="bottom">
              Step index
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              class="ml-1"
              style="color: var(--sd-step-label)"
            >
              ({{ api.blockIndex }}/{{ api.blockLength }})
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Index within block
            </TooltipContent>
          </Tooltip>
        </div>

        <!-- Tree structure -->
        <ul class="tree-root">
          <li
            v-if="stateMachine"
            class="tree-node root-node"
          >
            <ul
              v-if="stateMachine.rows && stateMachine.rows.length > 0"
              class="children"
            >
              <StepNode
                v-for="(state, index) in stateMachine.rows"
                :key="index"
                :state="state"
                :index="index"
                :total="stateMachine.rows.length"
                :is-node-selected="isNodeSelected"
                :format-data="formatData"
                :depth="1"
                :max-depth="5"
                :vertical-lines="[]"
                @node-click="handleNodeClick"
              />
            </ul>
          </li>
        </ul>
      </div>
      <!-- Empty state when no steps defined -->
      <div
        v-else
        class="tree-viewer-container-empty disabled"
      >
        No steps defined
      </div>
    </div>

    <!-- Global persisted variables section -->
    <div
      class="data-container-global"
      :class="{ disabled: Object.keys(api.persist).length === 0 }"
    >
      <div class="sd-section">
        <span>Persisted <code class="sd-mono">.persist</code></span>
        <Button
          variant="toolbar"
          size="menu"
          title="Clear persisted variables"
          @click="api.clearPersist()"
        >
          <Trash2 />
        </Button>
      </div>
      <div class="global-data-display">
        <StepDataViewer
          v-if="Object.keys(api.persist).length !== 0"
          :data="api.persist"
        />
        <div
          v-else
          class="sd-help"
        >
          No variables persisted
        </div>
      </div>
    </div>

    <!-- Step data section -->
    <div
      class="data-container"
      :class="{ disabled: api.nSteps === 0 }"
    >
      <div class="sd-section">
        <span>Step data <code class="sd-mono">.stepData</code></span>
      </div>
      <div class="data-display">
        <!--
        <button
          @click="api.clearCurrentStepData()"
          class="button is-small nav-button-small has-tooltip-arrow has-tooltip-bottom"
          data-tooltip="Delete Nodes"
        >
          <span><Trash2 /></span>
        </button>
        -->
        <StepDataViewer
          v-if="api.nSteps !== 0"
          :data="api.stepData"
        />
        <div
          v-else
          class="sd-help"
        >
          No data on this step
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tree-viewer-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0; /* Important for nested flex containers */
  overflow: hidden;
  background-color: var(--sd-bg);
}

.tree-viewer-container-empty {
  padding: 8px 12px;
  font-size: var(--sd-font-sm);
  color: var(--sd-text-muted);
}

.path-display-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 4px 0 12px;
  flex-shrink: 0;
}

.path-info {
  display: flex;
  align-items: center;
  min-width: 0;
}

.path-display {
  color: var(--sd-step-path);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.index-display {
  position: absolute;
  top: 6px;
  right: 8px;
  z-index: 50;
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: var(--sd-font-xs);
  color: var(--sd-step-index);
}

.tree-container {
  flex: 0 1 auto; /* don't grow, can shrink, auto basis */
  overflow: auto;
  border-top: 1px solid var(--sd-line);
  position: relative;
  scroll-behavior: smooth;
  max-height: 300px;
  min-height: 50px;
  background-color: var(--sd-bg);
}

.data-container-global {
  flex: 0 0 auto; /* don't grow, don't shrink, auto basis */
  overflow: visible;
  display: flex;
  flex-direction: column;
  min-height: 120px;
  background-color: var(--sd-bg);
  text-align: left;
}

.data-container {
  flex: 0 0 auto; /* don't grow, don't shrink, auto basis */
  overflow: visible;
  display: flex;
  flex-direction: column;
  background-color: var(--sd-bg);
  text-align: left;
}

.data-container.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.data-container-global.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.tree-root {
  list-style-type: none;
  padding-left: 0;
  margin: 0;
}

.tree-node {
  margin: 3px 0;
  position: relative;
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: var(--sd-font-xs);
}

/* First tree node has no padding */
.tree-root > li.tree-node {
  padding-left: 0;
}

.global-data-display {
  flex: 1;
  overflow: auto;
  padding: 8px 12px;
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: var(--sd-font-xs);
}

.data-display {
  flex: 1;
  overflow: auto;
  padding: 8px 12px;
  min-height: 180px;
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: var(--sd-font-xs);
}
</style>
