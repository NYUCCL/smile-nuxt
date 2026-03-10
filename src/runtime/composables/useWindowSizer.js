import { computed, onMounted, onUnmounted, ref } from 'vue'
import useAPI from './useAPI'

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
    return useDeviceContainer ? api.store.dev.deviceHeight : windowHeight.value
  })

  const showAggressiveOverlay = computed(() => {
    const val = api.isBrowserTooSmall(effectiveWidth.value, effectiveHeight.value)
    api.store.browserEphemeral.tooSmall = val
    return val
  })

  return { showAggressiveOverlay }
}
