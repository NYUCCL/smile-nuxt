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
import { CircleCheck, CircleAlert, ShieldAlert, Info, RotateCw, Search, SlidersHorizontal } from 'lucide-vue-next'
import BuildConfigSetting from './BuildConfigSetting.vue'
import DevModeLabel from '../navbar/DevModeLabel.vue'

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
    for (let d = el; d; d = d.parentElement?.closest('details')) {
      if (d.tagName === 'DETAILS') d.open = true
    }
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
    <!-- Top bar: same layout as developer and presentation mode's -->
    <nav class="flex items-center justify-between gap-4 w-full border-b border-sd-line h-9 px-3 text-xs flex-none">
      <div class="flex items-center gap-2 min-w-0">
        <DevModeLabel
          :icon="SlidersHorizontal"
          label="Build & deploy settings"
          short="Settings"
        />
        <span class="text-sd-text-muted truncate hidden md:inline">read-only · click any line for details</span>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <span
          v-if="data"
          class="bc-counts"
        >
          <span
            v-if="counts.risk"
            class="bc-count is-risk"
          >{{ counts.risk }} risk</span>
          <span
            v-if="counts.check"
            class="bc-count is-check"
          >{{ counts.check }} to check</span>
          <span
            v-if="!counts.risk && !counts.check"
            class="bc-count is-ok"
          >all OK</span>
        </span>
        <div class="sd-toolbar-rule" />
        <Button
          size="menu"
          variant="toolbar"
          title="Read the files again"
          aria-label="Reload"
          :disabled="loading"
          @click="load"
        >
          <RotateCw :class="{ 'animate-spin': loading }" />
        </Button>
      </div>
    </nav>

    <p
      v-if="error"
      class="bc-error"
      role="alert"
    >
      {{ error }}
    </p>

    <!-- Where settings live: one line under the bar -->
    <div
      v-if="data"
      class="bc-sources"
      data-testid="sources"
    >
      <span class="bc-sources-label">Settings come from</span>
      <span
        v-for="[name, f] in envFiles"
        :key="name"
        class="bc-source"
        :title="name === '.env.git.local' ? 'Written by SMILE from git on each dev start' : f.tracked ? 'Committed to git: deploys build with it' : 'Not in git: only this machine sees it'"
      >
        <span class="sd-mono">{{ name }}</span>
        <span class="bc-from">{{ name === '.env.git.local' ? 'generated' : f.tracked ? 'deploys' : 'this machine' }}</span>
      </span>
      <span
        v-if="!envFiles.length"
        class="bc-from"
      >no env files (all defaults)</span>
      <span
        class="bc-source"
        title="On a deploy, Vercel > Settings > Environment Variables add to the tracked files and win. GitHub Actions' deploy secrets (VERCEL_TOKEN, SLACK_WEBHOOK_URL, MAIL_*) live on GitHub. This page can't see either."
      >
        <span>Vercel</span>
        <span class="bc-from">{{ data.vercelLinked ? 'linked · its variables win on deploys' : 'not linked: pnpm smile:setup-deploy' }}</span>
      </span>
    </div>

    <div
      v-if="data"
      class="bc-cols"
    >
      <div class="bc-col">
        <!-- What a deploy will do -->
        <section aria-labelledby="bc-deploy">
          <h2
            id="bc-deploy"
            class="sd-section"
          >
            <span>When you deploy</span>
          </h2>
          <ul class="bc-summary">
            <li
              v-for="line in data.summary"
              :key="line.id"
              :data-testid="`deploy-${line.id}`"
            >
              <details
                class="bc-line"
                :class="`is-${line.status}`"
              >
                <summary class="bc-line-head">
                  <component
                    :is="statusIcon[line.status]"
                    class="bc-icon"
                    :aria-label="statusLabel[line.status]"
                  />
                  <span class="bc-q">{{ line.question }}</span>
                  <span class="bc-a">{{ line.answer }}</span>
                </summary>
                <div class="bc-line-body">
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
              </details>
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
              data-testid="finding"
            >
              <details
                class="bc-line"
                :class="`is-${f.level}`"
              >
                <summary class="bc-line-head">
                  <component
                    :is="levelIcon[f.level]"
                    class="bc-icon"
                  />
                  <span class="bc-a">{{ f.message }}</span>
                </summary>
                <div class="bc-line-body">
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
              </details>
            </li>
          </ul>
        </section>
      </div>
      <section
        class="bc-col"
        aria-labelledby="bc-all"
        data-testid="all-settings"
      >
        <h2
          id="bc-all"
          class="sd-section bc-sticky"
        >
          <span>All settings <span class="bc-counts">{{ data.settings.length }}</span></span>
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
        <div
          v-for="g in groups"
          :key="g.id"
          class="bc-subgroup"
        >
          <h3 class="bc-subgroup-title">
            {{ g.title }}
          </h3>
          <BuildConfigSetting
            v-for="s in g.settings"
            :key="s.key"
            :setting="s"
          />
        </div>
        <p
          v-if="!groups.length"
          class="sd-help bc-pad"
        >
          No setting matches "{{ filter }}".
        </p>
      </section>
    </div>

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
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow-y: auto;
  font-size: var(--sd-font-sm);
}

.bc-cols {
  display: flex;
  flex-direction: column;
}

@media (min-width: 1100px) {
  .build-config {
    overflow: hidden;
  }
  .bc-cols {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
  }
  .bc-col {
    overflow-y: auto;
    min-height: 0;
  }
  .bc-col + .bc-col {
    border-left: 1px solid var(--sd-line);
  }
}

.bc-sticky {
  position: sticky;
  top: 0;
  z-index: 1;
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

.bc-count {
  padding: 0 6px;
  border-radius: 4px;
  line-height: 18px;
}
.bc-count.is-risk {
  background: var(--sd-error-bg);
  color: var(--sd-error);
}
.bc-count.is-check {
  background: var(--sd-warn-bg);
  color: var(--sd-warn);
}
.bc-count.is-ok {
  color: var(--sd-ok);
}

.bc-summary {
  list-style: none;
  margin: 0;
  padding: 0;
}

.bc-line {
  border-bottom: 1px solid var(--sd-line);
}

.bc-line-head {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: center;
  column-gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  list-style: none;
}
.bc-line-head::-webkit-details-marker {
  display: none;
}
.bc-line-head:hover {
  background: var(--sd-hover);
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
.is-risk > .bc-line-head,
.is-error > .bc-line-head {
  background: var(--sd-error-bg);
}

.bc-line-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px 12px 10px 36px;
}

.bc-q {
  grid-column: 2;
  font-size: var(--sd-font-xs);
  color: var(--sd-text-muted);
}

.bc-q + .bc-a {
  grid-column: 2;
}

.bc-a {
  font-weight: 500;
}

.bc-line-head > .bc-icon {
  grid-row: 1 / span 2;
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

.bc-sources {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--sd-line);
  background: var(--sd-panel);
}

.bc-sources-label {
  color: var(--sd-text-muted);
}

.bc-source {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 1px 8px;
  border: 1px solid var(--sd-line);
  border-radius: 4px;
  background: var(--sd-bg);
  cursor: help;
}

.bc-from {
  font-size: var(--sd-font-xs);
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

.bc-subgroup-title {
  padding: 10px 12px 4px;
  font-size: var(--sd-font-xs);
  font-weight: 600;
  color: var(--sd-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
</style>
