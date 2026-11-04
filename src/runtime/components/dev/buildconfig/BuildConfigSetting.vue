<script setup>
/**
 * One setting on the build & deploy settings page: what it does, its value on
 * this machine and on deploys, where each comes from, and where to change it.
 */
import { computed } from 'vue'
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
  <div
    :id="`sd-setting-${s.key}`"
    class="bc-setting"
    :data-testid="`setting-${s.key}`"
  >
    <div class="bc-setting-head">
      <span class="sd-mono bc-name">{{ s.key }}</span>
      <span
        class="bc-tag"
        :title="s.phase === 'build' ? 'Read when the project is built' : 'Read by the server on each request'"
      >{{ s.phase === 'build' ? 'build time' : 'runtime' }}</span>
      <span
        v-if="s.secret"
        class="bc-tag"
      >secret</span>
      <span
        v-if="s.unused"
        class="bc-tag"
        title="Read into api.config, but nothing in SMILE acts on it"
      >not used by SMILE</span>
      <span
        v-if="s.localOnly"
        class="bc-tag is-warn"
        title="Set only in an untracked file or the shell: deploys don't see it"
      >this machine only</span>
    </div>

    <p class="sd-help">
      {{ s.description }}
    </p>

    <dl class="bc-values">
      <dt>Here</dt>
      <dd data-testid="value">
        <template v-if="localShown !== null">
          <span class="sd-mono bc-value">{{ localShown }}</span>
          <span class="bc-from">from {{ sourceLabel }}</span>
        </template>
        <span
          v-else
          class="bc-from"
        >{{ unsetText }}</span>
      </dd>

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
          <span class="bc-from">changed at runtime (api.setRuntimeConfig in design.js, or the dev tools), or the dev
            server hasn't restarted since the file changed</span>
        </dd>
      </template>

      <dt>Change it</dt>
      <dd class="sd-help">
        {{ s.howToChange }}
      </dd>
    </dl>
  </div>
</template>

<style scoped>
.bc-setting {
  padding: 8px 12px 10px 24px;
  border-top: 1px solid var(--sd-line);
  transition: background-color 0.6s;
}

.bc-setting.sd-flash {
  background: var(--sd-selected);
  transition: none;
}

.bc-setting-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.bc-name {
  font-size: var(--sd-font-sm);
  font-weight: 600;
  color: var(--sd-key);
}

.bc-tag {
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
</style>
