<script setup>
import { Home } from 'lucide-vue-next'
import { navigateTo, useRoute } from '#imports'
import useAPI from '../../../composables/useAPI'

const _props = defineProps(['icon'])

function goHome() {
  const route = useRoute()
  // If we're in the dev layout (inline presentation), switch back to devmode
  if (route.path.startsWith('/dev')) {
    const api = useAPI()
    api.store.dev.mainView = 'devmode'
  } else {
    navigateTo('/presentation/')
  }
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
