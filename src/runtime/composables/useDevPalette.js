/**
 * The dev tools' palette (plans/dev_tools_theming.md, phase 3).
 *
 * The palette is a dev setting (store.dev.devPalette, kept in the dev cookie
 * like the dev tools' mode). It's applied as data-sd-palette on <html>, which
 * swaps the dev tools' color primitives (src/runtime/css/dev-palettes.css).
 * Only the dev tools read those colors, so participant views and the
 * experiment preview are unaffected.
 */
import { computed } from 'vue'
import { useHead } from '#imports'
import useAPI from './useAPI'

/** The palettes, in picker order. 'default' is dev-theme.css's own. */
export const DEV_PALETTES = [
  { value: 'default', label: 'Smile' },
  { value: 'github', label: 'GitHub' },
  { value: 'nord', label: 'Nord' },
  { value: 'solarized', label: 'Solarized' },
  { value: 'catppuccin', label: 'Catppuccin' },
  { value: 'everforest', label: 'Everforest' },
  { value: 'london', label: 'London' },
]

const known = new Set(DEV_PALETTES.map(p => p.value))

/** A stored setting, as a palette that exists (anything else is 'default'). */
export function normalizeDevPalette(value) {
  return known.has(value) ? value : 'default'
}

/** The current palette, read/write */
export function useDevPalette() {
  const api = useAPI()
  return computed({
    get: () => normalizeDevPalette(api.store.dev.devPalette),
    set: (value) => {
      api.store.dev.devPalette = normalizeDevPalette(value)
    },
  })
}

/** Put the current palette on <html>. Call once from each dev layout. */
export function applyDevPalette() {
  const palette = useDevPalette()
  useHead({ htmlAttrs: { 'data-sd-palette': palette } })
  return palette
}
