<script setup>
/**
 * A small floating "local" tag at the top center of the page on the local dev
 * server (pnpm dev), so it's easy to tell from a deployed build. Hidden in
 * production builds. It looks like the "local" tag in the dev tools' toolbar;
 * hovered (or focused) it slides open into a little button bar: zap (reset) the
 * local state (the dev toolbar's lightning bolt) and open developer mode.
 *
 * - default: "Developer mode" opens /dev/ in developer mode (not whichever
 *   view the dev tools were last left on)
 * - inline: inside the dev tools (e.g. the dashboard); switches back to
 *   developer mode instead of navigating
 */
import { nextTick } from 'vue'
import { BugPlay, Zap } from 'lucide-vue-next'
import useAPI from '../../composables/useAPI'

const props = defineProps({
  inline: { type: Boolean, default: false },
})

const isDev = import.meta.dev
const api = useAPI()

// The dev tools open on the last view saved in the dev cookie (it could be
// presentation mode), so pick developer mode before going there
async function openDevMode(event) {
  event.preventDefault()
  api.store.dev.mainView = 'devmode'
  if (props.inline) return
  await nextTick() // let the dev-sync watcher write the cookie
  window.location.href = '/dev/'
}
</script>

<template>
  <div
    v-if="isDev"
    class="sd-local-pill"
    role="toolbar"
    aria-label="Local dev server"
    tabindex="0"
  >
    <span class="sd-local-pill-tag">local</span>
    <span class="sd-local-pill-more">
      <button
        type="button"
        title="Zap local state (Ctrl + R)"
        @click="api.resetLocalState()"
      >
        <Zap />
        Zap
      </button>
      <a
        href="/dev/"
        title="Open developer mode"
        @click="openDevMode"
      >
        <BugPlay />
        Developer mode
      </a>
    </span>
  </div>
</template>

<style scoped>
.sd-local-pill {
  position: fixed;
  top: 6px;
  left: 50%;
  z-index: 9999;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  height: 20px;
  overflow: hidden;
  border-radius: 9999px;
  font-family: system-ui, sans-serif;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.04em;
  color: var(--sd-local-fg);
  text-decoration: none;
  background-color: var(--sd-local-1);
  box-shadow:
    inset 0 0 0 1px var(--sd-local-edge),
    0 1px 3px rgba(0, 0, 0, 0.15);
}

.sd-local-pill-tag {
  align-self: stretch;
  display: flex;
  align-items: center;
  padding: 0 7px;
  text-transform: uppercase;
  background: repeating-linear-gradient(-45deg, var(--sd-local-1) 0 5px, var(--sd-local-2) 5px 10px);
}

/* The button bar: collapsed until hover/focus, then slides open */
.sd-local-pill-more {
  display: flex;
  align-self: stretch;
  max-width: 0;
  overflow: hidden;
  white-space: nowrap;
  opacity: 0;
  letter-spacing: 0;
  transition:
    max-width 0.25s ease,
    opacity 0.2s ease,
}

.sd-local-pill:hover .sd-local-pill-more,
.sd-local-pill:focus-within .sd-local-pill-more {
  max-width: 260px;
  opacity: 1;
}

.sd-local-pill-more button,
.sd-local-pill-more a {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  color: inherit;
  font: inherit;
  text-decoration: none;
  cursor: pointer;
  border-left: 1px solid var(--sd-local-edge);
}

.sd-local-pill-more button:hover,
.sd-local-pill-more a:hover,
.sd-local-pill-more button:focus-visible,
.sd-local-pill-more a:focus-visible {
  outline: none;
  background-color: var(--sd-local-2);
}

.sd-local-pill-more svg {
  width: 12px;
  height: 12px;
}

.sd-local-pill:focus-visible {
  outline: 2px solid var(--sd-accent);
  outline-offset: 2px;
}

.sd-local-pill:focus {
  outline: none;
}

@media (prefers-reduced-motion: reduce) {
  .sd-local-pill-more {
    transition: none;
  }
}
</style>
