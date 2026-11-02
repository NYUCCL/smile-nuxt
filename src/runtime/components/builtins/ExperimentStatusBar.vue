<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from '#imports'
import useAPI from '../../composables/useAPI'
import { statusBarHeight } from '../../composables/useWindowSizer'

const api = useAPI()
const route = useRoute()

const showStatusBar = computed(() => {
  const routeName = api.currentRouteName()
  return routeName !== 'recruit' && routeName !== 'presentation_home' && !(route.path.startsWith('/presentation/') || route.path === '/presentation')
})

// Report the bar's rendered height (0 when hidden) so the window sizer can
// leave room for it instead of assuming a fixed size (#33). Measured here
// rather than in StatusBar so a project's own StatusBar override counts too.
const barEl = ref(null)
let observer = null
function setHeight(px) {
  statusBarHeight.value = Math.ceil(px)
}
watch(barEl, (el) => {
  observer?.disconnect()
  observer = null
  if (!el) {
    setHeight(0)
    return
  }
  setHeight(el.getBoundingClientRect().height)
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => setHeight(el.getBoundingClientRect().height))
    observer.observe(el)
  }
}, { flush: 'post' })
onBeforeUnmount(() => {
  observer?.disconnect()
  setHeight(0)
})
</script>

<template>
  <div
    v-if="showStatusBar"
    ref="barEl"
  >
    <StatusBar />
  </div>
</template>
