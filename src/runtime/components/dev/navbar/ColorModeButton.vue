<script setup>
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
      <TooltipTrigger asChild>
        <Button size="menu" variant="outline" @click="toggleColorMode()">
          <i-lucide-moon v-if="experimentColorMode === 'light'" />
          <i-lucide-sun-moon v-else-if="experimentColorMode === 'dark'" />
          <i-lucide-sun v-else />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p v-if="experimentColorMode === 'light'">Switch to Dark Mode</p>
        <p v-else-if="experimentColorMode === 'dark'">Switch to System ({{ system }})</p>
        <p v-else>Switch to Light Mode</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
