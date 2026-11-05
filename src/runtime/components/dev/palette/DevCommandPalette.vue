<script setup>
/**
 * The `:` command palette (local dev server only: the layouts load it behind
 * import.meta.dev, so builds never include it).
 *
 * Type `:` anywhere you aren't typing text and a box opens near the top:
 * a `:` prompt, then up to 8 matching commands. ↑/↓ (or Ctrl-j/k, Ctrl-n/p)
 * choose, Tab completes, Enter runs; a click outside, Backspace or Esc on an
 * empty line closes. Esc with something typed is Vim's normal mode: j/k,
 * gg/G, Enter or l runs, i/a type again, dd clears, Esc or q closes.
 * `:` then Enter repeats the last command. `:go ` lists the timeline's views.
 * The commands are in commands.js (`:help` lists them).
 *
 * It's in the participant view (layouts/experiment.vue, context
 * 'participant') and the dev tools (layouts/development.vue, 'dev'). It
 * always wears the dev tools' theme, in the dev tools' light/dark setting,
 * whatever the experiment's own theme. While it's open, it keeps every key
 * from the page (experiments record keys): it listens on window in the
 * capture phase, before anything else, and stops the event there; the text
 * still reaches its input, since stopping an event doesn't cancel typing.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { usePreferredDark } from '@vueuse/core'
import useAPI from '../../../composables/useAPI'
import { resolveColorMode, setColorMode } from '../../../composables/useColorMode'
import { normalizeDevPalette } from '../../../composables/useDevPalette'
import { GROUPS, commandsFor, findCommand, timelineViews } from './commands'
import { highlight, matchItems, parseInput } from './match'
import { loadHistory, pushHistory } from './history'
import { paletteRequests } from './bus'
import { isOpenKey, isTypingTarget } from './keys'

const props = defineProps({
  context: { type: String, default: 'dev', validator: v => ['dev', 'participant'].includes(v) },
})

const MAX_MATCHES = 8
const MAX_RECENT = 3

const api = useAPI()
const preferredDark = usePreferredDark()

// The dev tools' theme, wherever the palette is
const mode = computed(() => resolveColorMode(api.store.dev.globalColorMode, preferredDark.value))
const devPalette = computed(() => normalizeDevPalette(api.store.dev.devPalette))

const commands = computed(() => commandsFor(props.context))

const isOpen = ref(false)
const query = ref('')
const selected = ref(-1)
const helpOpen = ref(false)
const normalMode = ref(false) // Vim's normal mode: keys move in the list
const history = ref(loadHistory())
const input = ref(null)
const listEl = ref(null)
let returnFocus = null

// ---- Rows -----------------------------------------------------------------

function commandRow(command, match = {}, extra = {}) {
  return {
    key: `cmd:${command.name}`,
    icon: command.icon,
    name: highlight(command.name, match.indices),
    alias: match.alias ?? null,
    description: command.description,
    shortcut: command.shortcut,
    command,
    entry: command.name,
    ...extra,
  }
}

const currentView = computed(() => api.currentRouteName())

const rows = computed(() => {
  const { head, arg, spaced } = parseInput(query.value)
  const available = commands.value

  // Empty: the recent commands, then every command by group
  if (!head) {
    const recent = []
    for (const entry of helpOpen.value ? [] : history.value) {
      if (recent.length >= MAX_RECENT) break
      const { head: word, arg: recentArg } = parseInput(entry)
      const command = findCommand(word, available)
      if (!command || (command.arg && !recentArg)) continue
      recent.push(commandRow(command, {}, {
        key: `recent:${entry}`,
        name: [{ text: entry, hit: false }],
        entry,
        group: 'Recent',
      }))
    }
    const grouped = GROUPS.flatMap(group => available
      .filter(c => c.group === group)
      .map(c => commandRow(c, {}, { group, aliases: helpOpen.value ? c.aliases : [] })))
    return [...recent, ...grouped]
  }

  // `go ` …: the timeline's views
  const command = spaced ? findCommand(head, available) : null
  if (command?.arg === 'view') {
    const matches = matchItems(arg, timelineViews(api), v => [v])
    return matches.slice(0, arg ? MAX_MATCHES : undefined).map(m => ({
      key: `view:${m.item}`,
      icon: command.icon,
      name: highlight(m.item, m.indices),
      description: m.item === currentView.value ? 'current view' : '',
      current: m.item === currentView.value,
      command,
      entry: `${command.name} ${m.item}`,
    }))
  }

  // `/words`: the docs search's results
  if (command?.arg === 'docs') {
    return docs.value.results.slice(0, MAX_MATCHES).map(r => ({
      key: `doc:${r.path}#${r.hash}`,
      icon: command.icon,
      name: [{ text: r.title, hit: false }],
      sub: r.heading && r.heading !== r.title ? r.heading : '',
      description: r.section,
      command,
      entry: `${command.name} ${arg}`,
      pick: r,
    }))
  }

  return matchItems(head, available, c => [c.name, ...c.aliases])
    .slice(0, MAX_MATCHES)
    .map(m => commandRow(m.item, m))
})

// ---- Docs search (`/words`) ---------------------------------------------------

async function searchDocs(words) {
  try {
    const res = await fetch(`/__smile/docs/search?q=${encodeURIComponent(words)}`)
    const list = await res.json()
    return Array.isArray(list) ? list : []
  }
  catch {
    return [] // no docs route (a build) or a bad answer
  }
}

const docs = ref({ words: '', results: [], loading: false })
let docsTimer = null
watch(query, () => {
  const { head, arg, spaced } = parseInput(query.value)
  const command = spaced ? findCommand(head, commands.value) : null
  clearTimeout(docsTimer)
  if (command?.arg !== 'docs' || !arg) {
    docs.value = { words: '', results: [], loading: false }
    return
  }
  docs.value = { ...docs.value, loading: true }
  docsTimer = setTimeout(async () => {
    const results = await searchDocs(arg)
    if (parseInput(query.value).arg === arg) docs.value = { words: arg, results, loading: false }
  }, 120)
})

// What the list says when it has no rows
const emptyText = computed(() => {
  const { head, arg, spaced } = parseInput(query.value)
  const command = spaced ? findCommand(head, commands.value) : null
  if (command?.arg !== 'docs') return 'No matching command'
  if (!arg) return 'Search the docs: type words after /'
  return docs.value.loading ? 'Searching…' : `No docs match "${arg}"`
})

// Grouped (empty line) lists show their group names
const grouped = computed(() => !parseInput(query.value).head)

watch(query, () => {
  helpOpen.value = helpOpen.value && !query.value
  // With something typed, the best match is chosen; on an empty line only
  // the last command is (Enter repeats it)
  selected.value = query.value.trim() || rows.value[0]?.group === 'Recent' ? 0 : -1
})

watch(selected, async (i) => {
  await nextTick()
  listEl.value?.querySelector(`[data-index="${i}"]`)?.scrollIntoView?.({ block: 'nearest' })
})

// ---- Open / close ---------------------------------------------------------

function open() {
  returnFocus = document.activeElement
  history.value = loadHistory()
  query.value = ''
  helpOpen.value = false
  normalMode.value = false
  error.value = ''
  selected.value = rows.value[0]?.group === 'Recent' ? 0 : -1
  isOpen.value = true
  nextTick(() => input.value?.focus())
}

function close() {
  isOpen.value = false
  helpOpen.value = false
  normalMode.value = false
  const el = returnFocus
  returnFocus = null
  if (el && el !== document.body && document.contains(el)) el.focus?.({ preventScroll: true })
}

// ---- Running --------------------------------------------------------------

// A command that failed: said under the prompt, and the palette stays open
// so you can fix what you typed. Success says nothing; you see the result.
const error = ref('')
watch(query, () => {
  error.value = ''
})

const env = {
  api,
  context: props.context,
  nextTick,
  navigate: (url) => {
    window.location.href = url
  },
  setDevColorMode: m => setColorMode('global', m),
  searchDocs,
  openHelp: () => {
    query.value = ''
    helpOpen.value = true
    selected.value = -1
    nextTick(() => input.value?.focus())
  },
}

async function runEntry(entry, pick = null) {
  const { head, arg } = parseInput(entry)
  const command = findCommand(head, commands.value)
  if (!command) {
    error.value = `Unknown command: ${head}`
    return
  }
  let result
  try {
    result = await command.run(env, arg, pick)
  }
  catch (err) {
    result = { action: `Failed: ${err?.message ?? err}`, type: 'error' }
  }
  if (result?.type === 'error') {
    error.value = result.action
    return
  }
  if (command.name !== 'help') history.value = pushHistory(command.arg ? `${command.name} ${arg}`.trim() : command.name)
  if (!command.keepOpen) close()
}

/** What a command that takes an argument starts as: `go `, `/` */
const argStart = command => command.argPrefix ?? `${command.name} `

function runRow(row) {
  // A command that takes an argument, chosen without one: ask for it
  if (row.command.arg && row.entry === row.command.name) {
    query.value = argStart(row.command)
    return
  }
  runEntry(row.entry, row.pick)
}

function enter() {
  const row = rows.value[selected.value]
  if (row) return runRow(row)
  if (!query.value.trim()) return // nothing chosen on an empty line
  runEntry(query.value.trim())
}

function complete() {
  const row = rows.value[Math.max(selected.value, 0)]
  if (!row) return
  if (row.pick) return // a docs result: Enter opens it
  query.value = row.command.arg && row.entry === row.command.name ? argStart(row.command) : row.entry
}

function move(step) {
  const n = rows.value.length
  if (!n) return
  selected.value = selected.value < 0
    ? (step > 0 ? 0 : n - 1)
    : (selected.value + step + n) % n
}

// ---- Keys -----------------------------------------------------------------

function onKey(event) {
  if (!isOpen.value) {
    if (event.type !== 'keydown' || !isOpenKey(event) || isTypingTarget(event)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    open()
    return
  }

  // Open: no key reaches the page
  event.stopImmediatePropagation()
  if (event.type !== 'keydown' || event.isComposing) return
  if (normalMode.value) return onNormalKey(event)
  onInsertKey(event)
}

/** Delete the word before the cursor (Ctrl-w), as in a shell or Vim's insert mode */
function deleteWordBack() {
  const el = input.value
  const end = el?.selectionStart ?? query.value.length
  const before = query.value.slice(0, end).replace(/\S*\s*$/, '')
  query.value = before + query.value.slice(end)
  nextTick(() => el?.setSelectionRange(before.length, before.length))
}

// Insert mode (typing): arrows or Ctrl-j/k/n/p move, Tab completes, Enter
// runs; Esc goes to normal mode (or closes, on an empty line)
function onInsertKey(event) {
  const k = event.key
  const ctrl = event.ctrlKey && !event.metaKey && !event.altKey
  let action = null
  if (k === 'Escape') action = () => (query.value ? setNormalMode(true) : close())
  else if (k === 'Enter') action = enter
  else if (k === 'ArrowDown' || (ctrl && (k === 'j' || k === 'n'))) action = () => move(1)
  else if (k === 'ArrowUp' || (ctrl && (k === 'k' || k === 'p'))) action = () => move(-1)
  else if (k === 'Tab') action = complete
  else if (ctrl && k === 'w') action = deleteWordBack
  else if (ctrl && k === 'u') action = () => (query.value = '')
  else if (k === 'Backspace' && !query.value) action = close

  if (action) {
    event.preventDefault()
    action()
  }
  else if (document.activeElement !== input.value) {
    // keep typing in the palette even if focus wandered (a click on a row)
    input.value?.focus()
  }
}

// Normal mode: Vim's keys for the list. j/k move, gg/G top/bottom, Enter or
// l runs, Tab completes, i/a type again, dd/cc clear the line, Esc/q close.
// Nothing types into the input here.
let pending = ''
function onNormalKey(event) {
  const k = event.key
  if (event.metaKey) return // leave the browser's own shortcuts alone
  event.preventDefault()
  const chord = pending + k
  pending = ''
  if (k === 'Escape' || k === 'q') close()
  else if (k === 'Enter' || k === 'l') enter()
  else if (k === 'j' || k === 'ArrowDown' || (event.ctrlKey && k === 'n')) move(1)
  else if (k === 'k' || k === 'ArrowUp' || (event.ctrlKey && k === 'p')) move(-1)
  else if (k === 'G') selected.value = rows.value.length - 1
  else if (chord === 'gg') selected.value = rows.value.length ? 0 : -1
  else if (k === 'Tab') complete()
  else if (k === 'i' || k === 'a' || k === 'A') setNormalMode(false, k === 'i' ? 'keep' : 'end')
  else if (k === 'I') setNormalMode(false, 'start')
  else if (chord === 'dd' || chord === 'cc' || k === 'S') {
    query.value = ''
    setNormalMode(false)
  }
  else if (k === 'g' || k === 'd' || k === 'c') pending = k
}

function setNormalMode(on, cursor = 'end') {
  normalMode.value = on
  pending = ''
  nextTick(() => {
    const el = input.value
    if (!el) return
    el.focus()
    if (on || cursor === 'keep') return
    const at = cursor === 'start' ? 0 : el.value.length
    el.setSelectionRange(at, at)
  })
}

// Registered now (in setup), not on mount, so it's ahead of key listeners the
// experiment's views add when they mount
const KEY_EVENTS = ['keydown', 'keypress', 'keyup']
if (typeof window !== 'undefined') {
  for (const type of KEY_EVENTS) window.addEventListener(type, onKey, true)
}
onBeforeUnmount(() => {
  for (const type of KEY_EVENTS) window.removeEventListener(type, onKey, true)
})

// The rail's command palette button
watch(paletteRequests, () => {
  if (!isOpen.value) open()
})

onBeforeUnmount(() => clearTimeout(docsTimer))

defineExpose({ open, close })
</script>

<template>
  <div
    class="sd-root sd-palette-scope"
    :class="mode"
    :data-sd-palette="devPalette"
  >
    <Transition name="sd-palette">
      <div
        v-if="isOpen"
        class="sd-palette-backdrop"
        data-testid="command-palette-backdrop"
        @mousedown.self.prevent="close"
      >
        <div
          class="sd-palette"
          role="dialog"
          aria-label="Command palette"
          data-testid="command-palette"
        >
          <div class="sd-palette-prompt">
            <span
              class="sd-palette-glyph"
              aria-hidden="true"
            >:</span>
            <input
              ref="input"
              v-model="query"
              class="sd-palette-input"
              type="text"
              spellcheck="false"
              autocomplete="off"
              autocapitalize="off"
              role="combobox"
              aria-expanded="true"
              aria-controls="sd-palette-list"
              :aria-activedescendant="selected >= 0 ? `sd-palette-row-${selected}` : undefined"
              :class="{ 'is-normal': normalMode }"
              :placeholder="helpOpen ? 'Every command. Type to filter' : 'Type a command (help lists them)'"
            >
            <span
              v-if="normalMode"
              class="sd-palette-mode"
              data-testid="command-palette-normal"
            >NORMAL</span>
          </div>

          <div
            v-if="error"
            class="sd-palette-error"
            role="alert"
            data-testid="command-palette-error"
          >
            {{ error }}
          </div>

          <ul
            id="sd-palette-list"
            ref="listEl"
            class="sd-palette-list"
            role="listbox"
          >
            <template
              v-for="(row, i) in rows"
              :key="row.key"
            >
              <li
                v-if="grouped && row.group && row.group !== rows[i - 1]?.group"
                class="sd-palette-group"
                role="presentation"
              >
                {{ row.group }}
              </li>
              <li
                :id="`sd-palette-row-${i}`"
                class="sd-palette-row"
                :class="{ 'is-selected': i === selected, 'is-current': row.current, 'is-doc': row.pick }"
                role="option"
                :aria-selected="i === selected"
                :data-index="i"
                :data-command="row.entry"
                @mousemove="selected = i"
                @mousedown.prevent
                @click="runRow(row)"
              >
                <span class="sd-palette-icon">
                  <component :is="row.icon" />
                </span>
                <span class="sd-palette-name">
                  <template
                    v-for="(run, j) in row.name"
                    :key="j"
                  >
                    <b v-if="run.hit">{{ run.text }}</b>
                    <template v-else>{{ run.text }}</template>
                  </template>
                </span>
                <span
                  v-if="row.sub"
                  class="sd-palette-sub"
                >› {{ row.sub }}</span>
                <span
                  v-if="row.alias"
                  class="sd-palette-alias"
                >{{ row.alias }}</span>
                <span
                  v-for="alias in row.aliases"
                  :key="alias"
                  class="sd-palette-alias"
                >{{ alias }}</span>
                <span class="sd-palette-desc">
                  <span
                    v-if="row.current"
                    class="sd-palette-dot"
                    aria-hidden="true"
                  />{{ row.description }}
                </span>
                <kbd
                  v-if="row.shortcut"
                  class="sd-palette-kbd"
                >{{ row.shortcut }}</kbd>
              </li>
            </template>
            <li
              v-if="!rows.length"
              class="sd-palette-empty"
            >
              {{ emptyText }}
            </li>
          </ul>

          <div class="sd-palette-foot">
            <template v-if="normalMode">
              <span><kbd>j</kbd><kbd>k</kbd> choose</span>
              <span><kbd>gg</kbd><kbd>G</kbd> top/end</span>
              <span><kbd>↵</kbd> run</span>
              <span><kbd>i</kbd> type</span>
              <span><kbd>q</kbd> close</span>
            </template>
            <template v-else>
              <span><kbd>↑</kbd><kbd>↓</kbd> choose</span>
              <span><kbd>Tab</kbd> complete</span>
              <span><kbd>↵</kbd> run</span>
              <span><kbd>Esc</kbd> {{ query ? 'normal' : 'close' }}</span>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Takes no space: a wrapper that gives the box the dev tools'
   theme (sd-root + the dev tools' light/dark), over any page */
.sd-palette-scope {
  display: contents;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}

.sd-palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 15vh 16px 16px;
  background: var(--sd-scrim);
}

.sd-palette {
  width: 560px;
  max-width: 100%;
  overflow: hidden;
  color: var(--sd-text);
  background: var(--sd-bg);
  border: 1px solid var(--sd-line);
  border-radius: 10px;
  box-shadow: var(--sd-overlay-shadow);
}

/* The prompt line: a `:` glyph, then the input */
.sd-palette-prompt {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 14px;
  border-bottom: 1px solid var(--sd-line);
}

.sd-palette-glyph {
  font-family: var(--font-mono), ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 18px;
  font-weight: 700;
  color: var(--sd-accent);
}

.sd-palette-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  font-family: var(--font-mono), ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 15px;
  color: var(--sd-text);
  background: transparent;
  border: 0;
  outline: none;
  box-shadow: none;
}

.sd-palette-input.is-normal {
  caret-color: transparent;
}

/* Vim's mode tag, as noice shows it */
.sd-palette-mode {
  flex: none;
  padding: 0 6px;
  border-radius: 4px;
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  line-height: 18px;
  letter-spacing: 0.04em;
  color: var(--sd-bg);
  background: var(--sd-accent);
}

.sd-palette-input::placeholder {
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 13px;
  color: var(--sd-text-muted);
}

.sd-palette-error {
  padding: 6px 14px;
  font-size: var(--sd-font-sm);
  color: var(--sd-error);
  background: var(--sd-error-bg);
  border-bottom: 1px solid var(--sd-error-line);
}

.sd-palette-list {
  max-height: min(380px, 55vh);
  overflow-y: auto;
  margin: 0;
  padding: 4px;
  list-style: none;
  scrollbar-width: thin;
  scrollbar-color: var(--sd-scrollbar-thumb) transparent;
}

.sd-palette-group {
  padding: 8px 10px 4px;
  font-size: var(--sd-font-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--sd-text-muted);
}

.sd-palette-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: var(--sd-font-sm);
  cursor: pointer;
}

.sd-palette-row.is-selected {
  background: var(--sd-selected);
}

/* The rail's icon well */
.sd-palette-icon {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  color: var(--sd-text-muted);
  background: var(--sd-chrome);
}

.sd-palette-row.is-selected .sd-palette-icon {
  color: var(--sd-text);
  background: var(--sd-bg);
}

.sd-palette-icon :deep(svg) {
  width: 14px;
  height: 14px;
}

.sd-palette-name {
  flex: none;
  font-family: var(--font-mono), ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: var(--sd-font-sm);
  color: var(--sd-text-muted);
  white-space: pre;
}

.sd-palette-row.is-doc .sd-palette-name {
  font-family: inherit;
  color: var(--sd-text);
}

.sd-palette-name b {
  font-weight: 700;
  color: var(--sd-text);
}

.sd-palette-row.is-selected .sd-palette-name,
.sd-palette-row.is-current .sd-palette-name {
  color: var(--sd-text);
}

.sd-palette-sub {
  flex: none;
  max-width: 45%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--sd-text);
}

.sd-palette-alias {
  flex: none;
  padding: 0 5px;
  border-radius: 4px;
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: 10px;
  line-height: 16px;
  color: var(--sd-text-muted);
  background: var(--sd-chrome);
}

.sd-palette-desc {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--sd-text-muted);
}

.sd-palette-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sd-accent);
}

.sd-palette-kbd,
.sd-palette-foot kbd {
  flex: none;
  padding: 0 5px;
  border: 1px solid var(--sd-line);
  border-bottom-width: 2px;
  border-radius: 4px;
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: 10px;
  line-height: 15px;
  color: var(--sd-text-muted);
  background: var(--sd-chrome);
}

.sd-palette-empty {
  padding: 14px 10px;
  font-size: var(--sd-font-sm);
  color: var(--sd-text-muted);
}

.sd-palette-foot {
  display: flex;
  gap: 14px;
  padding: 6px 12px;
  border-top: 1px solid var(--sd-line);
  font-size: var(--sd-font-xs);
  color: var(--sd-text-muted);
  background: var(--sd-chrome);
}

.sd-palette-foot kbd {
  margin-right: 2px;
}

/* Open: the backdrop fades in, the box drops a few pixels */
.sd-palette-enter-active,
.sd-palette-leave-active {
  transition: opacity 0.12s ease;
}

.sd-palette-enter-active .sd-palette,
.sd-palette-leave-active .sd-palette {
  transition: transform 0.12s ease;
}

.sd-palette-enter-from,
.sd-palette-leave-to {
  opacity: 0;
}

.sd-palette-enter-from .sd-palette,
.sd-palette-leave-to .sd-palette {
  transform: translateY(-6px) scale(0.99);
}

@media (prefers-reduced-motion: reduce) {
  .sd-palette-enter-active,
  .sd-palette-leave-active,
  .sd-palette-enter-active .sd-palette,
  .sd-palette-leave-active .sd-palette {
    transition: none;
  }
}

@media (max-width: 480px) {
  .sd-palette-desc,
  .sd-palette-kbd,
  .sd-palette-foot {
    display: none;
  }
}
</style>
