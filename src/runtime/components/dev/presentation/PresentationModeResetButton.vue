<script setup>
import { Home } from 'lucide-vue-next'
import { navigateTo } from '#imports'

const _props = defineProps(['icon'])

function goHome() {
  navigateTo('/presentation/')
}
</script>

<template>
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          size="menu"
          variant="outline"
          @click="goHome"
        >
          <Home />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Return to presentation home</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
