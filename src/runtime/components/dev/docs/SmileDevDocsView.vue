<script setup>
/**
 * Docs mode: the SMILE docs for the installed version, inside the dev tools.
 * Pages come from the dev-only /__smile/docs route (server/dev/docs.ts), which
 * renders the markdown that ships with the module. Links between pages stay
 * here; the page you were on comes back next time (store.dev.docsPage).
 *
 * Where that route doesn't exist (a deployed build with the dev tools
 * included), it shows the website instead.
 */
import { ExternalLink, Search, X } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import useAPI from '../../../composables/useAPI'
import { provideDevScope } from '../../../composables/useDevScope'

provideDevScope()

const api = useAPI()
const WEBSITE = 'https://smile.gureckislab.org'
const FIRST_PAGE = 'introduction.md'

const index = ref(null) // { version, sections: [{ section, pages: [{ path, title }] }] }
const unavailable = ref(false) // no docs route: show the website
const page = ref(null) // the rendered page
const loading = ref(false)
const error = ref('')
const query = ref('')
const results = ref([])
const content = ref(null)
const searchInput = ref(null)

const current = computed(() => api.store.dev.docsPage || FIRST_PAGE)

async function load(path, hash = '') {
  loading.value = true
  error.value = ''
  try {
    page.value = await $fetch('/__smile/docs/page', { query: { path } })
    api.store.dev.docsPage = path
    await nextTick()
    scrollTo(hash)
  }
  catch {
    error.value = `Couldn't load ${path}.`
  }
  finally {
    loading.value = false
  }
}

function scrollTo(hash) {
  const el = hash ? content.value?.querySelector(`[id="${CSS.escape(hash)}"]`) : null
  if (el) el.scrollIntoView({ block: 'start' })
  else content.value?.scrollTo({ top: 0 })
}

// Links in a page: to another page (stay here), to a heading, or out.
function onContentClick(e) {
  const link = e.target.closest('a')
  if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
  const target = link.dataset.docsPage
  const hash = link.dataset.docsHash || ''
  if (target) {
    e.preventDefault()
    if (target === current.value) scrollTo(hash)
    else load(target, hash)
  }
  else if (hash) {
    e.preventDefault()
    scrollTo(hash)
  }
}

let searchTimer
watch(query, (q) => {
  clearTimeout(searchTimer)
  if (!q.trim()) {
    results.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    try {
      results.value = await $fetch('/__smile/docs/search', { query: { q } })
    }
    catch {
      results.value = []
    }
  }, 150)
})

function openResult(result) {
  query.value = ''
  load(result.path, result.hash)
}

function clearSearch() {
  query.value = ''
  searchInput.value?.focus()
}

onMounted(async () => {
  try {
    const data = await $fetch('/__smile/docs/index')
    // A build without the route answers with the app's HTML, not a 404
    if (!Array.isArray(data?.sections)) throw new Error('no docs route')
    index.value = data
  }
  catch {
    unavailable.value = true
    return
  }
  const known = index.value.sections.some(s => s.pages.some(p => p.path === current.value))
  load(known ? current.value : FIRST_PAGE)
})
</script>

<template>
  <div class="docs-view sd-root bg-sd-bg text-sd-text">
    <iframe
      v-if="unavailable"
      :src="WEBSITE"
      class="docs-website"
      title="SMILE documentation"
    />
    <template v-else>
      <!-- Page list and search -->
      <nav
        class="docs-nav bg-sd-chrome border-r border-sd-line"
        aria-label="Docs pages"
      >
        <div class="docs-search">
          <Search class="docs-search-icon text-sd-text-muted" />
          <input
            ref="searchInput"
            v-model="query"
            type="search"
            placeholder="Search the docs"
            aria-label="Search the docs"
            class="bg-sd-bg border border-sd-line text-sd-text"
            data-testid="docs-search"
            @keydown.esc="clearSearch"
          >
          <button
            v-if="query"
            class="docs-search-clear text-sd-text-muted"
            aria-label="Clear search"
            @click="clearSearch"
          >
            <X class="size-3.5" />
          </button>
        </div>

        <ul
          v-if="query.trim()"
          class="docs-results"
          data-testid="docs-results"
        >
          <li
            v-if="!results.length"
            class="docs-empty text-sd-text-muted"
          >
            Nothing found.
          </li>
          <li
            v-for="(r, i) in results"
            :key="`${r.path}#${r.hash}-${i}`"
          >
            <button
              class="docs-result hover:bg-sd-hover"
              @click="openResult(r)"
            >
              <span class="docs-result-title">{{ r.title }}<template v-if="r.heading"> › {{ r.heading }}</template></span>
              <span class="docs-result-snippet text-sd-text-muted">{{ r.snippet }}</span>
            </button>
          </li>
        </ul>

        <div
          v-else-if="index"
          class="docs-pages"
        >
          <section
            v-for="s in index.sections"
            :key="s.section"
          >
            <p class="docs-section text-sd-text-muted">
              {{ s.section }}
            </p>
            <button
              v-for="p in s.pages"
              :key="p.path"
              class="docs-page-link"
              :class="p.path === current ? 'bg-sd-selected text-sd-selected-fg' : 'hover:bg-sd-hover'"
              :aria-current="p.path === current ? 'page' : undefined"
              @click="load(p.path)"
            >
              {{ p.title }}
            </button>
          </section>
          <p class="docs-version text-sd-text-muted">
            Docs for @nyuccl/smile-nuxt {{ index.version }}
          </p>
        </div>
      </nav>

      <!-- The page -->
      <main
        ref="content"
        class="docs-main"
        @click="onContentClick"
      >
        <div
          v-if="page"
          class="docs-page"
        >
          <div class="docs-page-head text-sd-text-muted">
            <span>{{ page.section }}</span>
            <a
              :href="page.website"
              target="_blank"
              rel="noopener"
              class="docs-website-link text-sd-link"
            >
              On the website <ExternalLink class="size-3.5" />
            </a>
          </div>
          <p
            v-if="error"
            class="text-sd-error"
          >
            {{ error }}
          </p>
          <!-- eslint-disable vue/no-v-html -- the module's own docs, rendered by server/dev/renderDocs.js -->
          <article
            class="sd-prose"
            :class="{ 'docs-loading': loading }"
            data-testid="docs-page"
            v-html="page.html"
          />
          <!-- eslint-enable vue/no-v-html -->
        </div>
        <p
          v-else-if="error"
          class="docs-page text-sd-error"
        >
          {{ error }}
        </p>
      </main>
    </template>
  </div>
</template>

<style scoped>
.docs-view {
  display: flex;
  height: 100vh;
  width: 100%;
  overflow: hidden;
}
.docs-website {
  width: 100%;
  height: 100%;
  border: none;
}
.docs-nav {
  width: 16rem;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.docs-search {
  position: relative;
  padding: 0.75rem;
}
.docs-search input {
  width: 100%;
  border-radius: 0.375rem;
  padding: 0.375rem 1.75rem 0.375rem 1.875rem;
  font-size: 0.875rem;
  outline: none;
}
.docs-search input:focus {
  border-color: var(--sd-accent);
}
.docs-search input::-webkit-search-cancel-button {
  display: none;
}
.docs-search-icon {
  position: absolute;
  left: 1.375rem;
  top: 50%;
  transform: translateY(-50%);
  width: 0.875rem;
  height: 0.875rem;
}
.docs-search-clear {
  position: absolute;
  right: 1.25rem;
  top: 50%;
  transform: translateY(-50%);
}
.docs-pages,
.docs-results {
  flex: 1;
  overflow-y: auto;
  padding: 0 0.5rem 1rem;
}
.docs-section {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.875rem 0.5rem 0.25rem;
}
.docs-page-link {
  display: block;
  width: 100%;
  text-align: left;
  font-size: 0.875rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
}
.docs-version {
  font-size: 0.75rem;
  padding: 1rem 0.5rem 0;
}
.docs-result {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.5rem;
  border-radius: 0.375rem;
}
.docs-result-title {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
}
.docs-result-snippet {
  font-size: 0.75rem;
  line-height: 1.4;
  margin-top: 0.125rem;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.docs-empty {
  font-size: 0.875rem;
  padding: 0.5rem;
}
.docs-main {
  flex: 1;
  overflow-y: auto;
  background: var(--sd-reading-bg);
}
.docs-page {
  max-width: 48rem;
  margin: 0 auto;
  padding: 1.5rem 2rem 4rem;
}
.docs-page-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8125rem;
  margin-bottom: 0.5rem;
}
.docs-website-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.docs-loading {
  opacity: 0.5;
}
</style>
