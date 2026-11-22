<script setup>
import { computed } from 'vue'
import { CloudAlert, CloudOff, CloudUpload, Database, UserMinus, UserCheck } from 'lucide-vue-next'
import useAPI from '../../../composables/useAPI'
import { syncDisplay } from '../../../core/sync/display'

const api = useAPI()

const sync = computed(() => syncDisplay({
  loaded: api.store.browserEphemeral.dataLoaded,
  sync: api.syncStatus,
  unsaved: api.store.browserEphemeral.unsavedChanges,
  otherTab: api.store.browserEphemeral.otherTab,
}))

const SAVE_ICONS = { offline: CloudOff, retrying: CloudOff, stopped: CloudAlert, paused: CloudAlert }
// Short labels: the stage has room for two or three words
const SAVE_LABELS = {
  none: 'Never saved', saved: 'Saved', pending: 'Unsaved changes', saving: 'Saving',
  offline: 'Offline', retrying: 'Save failed, retrying', stopped: 'Not saving', paused: 'Paused (other tab)',
}

/**
 * The participant's data, in three stages: known user -> record created ->
 * saved. Each stage is 'ok', 'warn' (a change waiting or on its way),
 * 'error' (the data isn't reaching the server) or 'off'.
 */
const stages = computed(() => {
  const known = api.store.cookieState.knownUser
  const loaded = api.store.browserEphemeral.dataLoaded
  const { state, label, detail, active, problem } = sync.value
  const saveState = problem ? 'error' : state === 'none' ? 'off' : active ? 'warn' : 'ok'
  return [
    { key: 'user', icon: known ? UserCheck : UserMinus, state: known ? 'ok' : 'off', label: known ? 'Known user' : 'Unknown user' },
    { key: 'record', icon: Database, state: loaded ? 'ok' : 'off', label: loaded ? 'Record created' : 'No record yet', action: () => api.connectDB(), title: 'Connect to the database' },
    { key: 'save', icon: SAVE_ICONS[state] ?? CloudUpload, state: saveState, label: SAVE_LABELS[state], title: detail ? `${label} (${detail})` : label },
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
        :title="stage.title"
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
     record) reads plainly different from a connected one. Unsaved: amber.
     Not reaching the server: red. */
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
.sd-progress-stage[data-state='error'] {
  --sd-stage: var(--sd-error);
  --sd-stage-bg: color-mix(in oklab, var(--sd-error) 15%, transparent);
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
.sd-progress-line[data-state='error'] {
  background-color: var(--sd-error);
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
