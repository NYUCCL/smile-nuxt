<script setup>
import useAPI from '../../../composables/useAPI'

const api = useAPI()
</script>

<template>
  <TooltipProvider>
    <ButtonGroup
      variant="outline"
      size="menu"
    >
      <!-- Console toggle -->
      <Tooltip>
        <TooltipTrigger as-child>
          <ButtonGroupItem @click="api.store.dev.showConsoleBar = !api.store.dev.showConsoleBar">
            <!-- Console icon (rectangle with bottom panel line) -->
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.3"
              stroke-linecap="round"
              stroke-linejoin="round"
              :opacity="api.store.dev.showConsoleBar ? 1 : 0.4"
            >
              <rect
                width="18"
                height="18"
                x="3"
                y="3"
                rx="2"
              />
              <path d="M3 15h18" />
            </svg>
          </ButtonGroupItem>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {{ api.store.dev.showConsoleBar ? 'Hide Console' : 'Show Console' }} (Ctrl + `)
        </TooltipContent>
      </Tooltip>

      <!-- Sidebar toggle -->
      <Tooltip>
        <TooltipTrigger as-child>
          <ButtonGroupItem @click="api.store.dev.showSideBar = !api.store.dev.showSideBar">
            <!-- Sidebar icon -->
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.3"
              stroke-linecap="round"
              stroke-linejoin="round"
              :opacity="api.store.dev.showSideBar ? 1 : 0.4"
            >
              <rect
                width="18"
                height="18"
                x="3"
                y="3"
                rx="2"
              />
              <path d="M15 3v18" />
            </svg>
          </ButtonGroupItem>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {{ api.store.dev.showSideBar ? 'Hide Sidebar' : 'Show Sidebar' }} (Ctrl + 1)
        </TooltipContent>
      </Tooltip>
    </ButtonGroup>
  </TooltipProvider>
</template>
