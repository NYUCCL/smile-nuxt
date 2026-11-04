<script setup>
/**
 * One setting on the build & deploy settings page: what it does, its value on
 * this machine and on deploys, where each comes from, and where to change it.
 */
import { computed } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import useAPI from '../../../composables/useAPI'
import { normalizeColorMode } from '../../../core/config'

const props = defineProps({
  setting: { type: Object, required: true },
})

const api = useAPI()
const s = computed(() => props.setting)

const SOURCE_LABEL = {
  'environment': 'shell environment',
  '.env.git.local': 'generated',
}

function display(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') {
    if (!value.set) return null
    return value.kind === 'bcrypt' ? 'set (bcrypt hash)' : 'set (plaintext)'
  }
  return value === '' ? '(empty)' : value
}

const localShown = computed(() => display(s.value.value))
const deployShown = computed(() => display(s.value.deployValue))
/** "not set (default: …)", or just "not set" when the default is nothing */
const unsetText = computed(() => (/^not set\b/.test(s.value.default) ? s.value.default : `not set (default: ${s.value.default})`))
/** The default, cut to its value: "exclude (or smile.devTools…)" → "exclude" */
const shortDefault = computed(() => (/^not set\b/.test(s.value.default) ? null : s.value.default.split(/ \(|, /)[0]))
const sourceLabel = computed(() => SOURCE_LABEL[s.value.source] || s.value.source)

/** Deploys differ from this machine? (only worth saying when they do) */
const deployDiffers = computed(() => {
  if (s.value.generated) return false
  return JSON.stringify(s.value.value) !== JSON.stringify(s.value.deployValue)
})

/**
 * The value the running app has (api.config), when it disagrees with the
 * files: the design changed it (api.setRuntimeConfig), the dev tools did, or
 * the dev server hasn't restarted since the file changed.
 */
const liveMismatch = computed(() => {
  const path = s.value.configPath
  if (!path || s.value.value === null || typeof s.value.value === 'object') return null
  const live = api.config?.[path]
  if (live === undefined) return null
  const v = String(s.value.value).trim()
  if (s.value.type === 'size') {
    const [w, h] = v.split('x').map(n => Number.parseInt(n))
    return live?.width === w && live?.height === h ? null : `${live?.width}x${live?.height}`
  }
  let expected = v
  if (s.value.type === 'bool') {
    expected = s.value.key === 'VITE_AUTO_SAVE_DATA' ? v !== 'false' : v === 'true'
  }
  else if (s.value.type === 'int') {
    expected = Number(v)
  }
  else if (s.value.key === 'VITE_COLOR_MODE') {
    expected = normalizeColorMode(v)
  }
  return live === expected ? null : String(live)
})
</script>

<template>
  <details
    :id="`sd-setting-${s.key}`"
    class="bc-setting"
    :data-testid="`setting-${s.key}`"
  >
    <summary class="bc-setting-head">
      <ChevronRight class="bc-chevron" />
      <span class="sd-mono bc-name">{{ s.key }}</span>
      <span
        class="bc-now"
        data-testid="value"
      >
        <template v-if="localShown !== null">
          <span class="sd-mono bc-value">{{ localShown }}</span>
          <span class="bc-from">{{ sourceLabel }}</span>
        </template>
        <template v-else-if="shortDefault">
          <span class="sd-mono bc-value is-default">{{ shortDefault }}</span>
          <span class="bc-from">default</span>
        </template>
        <span
          v-else
          class="bc-from"
        >not set</span>
      </span>
      <span
        v-if="s.localOnly"
        class="bc-tag is-warn"
        title="Set only in an untracked file or the shell: deploys don't see it"
      >this machine only</span>
      <span
        v-else-if="deployDiffers"
        class="bc-tag"
        title="Deploys get a different value"
      >differs on deploy</span>
      <span
        v-if="liveMismatch !== null"
        class="bc-tag is-warn"
        title="The running app has a different value"
      >changed at runtime</span>
    </summary>

    <div class="bc-detail">
      <p class="sd-help">
        {{ s.description }}
      </p>

      <dl class="bc-values">
        <template v-if="deployDiffers">
          <dt>Deploys</dt>
          <dd>
            <template v-if="deployShown !== null">
              <span class="sd-mono bc-value">{{ deployShown }}</span>
              <span class="bc-from">from {{ s.deploySource }}</span>
            </template>
            <span
              v-else
              class="bc-from"
            >not in the tracked files, so {{ unsetText }}, unless Vercel sets it</span>
          </dd>
        </template>

        <template v-if="s.alsoIn.length">
          <dt>Also in</dt>
          <dd>
            <span
              v-for="a in s.alsoIn"
              :key="a.file"
              class="bc-also"
            >
              <span class="sd-mono">{{ a.file }}</span>: <span class="sd-mono">{{ display(a.value) ?? '(empty)' }}</span>
            </span>
          </dd>
        </template>

        <template v-if="liveMismatch !== null">
          <dt>Running app</dt>
          <dd class="bc-warn">
            <span class="sd-mono">{{ liveMismatch }}</span>
            <span class="bc-from">set by api.setRuntimeConfig or the dev tools, or the server needs a restart</span>
          </dd>
        </template>

        <dt>Default</dt>
        <dd class="bc-from">
          {{ s.default }}
        </dd>

        <dt>Read</dt>
        <dd class="bc-from">
          {{ s.phase === 'build' ? 'at build time' : 'by the server, per request' }}{{ s.secret ? ' · secret' : '' }}{{ s.unused ? ' · not used by SMILE' : '' }}
        </dd>

        <dt>Change it</dt>
        <dd class="sd-help">
          {{ s.howToChange }}
        </dd>
      </dl>
    </div>
  </details>
</template>

<style scoped>
.bc-setting {
  border-top: 1px solid var(--sd-line);
  transition: background-color 0.6s;
}

.bc-setting.sd-flash {
  background: var(--sd-selected);
  transition: none;
}

.bc-setting-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  cursor: pointer;
  list-style: none;
}
.bc-setting-head::-webkit-details-marker {
  display: none;
}
.bc-setting-head:hover {
  background: var(--sd-hover);
}

.bc-chevron {
  flex: none;
  width: 12px;
  height: 12px;
  color: var(--sd-text-muted);
  transition: transform 0.15s;
}
.bc-setting[open] .bc-chevron {
  transform: rotate(90deg);
}

.bc-name {
  flex: 0 0 250px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--sd-font-sm);
  font-weight: 600;
  color: var(--sd-key);
}

.bc-now {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bc-tag {
  flex: none;
  font-size: 10px;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--sd-panel-2);
  color: var(--sd-text-muted);
}

.bc-tag.is-warn {
  background: var(--sd-warn-bg);
  color: var(--sd-warn);
}

.bc-detail {
  padding: 2px 12px 10px 32px;
}

.bc-values {
  display: grid;
  grid-template-columns: 84px 1fr;
  gap: 2px 8px;
  margin-top: 6px;
  font-size: var(--sd-font-sm);
}

.bc-values dt {
  font-size: var(--sd-font-xs);
  color: var(--sd-text-muted);
  padding-top: 1px;
}

.bc-values dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.bc-value {
  color: var(--sd-value);
  margin-right: 6px;
}

.bc-value.is-default {
  color: var(--sd-text-muted);
}

.bc-from {
  font-size: var(--sd-font-xs);
  color: var(--sd-text-muted);
}

.bc-also {
  margin-right: 10px;
}

.bc-warn .sd-mono {
  color: var(--sd-warn);
  margin-right: 6px;
}

@media (max-width: 700px) {
  .bc-name {
    flex-basis: 50%;
  }
}
</style>
