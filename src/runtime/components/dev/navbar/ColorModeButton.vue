<script setup>
import { Moon, Sun, SunMoon } from 'lucide-vue-next'
// UI components

// Color mode composable

/**
 * Provides color mode state and toggle function for the experiment
 * @type {{ mode: string, toggle: Function, system: string }}
 */
const { mode: experimentColorMode, toggle: toggleColorMode, system } = useSmileColorMode('experiment')
</script>

<template>
  <!-- Color mode toggle button with tooltip -->
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          size="menu"
          variant="outline"
          @click="toggleColorMode()"
        >
          <Moon v-if="experimentColorMode === 'light'" />
          <SunMoon v-else-if="experimentColorMode === 'dark'" />
          <Sun v-else />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p v-if="experimentColorMode === 'light'">
          Switch to Dark Mode
        </p>
        <p v-else-if="experimentColorMode === 'dark'">
          Switch to System ({{ system }})
        </p>
        <p v-else>
          Switch to Light Mode
        </p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
