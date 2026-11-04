<script setup>
/**
 * The dev tools' build & deploy settings page (rail mode 'config').
 *
 * Read-only. Shows what a deploy of this project will do (dev tools and
 * presentation available or not, passworded or not, where data goes), the
 * risk findings, and every setting with its value, where that value comes
 * from, and where to change it. The data comes from the dev-server-only route
 * /_smile/dev-config (src/devconfig/handler.ts), which never sends a secret.
 */
import { computed, onMounted, ref } from 'vue'
import { CircleCheck, CircleAlert, ShieldAlert, Info, RotateCw, Search } from 'lucide-vue-next'
import useAPI from '../../../composables/useAPI'
import BuildConfigSetting from './BuildConfigSetting.vue'

const api = useAPI()

const data = ref(null)
const error = ref(null)
const loading = ref(false)
const filter = ref('')

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await fetch('/_smile/dev-config', { headers: { accept: 'application/json' } })
    const body = await res.json().catch(() => ({}))
    if (res.status === 404) {
      // A deployed build with the dev tools: the route exists only in nuxt dev.
      throw new Error('This page reads the project\'s env files, so it works only in the local dev server (pnpm dev). '
        + 'On a deploy, the settings live in Vercel > Settings > Environment Variables.')
    }
    if (!res.ok) throw new Error(body.error || `The server answered ${res.status}.`)
    data.value = body
  }
  catch (e) {
    error.value = e.message || String(e)
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

const statusIcon = { ok: CircleCheck, check: CircleAlert, risk: ShieldAlert }
const statusLabel = { ok: 'OK', check: 'Check', risk: 'Risk' }
const levelIcon = { error: ShieldAlert, warn: CircleAlert, info: Info }

const counts = computed(() => {
  const c = { risk: 0, check: 0 }
  for (const line of data.value?.summary || []) if (c[line.status] !== undefined) c[line.status]++
  for (const f of data.value?.findings || []) {
    if (f.level === 'error') c.risk++
    else if (f.level === 'warn') c.check++
  }
  return c
})

const groups = computed(() => {
  if (!data.value) return []
  const q = filter.value.trim().toLowerCase()
  return data.value.groups
    .map(g => ({
      ...g,
      settings: data.value.settings.filter(s => s.group === g.id
        && (!q || s.key.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))),
    }))
    .filter(g => g.settings.length)
})

const envFiles = computed(() => Object.entries(data.value?.files || {}).filter(([, f]) => f.exists))

/** Jump to a setting's row (from a summary line or finding) */
function showSetting(key) {
  filter.value = ''
  requestAnimationFrame(() => {
    const el = document.getElementById(`sd-setting-${key}`)
    if (!el) return
    el.closest('details')?.setAttribute('open', '')
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.classList.add('sd-flash')
    setTimeout(() => el.classList.remove('sd-flash'), 1200)
  })
}
</script>

<template>
  <div
    class="sd-root build-config bg-sd-bg text-sd-text"
    data-testid="build-config"
  >
    <header class="bc-header">
      <div>
        <h1 class="bc-title">
          Build & deploy settings
        </h1>
        <p class="sd-help">
          What a deploy of <span class="sd-mono">{{ api.config.github?.repoName || 'this project' }}</span> will do, and
          every setting behind it. Read-only: each setting says where to change it. Values come from this project's env
          files; on Vercel, its Environment Variables add to them and win.
        </p>
      </div>
      <Button
        variant="toolbar"
        size="sm"
        :disabled="loading"
        @click="load"
      >
        <RotateCw
          class="size-3.5"
          :class="{ 'animate-spin': loading }"
        />
        Reload
      </Button>
    </header>

    <p
      v-if="error"
      class="bc-error"
      role="alert"
    >
      {{ error }}
    </p>

    <template v-if="data">
      <!-- What a deploy will do -->
      <section aria-labelledby="bc-deploy">
        <h2
          id="bc-deploy"
          class="sd-section"
        >
          <span>When you deploy</span>
          <span class="bc-counts">
            <span v-if="counts.risk">{{ counts.risk }} risk</span>
            <span v-if="counts.check">{{ counts.check }} to check</span>
            <span v-if="!counts.risk && !counts.check">all OK</span>
          </span>
        </h2>
        <p class="sd-help bc-pad">
          Worked out from the files a deploy builds with (<span class="sd-mono">.env</span>, and
          <span class="sd-mono">.env.production</span> if you have one), and
          <span class="sd-mono">smile.devTools</span> in nuxt.config.ts. On this dev server, /dev and /presentation are
          always open with no password; none of this changes that.
        </p>
        <ul class="bc-summary">
          <li
            v-for="line in data.summary"
            :key="line.id"
            class="bc-line"
            :class="`is-${line.status}`"
            :data-testid="`deploy-${line.id}`"
          >
            <component
              :is="statusIcon[line.status]"
              class="bc-icon"
              :aria-label="statusLabel[line.status]"
            />
            <div class="bc-line-body">
              <div class="bc-q">
                {{ line.question }}
              </div>
              <div class="bc-a">
                {{ line.answer }}
              </div>
              <p class="sd-help">
                {{ line.explanation }}
              </p>
              <p
                v-if="line.recommendation"
                class="bc-rec"
              >
                <span class="bc-rec-label">Recommended:</span> {{ line.recommendation }}
              </p>
              <div class="bc-keys">
                <button
                  v-for="k in line.keys"
                  :key="k"
                  class="bc-key sd-mono"
                  @click="showSetting(k)"
                >
                  {{ k }}
                </button>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <!-- Other findings -->
      <section
        v-if="data.findings.length"
        aria-labelledby="bc-findings"
      >
        <h2
          id="bc-findings"
          class="sd-section"
        >
          <span>Also worth a look</span>
          <span class="bc-counts">{{ data.findings.length }}</span>
        </h2>
        <ul class="bc-summary">
          <li
            v-for="f in data.findings"
            :key="f.id"
            class="bc-line"
            :class="`is-${f.level}`"
            data-testid="finding"
          >
            <component
              :is="levelIcon[f.level]"
              class="bc-icon"
            />
            <div class="bc-line-body">
              <div class="bc-a">
                {{ f.message }}
              </div>
              <p
                v-if="f.fix"
                class="sd-help"
              >
                {{ f.fix }}
              </p>
              <div class="bc-keys">
                <button
                  v-for="k in f.keys"
                  :key="k"
                  class="bc-key sd-mono"
                  @click="showSetting(k)"
                >
                  {{ k }}
                </button>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <!-- Files -->
      <section aria-labelledby="bc-files">
        <h2
          id="bc-files"
          class="sd-section"
        >
          <span>Where settings live</span>
        </h2>
        <div class="bc-pad bc-files">
          <div
            v-for="[name, f] in envFiles"
            :key="name"
            class="bc-file"
          >
            <span class="sd-mono">{{ name }}</span>
            <span class="bc-badge">{{ name === '.env.git.local' ? 'generated' : f.tracked ? 'tracked: deploys use it' : 'this machine only' }}</span>
          </div>
          <div
            v-if="!envFiles.length"
            class="sd-help"
          >
            No env files: everything is at its default.
          </div>
          <div class="bc-file">
            <span>Vercel</span>
            <span class="bc-badge">{{ data.vercelLinked ? 'linked (.vercel/project.json)' : 'not linked: run pnpm smile:setup-deploy' }}</span>
          </div>
          <p class="sd-help">
            Deploy secrets for GitHub Actions (VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID, SLACK_WEBHOOK_URL, MAIL_*)
            are set by <span class="sd-mono">pnpm smile:setup-deploy</span> and live on GitHub; the app's own variables
            for deploys live in Vercel &gt; Settings &gt; Environment Variables. This page can't see either.
          </p>
        </div>
      </section>

      <!-- All settings -->
      <section aria-labelledby="bc-all">
        <h2
          id="bc-all"
          class="sd-section"
        >
          <span>All settings</span>
          <label class="bc-filter">
            <Search class="size-3" />
            <input
              v-model="filter"
              class="sd-mono"
              placeholder="Filter"
              aria-label="Filter settings"
            >
          </label>
        </h2>
        <template
          v-for="g in groups"
          :key="g.id"
        >
          <details
            class="bc-group"
            :open="g.id !== 'generated' || !!filter"
          >
            <summary class="bc-group-title">
              {{ g.title }} <span class="bc-counts">{{ g.settings.length }}</span>
            </summary>
            <BuildConfigSetting
              v-for="s in g.settings"
              :key="s.key"
              :setting="s"
            />
          </details>
        </template>
        <p
          v-if="!groups.length"
          class="sd-help bc-pad"
        >
          No setting matches "{{ filter }}".
        </p>
      </section>
    </template>

    <p
      v-else-if="loading"
      class="sd-help bc-pad"
    >
      Reading the project's settings…
    </p>
  </div>
</template>

<style scoped>
.build-config {
  height: 100vh;
  overflow-y: auto;
  font-size: var(--sd-font-sm);
}

.build-config > * {
  max-width: 980px;
}

.bc-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 12px 12px;
}

.bc-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.bc-pad {
  padding: 8px 12px;
}

.bc-error {
  margin: 0 12px 12px;
  padding: 8px 10px;
  border: 1px solid var(--sd-error-line);
  border-radius: var(--sd-radius);
  background: var(--sd-error-bg);
  color: var(--sd-error);
}

.bc-counts {
  display: inline-flex;
  gap: 8px;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
}

.bc-summary {
  list-style: none;
  margin: 0;
  padding: 0;
}

.bc-line {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--sd-line);
}

.bc-icon {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 1px;
}

.is-ok .bc-icon {
  color: var(--sd-ok);
}
.is-check .bc-icon,
.is-warn .bc-icon {
  color: var(--sd-warn);
}
.is-risk .bc-icon,
.is-error .bc-icon {
  color: var(--sd-error);
}
.is-info .bc-icon {
  color: var(--sd-info);
}
.is-risk,
.is-error {
  background: var(--sd-error-bg);
}

.bc-line-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.bc-q {
  font-size: var(--sd-font-xs);
  color: var(--sd-text-muted);
}

.bc-a {
  font-size: var(--sd-font-md);
  font-weight: 500;
}

.bc-rec {
  line-height: 1.45;
}

.bc-rec-label {
  font-weight: 600;
}

.bc-keys {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.bc-key {
  padding: 1px 6px;
  border: 1px solid var(--sd-line);
  border-radius: 4px;
  color: var(--sd-key);
  background: var(--sd-panel);
}
.bc-key:hover {
  background: var(--sd-hover);
}

.bc-files {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bc-file {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bc-badge {
  font-size: var(--sd-font-xs);
  padding: 0 6px;
  border-radius: 4px;
  background: var(--sd-panel-2);
  color: var(--sd-text-muted);
}

.bc-filter {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 6px;
  border: 1px solid var(--sd-line);
  border-radius: 4px;
  background: var(--sd-bg);
  text-transform: none;
}

.bc-filter input {
  width: 140px;
  background: transparent;
  outline: none;
  color: var(--sd-text);
}

.bc-group {
  border-bottom: 1px solid var(--sd-line);
}

.bc-group-title {
  cursor: pointer;
  padding: 8px 12px;
  font-weight: 600;
  font-size: var(--sd-font-sm);
}
.bc-group-title:hover {
  background: var(--sd-hover);
}
</style>
