<script setup>
import { computed } from 'vue'
import useAPI from '../../../composables/useAPI'

const api = useAPI()

/** Rows: study code name, code version (plus the mode on the dev server), short user id */
const rows = computed(() => {
  const out = [
    ['Study', api.store.config.codeName],
    ['Version', api.store.config.github.lastCommitHash + (import.meta.dev ? `-${api.store.config.mode}` : '')],
  ]
  if (api.store.getShortId != 'N/A') out.push(['User', api.store.getShortId])
  return out
})
</script>

<template>
  <!-- Study info: which study, which build, which participant -->
  <dl class="sd-study-info">
    <template
      v-for="[label, value] in rows"
      :key="label"
    >
      <dt class="sd-label">
        {{ label }}
      </dt>
      <dd class="sd-mono truncate">
        {{ value }}
      </dd>
    </template>
  </dl>
</template>

<style scoped>
.sd-study-info {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: baseline;
  gap: 2px 10px;
  padding: 8px 12px;
  border-top: 1px solid var(--sd-line);
}
</style>
