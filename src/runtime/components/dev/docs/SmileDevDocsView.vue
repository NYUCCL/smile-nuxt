<script setup>
/**
 * Docs mode: the SMILE docs for the installed version, inside the dev tools.
 * Dev server only: the layout loads this view only when import.meta.dev, so a
 * build (even with SMILE_DEV_TOOLS=include) has neither it nor its route.
 * Pages come from the dev-only /__smile/docs route (server/dev/docs.ts), which
 * renders the markdown that ships with the module. Links between pages stay
 * here; the page you were on comes back next time (store.dev.docsPage).
 *
 * If the route doesn't answer (no docs found in the installed module), it
 * shows the website instead.
 */
import { BookMarked, ExternalLink, Search, X } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import useAPI from '../../../composables/useAPI'
import { provideDevScope } from '../../../composables/useDevScope'
import { Button } from '../../ui/button'
import DevModeLabel from '../navbar/DevModeLabel.vue'
import DevScope from '../DevScope.vue'
import './docs-prose.css'

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
  updateActiveHeading()
}

// "On this page": the page's h2-h6s, with the one you're reading marked
const activeHeading = ref('')
const toc = computed(() => (page.value?.outline === false ? [] : page.value?.headings) || [])

function updateActiveHeading() {
  const main = content.value
  if (!main || !toc.value.length) {
    activeHeading.value = ''
    return
  }
  // At the bottom, the last heading is the one you're reading
  if (main.scrollTop + main.clientHeight >= main.scrollHeight - 4) {
    activeHeading.value = toc.value.at(-1).id
    return
  }
  const top = main.getBoundingClientRect().top + 96
  let active = ''
  for (const h of toc.value) {
    const el = main.querySelector(`[id="${CSS.escape(h.id)}"]`)
    if (el && el.getBoundingClientRect().top <= top) active = h.id
  }
  activeHeading.value = active
}

let scrollFrame
function onScroll() {
  cancelAnimationFrame(scrollFrame)
  scrollFrame = requestAnimationFrame(updateActiveHeading)
}

// The copy button on a code block
async function copyCode(button) {
  const code = button.parentElement?.querySelector('pre code')
  if (!code) return
  try {
    await navigator.clipboard.writeText(code.textContent)
  }
  catch {
    return
  }
  button.classList.add('copied')
  setTimeout(() => button.classList.remove('copied'), 2000)
}

// Links in a page: to another page (stay here), to a heading, or out.
function onContentClick(e) {
  const copy = e.target.closest('.sd-docs-copy')
  if (copy) {
    copyCode(copy)
    return
  }
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

// Previous / next, in the sidebar's order
const allPages = computed(() => index.value?.sections.flatMap(sec => sec.pages) || [])
const position = computed(() => allPages.value.findIndex(p => p.path === current.value))
const prevPage = computed(() => (position.value > 0 ? allPages.value[position.value - 1] : null))
const nextPage = computed(() => (position.value >= 0 ? allPages.value[position.value + 1] || null : null))

// ⌘K / Ctrl+K focuses the search, as on the website; a click elsewhere closes the results
const searchBox = ref(null)
const shortcutLabel = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'

function onKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    searchInput.value?.focus()
    searchInput.value?.select()
  }
}

function onPointerDown(e) {
  if (query.value && !searchBox.value?.contains(e.target)) query.value = ''
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('pointerdown', onPointerDown)
  cancelAnimationFrame(scrollFrame)
  clearTimeout(searchTimer)
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
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('pointerdown', onPointerDown)
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
      <!-- The bar across the top, like developer and presentation mode's -->
      <DevScope>
        <nav class="docs-bar sd-root flex items-center justify-between gap-4 w-full border-b border-sd-line h-9 px-3 text-xs">
          <div class="flex items-center gap-4 min-w-0">
            <DevModeLabel
              :icon="BookMarked"
              label="SMILE docs"
              short="Docs"
            />
            <div
              ref="searchBox"
              class="docs-search"
            >
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
              <kbd
                v-if="!query"
                class="docs-search-key border border-sd-line text-sd-text-muted"
              >{{ shortcutLabel }}</kbd>
              <button
                v-else
                class="docs-search-clear text-sd-text-muted"
                aria-label="Clear search"
                @click="clearSearch"
              >
                <X class="size-3.5" />
              </button>

              <ul
                v-if="query.trim()"
                class="docs-results bg-sd-panel border border-sd-line"
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
            </div>
          </div>
          <Button
            v-if="page"
            as="a"
            variant="toolbar"
            size="menu"
            :href="page.website"
            target="_blank"
            rel="noopener"
          >
            On the website <ExternalLink />
          </Button>
        </nav>
      </DevScope>

      <div class="docs-row">
        <!-- Page list -->
        <nav
          class="docs-nav bg-sd-chrome border-r border-sd-line"
          aria-label="Docs pages"
        >
          <div
            v-if="index"
            class="docs-pages"
          >
            <section
              v-for="s in index.sections"
              :key="s.section"
              class="docs-section border-sd-line"
            >
              <p class="docs-section-title text-sd-text">
                {{ s.section }}
              </p>
              <button
                v-for="p in s.pages"
                :key="p.path"
                class="docs-page-link"
                :class="p.path === current ? 'text-sd-accent' : 'text-sd-text-muted hover:text-sd-text'"
                :aria-current="p.path === current ? 'page' : undefined"
                @click="load(p.path)"
              >
                {{ p.title }}
              </button>
            </section>
          </div>
        </nav>

        <div class="docs-column">
          <!-- The page -->
          <main
            ref="content"
            class="docs-main"
            @click="onContentClick"
            @scroll.passive="onScroll"
          >
            <div
              v-if="page"
              class="docs-body"
            >
              <div class="docs-page">
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

                <!-- Previous / next page, in sidebar order -->
                <nav
                  v-if="prevPage || nextPage"
                  class="docs-pager border-t border-sd-line"
                  aria-label="Previous and next pages"
                  data-testid="docs-pager"
                >
                  <button
                    v-if="prevPage"
                    class="docs-pager-link border border-sd-line hover:border-sd-accent"
                    @click="load(prevPage.path)"
                  >
                    <span class="docs-pager-desc text-sd-text-muted">Previous page</span>
                    <span class="docs-pager-title text-sd-accent">{{ prevPage.title }}</span>
                  </button>
                  <span v-else />
                  <button
                    v-if="nextPage"
                    class="docs-pager-link docs-pager-next border border-sd-line hover:border-sd-accent"
                    @click="load(nextPage.path)"
                  >
                    <span class="docs-pager-desc text-sd-text-muted">Next page</span>
                    <span class="docs-pager-title text-sd-accent">{{ nextPage.title }}</span>
                  </button>
                </nav>
              </div>

              <aside
                v-if="toc.length"
                class="docs-toc"
                aria-label="On this page"
                data-testid="docs-toc"
              >
                <p class="docs-toc-title text-sd-text">
                  On this page
                </p>
                <ul class="border-l border-sd-line">
                  <li
                    v-for="h in toc"
                    :key="h.id"
                  >
                    <a
                      :href="`#${h.id}`"
                      :data-docs-hash="h.id"
                      class="docs-toc-link"
                      :class="[
                        `docs-toc-${Math.min(h.level, 4)}`,
                        h.id === activeHeading ? 'docs-toc-active text-sd-accent' : 'text-sd-text-muted hover:text-sd-text',
                      ]"
                      :aria-current="h.id === activeHeading ? 'location' : undefined"
                    >{{ h.text }}</a>
                  </li>
                </ul>
              </aside>
            </div>
            <p
              v-else-if="error"
              class="docs-error text-sd-error"
            >
              {{ error }}
            </p>
          </main>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Laid out like the website (VitePress): page list, then the page with
   "On this page" beside it, search in a bar across the top. */
.docs-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  overflow: hidden;
}
.docs-website {
  width: 100%;
  height: 100%;
  border: none;
}

/* Page list */
.docs-nav {
  width: 17rem;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.docs-pages {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem 1.25rem 1.5rem;
}
.docs-section:first-child {
  border-top-width: 0;
}
.docs-section {
  padding: 0.625rem 0 1.5rem;
  border-top-width: 1px;
}
.docs-section-title {
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.5rem;
  padding: 0.25rem 0.5rem;
}
.docs-page-link {
  display: block;
  width: 100%;
  text-align: left;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.5rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
}

/* The bar across the top: developer and presentation mode's bar */
.docs-bar {
  flex-shrink: 0;
  background-color: var(--sd-bar);
}
.docs-row {
  flex: 1;
  min-height: 0;
  display: flex;
}
.docs-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--sd-reading-bg);
}
.docs-search {
  position: relative;
  width: 15rem;
}
.docs-search input {
  width: 100%;
  height: 1.5rem;
  border-radius: 0.375rem;
  padding: 0 2.75rem 0 1.75rem;
  font-size: 0.75rem;
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
  left: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  width: 0.75rem;
  height: 0.75rem;
  pointer-events: none;
}
.docs-search-key {
  position: absolute;
  right: 0.375rem;
  top: 50%;
  transform: translateY(-50%);
  font-family: inherit;
  font-size: 0.625rem;
  line-height: 1;
  padding: 0.125rem 0.3125rem;
  border-radius: 0.25rem;
  pointer-events: none;
}
.docs-search-clear {
  position: absolute;
  right: 0.375rem;
  top: 50%;
  transform: translateY(-50%);
}
.docs-results {
  position: absolute;
  top: calc(100% + 0.375rem);
  left: 0;
  z-index: 20;
  width: min(36rem, calc(100vw - 22rem));
  max-height: min(32rem, calc(100vh - 6rem));
  overflow-y: auto;
  padding: 0.375rem;
  border-radius: 0.5rem;
  box-shadow: var(--sd-float-shadow);
}
.docs-result {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.5rem 0.625rem;
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

/* The page and "On this page" (688px + 256px on the website) */
.docs-main {
  flex: 1;
  overflow-y: auto;
  container-type: inline-size;
}
.docs-body {
  display: flex;
  justify-content: center;
  gap: 3rem;
  padding: 2.5rem 2rem 4rem;
}
.docs-page {
  flex: 1;
  min-width: 0;
  max-width: 43rem;
}
.docs-error {
  padding: 1.5rem 2rem;
}
.docs-loading {
  opacity: 0.5;
}
.docs-toc {
  width: 14rem;
  flex-shrink: 0;
  position: sticky;
  top: 2.5rem;
  align-self: flex-start;
  max-height: calc(100vh - 6rem);
  overflow-y: auto;
  padding-top: 0.5rem;
}
.docs-toc-title {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 2rem;
  padding-left: 1rem;
}
.docs-toc-link {
  display: block;
  font-size: 0.875rem;
  line-height: 1.375rem;
  padding: 0.3125rem 0 0.3125rem 1rem;
  margin-left: -1px;
  border-left: 1px solid transparent;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.docs-toc-3 {
  padding-left: 1.75rem;
}
.docs-toc-4 {
  padding-left: 2.5rem;
}
.docs-toc-active {
  border-left-color: var(--sd-accent);
  font-weight: 500;
}
/* Room for the page first: "On this page" goes when the column is narrow */
@container (max-width: 50rem) {
  .docs-toc {
    display: none;
  }
}

/* Previous / next */
.docs-pager {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-top: 3rem;
  padding-top: 1.5rem;
}
.docs-pager-link {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  padding: 0.6875rem 1rem 0.8125rem;
  border-radius: 0.5rem;
  transition: border-color 0.15s;
}
.docs-pager-next {
  align-items: flex-end;
  text-align: right;
}
.docs-pager-desc {
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.25rem;
}
.docs-pager-title {
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.25rem;
}
</style>
