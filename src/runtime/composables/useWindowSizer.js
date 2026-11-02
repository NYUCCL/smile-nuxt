import { computed, onMounted, onUnmounted, ref } from 'vue'
import useAPI from './useAPI'

/**
 * Rendered height of the status bar in px (0 when it isn't shown), set by
 * ExperimentStatusBar. The window sizer box sits below the bar, so only the
 * height under it is available (#33).
 */
export const statusBarHeight = ref(0)

/**
 * Monitors the viewport size and updates `browserEphemeral.tooSmall`.
 *
 * @param {{ useDeviceContainer?: boolean }} options
 *   - useDeviceContainer: when true, checks against the responsive device
 *     container dimensions (for the development layout). When false or
 *     omitted, checks against the browser window dimensions.
 * @returns {{ showAggressiveOverlay: import('vue').ComputedRef<boolean> }}
 */
export default function useWindowSizer({ useDeviceContainer = false } = {}) {
  const api = useAPI()

  const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 0)
  const windowHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 0)

  function updateWindowDimensions() {
    windowWidth.value = window.innerWidth
    windowHeight.value = window.innerHeight
  }

  onMounted(() => {
    updateWindowDimensions()
    window.addEventListener('resize', updateWindowDimensions)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', updateWindowDimensions)
  })

  const effectiveWidth = computed(() => {
    return useDeviceContainer ? api.store.dev.deviceWidth : windowWidth.value
  })

  const effectiveHeight = computed(() => {
    const total = useDeviceContainer ? api.store.dev.deviceHeight : windowHeight.value
    return total - statusBarHeight.value
  })

  const showAggressiveOverlay = computed(() => {
    const val = api.isBrowserTooSmall(effectiveWidth.value, effectiveHeight.value)
    api.store.browserEphemeral.tooSmall = val
    return val
  })

  return { showAggressiveOverlay }
}
