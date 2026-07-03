<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { Database, RefreshCw, FolderGit2, Github, ClockArrowDown, Search, User } from 'lucide-vue-next'

/**
 * @fileoverview Minimal data dashboard for browsing past experiment records
 * from the linked database. Lets a researcher switch between real (live) and
 * testing (dev) data, drill into a project, inspect its participant records,
 * and view a single record's raw data.
 *
 * This is an intentionally minimal first pass — a three-pane browser
 * (projects -> records -> record detail) built on the existing
 * /api/projects endpoints. Search, filtering and richer visualizations
 * can be layered on later.
 */

/**
 * Active data mode tab.
 * 'live' = real participant data, 'test' = testing/dev data.
 * @type {import('vue').Ref<'live' | 'test'>}
 */
const mode = ref('live')

/**
 * All projects for the current owner/repo scope (across branches + modes).
 * @type {import('vue').Ref<Array<object>>}
 */
const projects = ref([])
const projectsLoading = ref(false)
const projectsError = ref(null)

/**
 * Currently selected project id and its participant records.
 */
const selectedProjectId = ref(null)
const records = ref([])
const recordsLoading = ref(false)
const recordsError = ref(null)

/**
 * Currently selected participant record and its full data.
 */
const selectedRecordId = ref(null)
const recordData = ref(null)
const recordLoading = ref(false)
const recordError = ref(null)

/**
 * Projects filtered to the active mode (real vs testing).
 * @type {import('vue').ComputedRef<Array<object>>}
 */
const visibleProjects = computed(() =>
  projects.value.filter(p => p.mode === mode.value),
)

const realCount = computed(() => projects.value.filter(p => p.mode === 'live').length)
const testCount = computed(() => projects.value.filter(p => p.mode === 'test').length)

/**
 * Format a timestamp (ISO string or epoch) for display.
 * @param {string | number | null} value
 * @returns {string} A locale-formatted date string, or an em dash if empty.
 */
function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString()
}

/**
 * Free-text search across projects.
 * @type {import('vue').Ref<string>}
 */
const searchTerm = ref('')

/**
 * How the project list is grouped/sorted.
 * 'user' = group by GitHub owner, 'repo' = group by repo,
 * 'updated' = flat list, newest activity first.
 * @type {import('vue').Ref<'user' | 'repo' | 'updated'>}
 */
const viewMode = ref('updated')

/**
 * Parse a timestamp to epoch millis (0 if missing/invalid).
 * @param {string | number | null} value
 * @returns {number} Epoch milliseconds.
 */
function toMillis(value) {
  if (!value) return 0
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? 0 : t
}

/**
 * Whether a project matches the current search term.
 * @param {object} project
 * @returns {boolean} True when the term is empty or matches a field.
 */
function matchesSearch(project) {
  const s = searchTerm.value.trim().toLowerCase()
  if (!s) return true
  return [project.owner, project.repo, project.branch, project.id]
    .some(v => (v || '').toLowerCase().includes(s))
}

/**
 * Projects for the active mode, filtered by search and grouped/sorted
 * per the selected view mode. Returns an array of
 * `{ label, projects }` groups (label is null for the flat "updated" view).
 * @type {import('vue').ComputedRef<Array<{ label: string | null, projects: Array<object> }>>}
 */
const projectGroups = computed(() => {
  const list = visibleProjects.value.filter(matchesSearch)

  if (viewMode.value === 'updated') {
    const sorted = [...list].sort((a, b) => toMillis(b.lastUpdated) - toMillis(a.lastUpdated))
    return [{ label: null, projects: sorted }]
  }

  const key = viewMode.value === 'repo' ? 'repo' : 'owner'
  const groups = {}
  for (const project of list) {
    const label = project[key] || 'Other'
    ;(groups[label] ||= []).push(project)
  }
  return Object.keys(groups)
    .sort((a, b) => a.localeCompare(b))
    .map(label => ({
      label,
      projects: groups[label].sort((a, b) =>
        `${a.repo}/${a.branch}`.localeCompare(`${b.repo}/${b.branch}`),
      ),
    }))
})

/**
 * Number of projects visible after the search filter (across all groups).
 * @type {import('vue').ComputedRef<number>}
 */
const filteredCount = computed(() =>
  projectGroups.value.reduce((n, g) => n + g.projects.length, 0),
)

/**
 * Fetch all projects for the current scope.
 */
async function loadProjects() {
  projectsLoading.value = true
  projectsError.value = null
  try {
    projects.value = await $fetch('/api/projects')
  }
  catch (err) {
    projectsError.value = err?.statusMessage || err?.message || 'Failed to load projects'
    projects.value = []
  }
  finally {
    projectsLoading.value = false
  }
}

/**
 * Select a project and load its participant records.
 * @param {string} projectId
 */
async function selectProject(projectId) {
  selectedProjectId.value = projectId
  selectedRecordId.value = null
  recordData.value = null
  records.value = []
  recordsLoading.value = true
  recordsError.value = null
  try {
    records.value = await $fetch(`/api/projects/${encodeURIComponent(projectId)}/participants`)
  }
  catch (err) {
    recordsError.value = err?.statusMessage || err?.message || 'Failed to load records'
  }
  finally {
    recordsLoading.value = false
  }
}

/**
 * Select a participant record and load its full data.
 * @param {string} participantId
 */
async function selectRecord(participantId) {
  selectedRecordId.value = participantId
  recordData.value = null
  recordLoading.value = true
  recordError.value = null
  try {
    const res = await $fetch(
      `/api/projects/${encodeURIComponent(selectedProjectId.value)}/participants/${encodeURIComponent(participantId)}`,
    )
    recordData.value = res?.data ?? res
  }
  catch (err) {
    recordError.value = err?.statusMessage || err?.message || 'Failed to load record'
  }
  finally {
    recordLoading.value = false
  }
}

// Reset downstream selection whenever the real/testing mode changes.
watch(mode, () => {
  selectedProjectId.value = null
  selectedRecordId.value = null
  records.value = []
  recordData.value = null
})

const prettyRecord = computed(() =>
  recordData.value == null ? '' : JSON.stringify(recordData.value, null, 2),
)

onMounted(loadProjects)
</script>

<template>
  <div class="dashboard bg-background text-foreground">
    <!-- Striped local dev server banner (matches developer mode) -->
    <LocalDevBanner />

    <!-- Header -->
    <div class="dash-header">
      <div class="flex items-center gap-2">
        <Database class="size-4 text-muted-foreground" />
        <h1 class="text-sm font-semibold">
          Data Dashboard
        </h1>
      </div>

      <button
        class="icon-btn"
        title="Refresh"
        :disabled="projectsLoading"
        @click="loadProjects"
      >
        <RefreshCw
          class="size-4"
          :class="{ 'animate-spin': projectsLoading }"
        />
      </button>
    </div>

    <!-- Three-pane browser -->
    <div class="dash-body">
      <!-- Projects pane -->
      <div class="pane projects-pane">
        <!-- Real / testing toggle (top of the panel) -->
        <Tabs
          v-model="mode"
          class="w-full gap-0"
        >
          <TabsList class="w-full grid grid-cols-2 h-auto p-0 rounded-none border-b bg-muted">
            <TabsTrigger
              value="live"
              class="rounded-none border-0 py-2"
            >
              Real <span class="tab-count">{{ realCount }}</span>
            </TabsTrigger>
            <TabsTrigger
              value="test"
              class="rounded-none border-0 py-2"
            >
              Testing <span class="tab-count">{{ testCount }}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <!-- Search + grouping controls -->
        <div class="controls">
          <ToggleGroup
            v-model="viewMode"
            type="single"
            variant="outline"
            size="sm"
            class="shrink-0"
          >
            <ToggleGroupItem
              value="user"
              title="Group by GitHub user"
              class="size-8 p-0"
            >
              <Github class="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="repo"
              title="Group by repo"
              class="size-8 p-0"
            >
              <FolderGit2 class="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="updated"
              title="Sort by last updated"
              class="size-8 p-0"
            >
              <ClockArrowDown class="size-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>

          <div class="search-wrap">
            <Search class="search-icon size-3.5" />
            <Input
              v-model="searchTerm"
              placeholder="Search projects…"
              class="h-8 pl-7 text-xs"
            />
          </div>
        </div>

        <div class="pane-scroll">
          <p
            v-if="projectsError"
            class="empty text-destructive"
          >
            {{ projectsError }}
          </p>
          <p
            v-else-if="projectsLoading"
            class="empty"
          >
            Loading…
          </p>
          <p
            v-else-if="visibleProjects.length === 0"
            class="empty"
          >
            No {{ mode === 'live' ? 'real' : 'testing' }} data yet.
          </p>
          <p
            v-else-if="filteredCount === 0"
            class="empty"
          >
            No projects match “{{ searchTerm }}”.
          </p>
          <template v-else>
            <div
              v-for="group in projectGroups"
              :key="group.label ?? '__all__'"
              class="project-group"
            >
              <div
                v-if="group.label"
                class="group-label"
              >
                {{ group.label }}
              </div>
              <button
                v-for="project in group.projects"
                :key="project.id"
                class="project-card"
                :class="{ selected: project.id === selectedProjectId }"
                @click="selectProject(project.id)"
              >
                <span class="project-name truncate">{{ project.repo }}</span>
                <span class="branch-badge">{{ project.branch }}</span>
                <span
                  class="record-count"
                  :title="`${project.recordCount} records`"
                >{{ project.recordCount }}</span>
              </button>
            </div>
          </template>
        </div>
      </div>

      <!-- Records pane -->
      <div class="pane records-pane">
        <div class="pane-title">
          Records
          <span
            v-if="selectedProjectId && !recordsLoading"
            class="text-muted-foreground font-normal"
          >({{ records.length }})</span>
        </div>
        <div class="pane-scroll">
          <p
            v-if="!selectedProjectId"
            class="empty"
          >
            Select a project.
          </p>
          <p
            v-else-if="recordsError"
            class="empty text-destructive"
          >
            {{ recordsError }}
          </p>
          <p
            v-else-if="recordsLoading"
            class="empty"
          >
            Loading…
          </p>
          <p
            v-else-if="records.length === 0"
            class="empty"
          >
            No records in this project.
          </p>
          <button
            v-for="record in records"
            v-else
            :key="record.id"
            class="list-item"
            :class="{ selected: record.id === selectedRecordId }"
            @click="selectRecord(record.id)"
          >
            <User class="size-4 shrink-0 text-muted-foreground" />
            <span class="flex-1 truncate">
              <span class="block font-mono text-xs truncate">{{ record.id }}</span>
              <span class="block text-xs text-muted-foreground">{{ formatDate(record.createdAt) }}</span>
            </span>
          </button>
        </div>
      </div>

      <!-- Record detail pane -->
      <div class="pane detail-pane">
        <div class="pane-title">
          Record
        </div>
        <div class="pane-scroll">
          <p
            v-if="!selectedRecordId"
            class="empty"
          >
            Select a record.
          </p>
          <p
            v-else-if="recordError"
            class="empty text-destructive"
          >
            {{ recordError }}
          </p>
          <p
            v-else-if="recordLoading"
            class="empty"
          >
            Loading…
          </p>
          <pre
            v-else
            class="json-view"
          >{{ prettyRecord }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.dash-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 0.75rem;
  box-sizing: border-box;
  border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
}

.tab-count {
  font-size: 0.7rem;
  background: var(--muted);
  color: var(--muted-foreground);
  border-radius: 999px;
  padding: 0 0.4rem;
  margin-left: 0.35rem;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.3rem;
  border-radius: 0.375rem;
  color: var(--muted-foreground);
  cursor: pointer;
}

.icon-btn:hover {
  background: var(--muted);
  color: var(--foreground);
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.dash-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--border);
}

.projects-pane {
  flex: 0 0 270px;
}

.records-pane {
  flex: 0 0 280px;
}

.detail-pane {
  flex: 1;
  min-width: 0;
  border-right: none;
}

.pane-title {
  flex: 0 0 auto;
  padding: 0.45rem 0.75rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted-foreground);
  border-bottom: 1px solid var(--border);
  background: var(--muted);
}

.pane-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.25rem;
}

.empty {
  padding: 0.75rem;
  font-size: 0.8rem;
  color: var(--muted-foreground);
}

/* Search + grouping controls */
.controls {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-bottom: 1px solid var(--border);
}

.search-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}

.search-icon {
  position: absolute;
  left: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted-foreground);
  pointer-events: none;
}

/* Project group "card" + rows */
.project-group {
  background: var(--muted);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.25rem;
  margin: 0.25rem;
}

.group-label {
  padding: 0.3rem 0.4rem 0.2rem;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted-foreground);
}

.project-card {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  text-align: left;
  padding: 0.4rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.82rem;
  cursor: pointer;
  color: var(--foreground);
}

.project-card:hover {
  background: var(--background);
}

.project-card.selected {
  background: var(--background);
  outline: 1px solid var(--border);
}

.project-name {
  flex: 1;
  min-width: 0;
  font-weight: 500;
}

.branch-badge {
  flex: 0 0 auto;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.68rem;
  font-family: var(--font-mono, monospace);
  background: var(--background);
  color: var(--muted-foreground);
  border: 1px solid var(--border);
  border-radius: 0.3rem;
  padding: 0.05rem 0.35rem;
}

.record-count {
  flex: 0 0 auto;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  color: var(--muted-foreground);
  min-width: 1.5rem;
  text-align: right;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  text-align: left;
  padding: 0.4rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.85rem;
  cursor: pointer;
  color: var(--foreground);
}

.list-item:hover {
  background: var(--muted);
}

.list-item.selected {
  background: var(--accent, var(--muted));
  outline: 1px solid var(--border);
}

.json-view {
  margin: 0;
  padding: 0.5rem 0.75rem;
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--foreground);
}
</style>
