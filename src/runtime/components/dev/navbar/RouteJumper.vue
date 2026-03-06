<script setup>
// Vue composables
import { watch, ref, computed } from 'vue'

/**
 * API instance for accessing application state and methods
 */
const api = useAPI()

// Props
const props = defineProps(['routeName'])

// Logging store
const log = useLog()

const route = useRoute()

// Reactive current route name — recomputes when route changes
const activeRouteName = computed(() => api.currentRouteName())

/**
 * Hovered route name for UI highlighting
 */
const hoverRoute = ref('')

// Construct routes in order to display
const seqtimeline = api.store.localState.seqtimeline
const routes = api.store.localState.routes

// Filter routes - only those not in seqtimeline, and exclude redirect-only routes (e.g. landing)
const filteredRoutes = routes.filter((r) => {
  return !seqtimeline.find((s) => s.name === r.name) && !r.redirect
})

// Also exclude redirect-only routes from seqtimeline
const allRoutes = seqtimeline.filter((r) => !r.redirect).concat(filteredRoutes)

/**
 * Watches the route and updates the current query
 */
const currentQuery = ref(route.query)
watch(route, async (newRoute, oldRoute) => {
  currentQuery.value = newRoute.query
})

/**
 * Set the currently hovered route
 * @param {string} route - Route name
 */
function setHover(route) {
  hoverRoute.value = route
}

/**
 * Navigate to a given route
 * @param {string} route - Route name
 */
function navigate(route) {
  log.warn(`DEV MODE: user requested to FORCE navigate to ${route}`)
  api.goToView(route, true)
}

// Detect if we're in presentation mode based on current URL prefix
const isPresentation = computed(() => route.path.startsWith('/presentation/') || route.path === '/presentation')

function goHome() {
  if (isPresentation.value) {
    log.warn('PRESENTATION MODE: user requested to navigate to presentation home')
    navigateTo('/presentation/')
  } else {
    log.warn('DEV MODE: user requested to navigate to dev home')
    navigateTo('/dev/')
  }
}
</script>
<template>
  <!-- Dropdown menu listing all routes for navigation -->
  <DropdownMenuContent align="end">
    <DropdownMenuItem @click="goHome" class="cursor-pointer border-b border-border mb-1">
      <span class="text-[0.65rem] font-mono">
        <div class="routename font-medium">
          <i-lucide-house class="inline mr-1" />
          {{ isPresentation ? '/home' : '/recruit' }}
        </div>
      </span>
    </DropdownMenuItem>
    <DropdownMenuItem
      v-for="r in allRoutes"
      :key="r.name"
      @mouseover="hoverRoute = r.name"
      @mouseout="hoverRoute = ''"
      :class="{
        'bg-accent text-accent-foreground': activeRouteName === r.name,
        'bg-muted': hoverRoute === r.name,
      }"
      @click="navigate(r.name)"
      class="cursor-pointer"
    >
      <span class="text-[0.65rem] font-mono">
        <div class="routename font-medium">
          <span v-if="r.meta.level > 0" v-for="i in r.meta.level" style="margin-left: 5px">&nbsp;</span>
          <i-lucide-arrow-down v-if="r.meta.sequential" class="inline mr-1" />
          <i-lucide-presentation v-else-if="r.name === 'presentation_home'" class="inline mr-1" />
          <i-lucide-diamond v-else class="inline mr-1" />
          /{{ r.name }}
        </div>
      </span>
    </DropdownMenuItem>
  </DropdownMenuContent>
</template>
