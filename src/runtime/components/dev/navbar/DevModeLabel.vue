<script setup>
import useAPI from '../../../composables/useAPI'

/**
 * The left end of a dev tools top bar: the mode's icon and name, the smile
 * version, and a striped "local" tag on the local dev server (pnpm dev), so a
 * local server is easy to tell from a deployed one. Shared by developer and
 * presentation mode so their bars match.
 */
defineProps({
  icon: { type: [Object, Function], required: true },
  label: { type: String, required: true },
  short: { type: String, required: true },
})

const api = useAPI()
const isLocal = import.meta.dev
</script>

<template>
  <div class="flex items-center gap-2 flex-shrink-0 text-xs">
    <component
      :is="icon"
      class="size-3.5"
    />
    <span class="font-semibold"><span class="hidden sm:inline">{{ label }}</span><span class="sm:hidden">{{ short }}</span></span>
    <span class="text-sd-text-muted tabular-nums">{{ api.config.smileVersion }}</span>
    <span
      v-if="isLocal"
      class="sd-local-chip"
      title="Running on the local dev server (pnpm dev), not a deployed build"
    >local</span>
  </div>
</template>

<style scoped>
.sd-local-chip {
  padding: 0 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--sd-local-fg);
  background: repeating-linear-gradient(-45deg, var(--sd-local-1) 0 5px, var(--sd-local-2) 5px 10px);
  box-shadow: inset 0 0 0 1px var(--sd-local-edge);
}
</style>
