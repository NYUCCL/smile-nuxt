<script setup>
import { ArrowDown, Diamond, House, Presentation } from 'lucide-vue-next'
// Vue composables
import { watch, ref, computed } from 'vue'
import { useRoute, navigateTo } from '#imports'
import useLog from '../../../stores/log'
import useAPI from '../../../composables/useAPI'

/**
 * API instance for accessing application state and methods
 */
const api = useAPI()

// Props
const _props = defineProps(['routeName'])

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
  return !seqtimeline.find(s => s.name === r.name) && !r.redirect
})

// Also exclude redirect-only routes from seqtimeline
const allRoutes = seqtimeline.filter(r => !r.redirect).concat(filteredRoutes)

/**
 * Watches the route and updates the current query
 */
const currentQuery = ref(route.query)
watch(route, async (newRoute, _oldRoute) => {
  currentQuery.value = newRoute.query
})

/**
 * Set the currently hovered route
 * @param {string} route - Route name
 */
function _setHover(route) {
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
  }
  else {
    log.warn('DEV MODE: user requested to navigate to dev home')
    navigateTo('/dev/')
  }
}
</script>

<template>
  <!-- Dropdown menu listing all routes for navigation -->
  <DropdownMenuContent align="end">
    <DropdownMenuItem
      class="cursor-pointer border-b border-dev-lines mb-1"
      @click="goHome"
    >
      <span class="text-[0.65rem] font-mono">
        <div class="routename font-medium">
          <House class="inline mr-1" />
          {{ isPresentation ? '/home' : '/recruit' }}
        </div>
      </span>
    </DropdownMenuItem>
    <DropdownMenuItem
      v-for="r in allRoutes"
      :key="r.name"
      :class="{
        'bg-accent text-accent-foreground': activeRouteName === r.name,
        'bg-muted': hoverRoute === r.name,
      }"
      class="cursor-pointer"
      @mouseover="hoverRoute = r.name"
      @mouseout="hoverRoute = ''"
      @click="navigate(r.name)"
    >
      <span class="text-[0.65rem] font-mono">
        <div class="routename font-medium">
          <template v-if="r.meta.level > 0">
            <span
              v-for="j in r.meta.level"
              :key="j"
              style="margin-left: 5px"
            >&nbsp;</span>
          </template>
          <ArrowDown
            v-if="r.meta.sequential"
            class="inline mr-1"
          />
          <Presentation
            v-else-if="r.name === 'presentation_home'"
            class="inline mr-1"
          />
          <Diamond
            v-else
            class="inline mr-1"
          />
          /{{ r.name }}
        </div>
      </span>
    </DropdownMenuItem>
  </DropdownMenuContent>
</template>
