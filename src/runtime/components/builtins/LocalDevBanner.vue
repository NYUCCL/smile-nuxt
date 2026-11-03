<script setup>
/**
 * A small floating "local" tag at the top center of the page on the local dev
 * server (pnpm dev), so it's easy to tell from a deployed build. Hidden in
 * production builds. It looks like the "local" tag in the dev tools' toolbar;
 * hovered (or focused) it grows to offer a jump back to developer mode.
 *
 * - default: a link to /dev/ (the participant view, standalone presentation)
 * - inline: inside the dev tools (e.g. the dashboard); switches back to
 *   developer mode instead of navigating
 */
import useAPI from '../../composables/useAPI'

const props = defineProps({
  inline: { type: Boolean, default: false },
})

const isDev = import.meta.dev
const api = useAPI()

function openDevMode(event) {
  if (!props.inline) return // the link navigates
  event.preventDefault()
  api.store.dev.mainView = 'devmode'
}
</script>

<template>
  <a
    v-if="isDev"
    class="sd-local-pill"
    href="/dev/"
    title="Local dev server: open developer mode"
    @click="openDevMode"
  >
    <span class="sd-local-pill-tag">local</span>
    <span class="sd-local-pill-more">Open developer mode →</span>
  </a>
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

/* The extra label: collapsed until hover/focus, then slides open */
.sd-local-pill-more {
  max-width: 0;
  overflow: hidden;
  white-space: nowrap;
  opacity: 0;
  letter-spacing: 0;
  transition:
    max-width 0.25s ease,
    opacity 0.2s ease,
    padding 0.25s ease;
}

.sd-local-pill:hover .sd-local-pill-more,
.sd-local-pill:focus-visible .sd-local-pill-more {
  max-width: 160px;
  padding: 0 8px 0 6px;
  opacity: 1;
}

.sd-local-pill:focus-visible {
  outline: 2px solid var(--sd-accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .sd-local-pill-more {
    transition: none;
  }
}
</style>
