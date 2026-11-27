<script setup>
/**
 * Shown in place of a view while the files it lists under `preload`
 * (design.js) are loading (#30). Usually never seen: the files load in the
 * background from the moment the page opens, and a view whose files are in
 * memory shows at once.
 *
 * Nothing is drawn for the first moment, so a short wait doesn't flash a
 * loading screen. When files could not be loaded the view stays closed: the
 * load is tried again every few seconds, when the browser comes back online,
 * and from the button.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import usePreload from '../../composables/usePreload'

const props = defineProps({
  // The page's gate (composables/useViewGate.js)
  gate: { type: Object, required: true },
  // How long to wait before drawing anything, in ms
  delay: { type: Number, default: 300 },
  // How often a failed load is tried again, in ms
  retryEvery: { type: Number, default: 5000 },
})

const { preloader } = usePreload()

const visible = ref(false)
let showTimer = null
let retryTimer = null

const progress = computed(() => preloader.progress(props.gate.urls))
const percent = computed(() => Math.round(progress.value.fraction * 100))
const failed = computed(() => props.gate.status === 'failed')
// File names and reasons are for the researcher, on the local dev server
const showDetails = import.meta.dev

function retry() {
  props.gate.retry()
}

function stopRetrying() {
  clearInterval(retryTimer)
  retryTimer = null
  window.removeEventListener('online', retry)
}

watch(failed, (isFailed) => {
  stopRetrying()
  if (!isFailed) return
  visible.value = true
  retryTimer = setInterval(retry, props.retryEvery)
  window.addEventListener('online', retry)
}, { immediate: true })

onMounted(() => {
  showTimer = setTimeout(() => {
    visible.value = true
  }, props.delay)
})
onBeforeUnmount(() => {
  clearTimeout(showTimer)
  stopRetrying()
})
</script>

<template>
  <div
    v-if="visible"
    class="w-full h-full flex items-center justify-center p-6"
    data-testid="preloading"
    :data-status="gate.status"
    role="status"
    aria-live="polite"
  >
    <div class="w-full max-w-sm text-center">
      <template v-if="failed">
        <p class="text-lg font-semibold text-foreground">
          Some files could not be loaded
        </p>
        <p class="mt-2 text-sm text-muted-foreground">
          Please check your internet connection. This page keeps trying and
          continues by itself once the files have loaded.
        </p>
        <Button
          class="mt-4"
          variant="outline"
          data-testid="preloading-retry"
          @click="retry"
        >
          Try again now
        </Button>
        <ul
          v-if="showDetails"
          class="mt-4 text-left text-xs font-mono text-muted-foreground break-all"
          data-testid="preloading-failed"
        >
          <li
            v-for="item in gate.failed"
            :key="item.url"
          >
            {{ item.url }}: {{ item.error }}
          </li>
        </ul>
      </template>
      <template v-else>
        <p class="text-lg font-semibold text-foreground">
          Loading
        </p>
        <Progress
          class="mt-4"
          :model-value="percent"
        />
        <p
          class="mt-2 text-sm text-muted-foreground tabular-nums"
          data-testid="preloading-count"
        >
          {{ progress.ready }} of {{ progress.total }} files
        </p>
      </template>
    </div>
  </div>
</template>
