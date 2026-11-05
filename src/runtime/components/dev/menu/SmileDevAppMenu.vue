<script setup>
import { Moon, Settings, SquareChevronRight, Sun, SunMoon, UserRound } from 'lucide-vue-next'
import { useSmileColorMode } from '../../../composables/useColorMode'
import DevConfigPanel from './DevConfigPanel.vue'
import useAPI from '../../../composables/useAPI'
import { DEV_MODES as modes } from './devModes'
import { openCommandPalette } from '../palette/bus'

/**
 * The dev tools' app menu: a narrow rail on the left. The top holds the
 * modes (developer, presentation, and a link out to the participant view);
 * the bottom holds the dev tools' theme and settings. Every button is the same
 * size and look; the current mode is the selected tint.
 */
const props = defineProps({
  side: { type: String, required: false },
  variant: { type: String, required: false },
  collapsible: { type: String, required: false, default: 'icon' },
  class: { type: null, required: false },
})

const api = useAPI()

// The `:` command palette: dev server only, like the palette itself
const hasPalette = import.meta.dev

// Modes shown in the dev layout (store.dev.mainView): devModes.js, shared
// with the `:` command palette

function selectMode(view) {
  // Clicking the open mode again returns to developer mode
  api.store.dev.mainView = api.store.dev.mainView === view && view !== 'devmode' ? 'devmode' : view
}

/**
 * The dev tools' own theme (on the html element). Starts on the system setting;
 * the button cycles system -> light -> dark -> system, like the experiment's.
 */
const { mode: globalColorModeRaw, toggle: toggleGlobalColorMode, system } = useSmileColorMode('global')
</script>

<template>
  <Sidebar
    class="sd-root w-[calc(var(--sidebar-width-icon)+1px)]! border-r border-sd-line"
    v-bind="props"
  >
    <SidebarContent class="pt-2">
      <SidebarMenu class="sd-rail-group">
        <!-- The study as participants see it: leaves the dev tools (the local
             banner there links back) -->
        <SidebarMenuItem>
          <SidebarMenuButton
            as-child
            class="sd-rail-btn hover:!bg-sd-hover"
            tooltip="Participant view (leaves the dev tools)"
          >
            <a href="/"><UserRound /></a>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem
          v-for="mode in modes"
          :key="mode.view"
        >
          <SidebarMenuButton
            class="sd-rail-btn"
            :class="api.store.dev.mainView === mode.view
              ? 'bg-sd-selected text-sd-selected-fg hover:!bg-sd-selected-hover'
              : 'hover:!bg-sd-hover'"
            :tooltip="mode.label"
            :aria-label="mode.label"
            @click="selectMode(mode.view)"
          >
            <component :is="mode.icon" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarContent>

    <SidebarFooter class="sd-rail-group pb-2">
      <SidebarMenuButton
        v-if="hasPalette"
        class="sd-rail-btn hover:!bg-sd-hover"
        tooltip="Command palette (:)"
        aria-label="Command palette"
        data-testid="open-command-palette"
        @click="openCommandPalette"
      >
        <SquareChevronRight />
      </SidebarMenuButton>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <SidebarMenuButton
              class="sd-rail-btn hover:!bg-sd-hover"
              @click="toggleGlobalColorMode"
            >
              <Moon v-if="globalColorModeRaw === 'light'" />
              <SunMoon v-else-if="globalColorModeRaw === 'dark'" />
              <Sun v-else />
            </SidebarMenuButton>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p v-if="globalColorModeRaw === 'light'">
              Dev tools: light. Switch to dark
            </p>
            <p v-else-if="globalColorModeRaw === 'dark'">
              Dev tools: dark. Switch to system ({{ system }})
            </p>
            <p v-else>
              Dev tools: system ({{ system }}). Switch to light
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Popover>
        <PopoverTrigger as-child>
          <SidebarMenuButton
            class="sd-rail-btn hover:!bg-sd-hover"
            tooltip="Settings"
          >
            <Settings />
          </SidebarMenuButton>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="end"
          class="sd-root w-auto p-0 overflow-hidden bg-sd-bg border-sd-line"
        >
          <DevConfigPanel />
        </PopoverContent>
      </Popover>
    </SidebarFooter>
  </Sidebar>
</template>

<style scoped>
/* One column of 32px buttons, 4px apart, centered in the rail */
.sd-rail-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding-left: 0;
  padding-right: 0;
}

.sd-rail-group > :deep(li) {
  display: flex;
  justify-content: center;
}

.sd-rail-btn {
  width: 32px !important;
  height: 32px !important;
  padding: 0 !important;
  justify-content: center;
}

.sd-rail-btn :deep(svg) {
  width: 18px;
  height: 18px;
}
</style>
