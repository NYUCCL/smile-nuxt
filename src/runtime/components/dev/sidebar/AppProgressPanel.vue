<script setup>
import { computed } from 'vue'
import { CloudUpload, Database, UserMinus, UserCheck } from 'lucide-vue-next'
import useAPI from '../../../composables/useAPI'

const api = useAPI()

/**
 * The participant's data, in three stages: known user -> record created ->
 * saved. Each stage is 'ok', 'warn' (unsaved changes) or 'off'.
 */
const stages = computed(() => {
  const known = api.store.cookieState.knownUser
  const loaded = api.store.browserEphemeral.dataLoaded
  const unsaved = api.store.browserEphemeral.unsavedChanges
  return [
    { key: 'user', icon: known ? UserCheck : UserMinus, state: known ? 'ok' : 'off', label: known ? 'Known user' : 'Unknown user' },
    { key: 'record', icon: Database, state: loaded ? 'ok' : 'off', label: loaded ? 'Record created' : 'No record yet', action: () => api.connectDB() },
    { key: 'save', icon: CloudUpload, state: !loaded ? 'off' : unsaved ? 'warn' : 'ok', label: !loaded ? 'Never saved' : unsaved ? 'Unsaved changes' : 'Saved' },
  ]
})
</script>

<template>
  <!-- Data progress: known user -> record created -> saved -->
  <ol class="sd-progress">
    <li
      v-for="(stage, i) in stages"
      :key="stage.key"
      class="sd-progress-stage"
      :data-state="stage.state"
    >
      <span
        v-if="i > 0"
        class="sd-progress-line"
        :data-state="stage.state"
      />
      <component
        :is="stage.action ? 'button' : 'span'"
        class="sd-progress-dot"
        :title="stage.action ? 'Connect to the database' : undefined"
        @click="stage.action?.()"
      >
        <component :is="stage.icon" />
      </component>
      <span class="sd-progress-label">{{ stage.label }}</span>
    </li>
  </ol>
</template>

<style scoped>
.sd-progress {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 10px 8px 8px;
  border-top: 1px solid var(--sd-line);
}

.sd-progress-stage {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  /* Not reached: a dashed muted outline. Reached: --sd-done (sky; the
     accent in the other palettes), so a fresh visit (unknown user, no
     record) reads plainly different from a connected one. Unsaved: amber. */
  --sd-stage: var(--sd-text-muted);
  --sd-stage-bg: transparent;
  --sd-stage-ring: var(--sd-line);
}
.sd-progress-stage[data-state='ok'] {
  --sd-stage: var(--sd-done);
  --sd-stage-bg: var(--sd-done-bg);
  --sd-stage-ring: transparent;
}
.sd-progress-stage[data-state='warn'] {
  --sd-stage: var(--sd-warn);
  --sd-stage-bg: var(--sd-warn-bg);
  --sd-stage-ring: transparent;
}

/* The connector from the previous stage, at the dots' middle */
.sd-progress-line {
  position: absolute;
  top: 13px;
  right: calc(50% + 18px);
  width: calc(100% - 36px);
  height: 1px;
  background-color: var(--sd-line);
}
.sd-progress-line[data-state='ok'] {
  background-color: var(--sd-done);
}
.sd-progress-line[data-state='warn'] {
  background-color: var(--sd-warn);
}

.sd-progress-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--sd-radius);
  color: var(--sd-stage);
  background-color: var(--sd-stage-bg);
  box-shadow: inset 0 0 0 1px var(--sd-stage-ring);
}
.sd-progress-stage[data-state='off'] .sd-progress-dot {
  box-shadow: none;
  border: 1px dashed var(--sd-text-muted);
}
.sd-progress-dot svg {
  width: 14px;
  height: 14px;
}
button.sd-progress-dot:hover {
  background-color: var(--sd-hover);
}

.sd-progress-label {
  font-size: var(--sd-font-xs);
  color: var(--sd-stage);
  text-align: center;
}
</style>
