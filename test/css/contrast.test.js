import { describe, it, expect } from 'vitest'
import { readCss, tokensIn, contrast } from './color.js'

/**
 * Text contrast in the themes, against WCAG AA (4.5:1 for normal text).
 *
 * - Participant theme (#44): main.css, light (:root/.light) and dark (.dark).
 * - Dev tools theme (plans/dev_tools_theming.md): dev-theme.css, every
 *   semantic text/background pair the dev tools draw, in both modes.
 */

const AA = 4.5

const main = readCss('src/runtime/css/main.css')
const lightParticipant = tokensIn(main, s => s.includes(':root') || s.includes('.light'))
const darkParticipant = { ...lightParticipant, ...tokensIn(main, s => s.includes('.dark')) }

// [text, background]
const PARTICIPANT_PAIRS = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['primary-foreground', 'primary'],
  ...['primary', 'info', 'success', 'warning', 'danger'].flatMap(v => [
    [`${v}-button-foreground`, `${v}-button`],
    [`${v}-button-light-foreground`, `${v}-button-light`],
  ]),
  ['window-sizer-text', 'window-sizer-bg'],
  ['window-sizer-bg', 'window-sizer-text'], // its button
  ['withdraw-text', 'withdraw-bg'],
  ['warning-text', 'warning-bg'],
]

describe.each([['light', lightParticipant], ['dark', darkParticipant]])('participant theme, %s: text contrast (#44)', (_name, theme) => {
  it.each(PARTICIPANT_PAIRS)('%s on %s meets WCAG AA', (fg, bg) => {
    expect(contrast(theme, fg, bg)).toBeGreaterThanOrEqual(AA)
  })
})

const dev = readCss('src/runtime/css/dev-theme.css')
const lightDev = tokensIn(dev, s => s.includes(':root') || s.includes('.light'))
const darkDev = { ...lightDev, ...tokensIn(dev, s => s.length === 1 && s[0] === '.dark') }

const DEV_SURFACES = ['sd-bg', 'sd-panel', 'sd-hover', 'sd-selected']
const DEV_PAIRS = [
  // body text and muted text on every surface
  ...DEV_SURFACES.flatMap(bg => [['sd-text', bg], ['sd-text-muted', bg]]),
  ['sd-selected-fg', 'sd-selected'],
  ['sd-selected-fg', 'sd-selected-hover'],
  // colored text on the plain surfaces
  ...['sd-link', 'sd-accent', 'sd-key', 'sd-value', 'sd-string', 'sd-number', 'sd-step-label', 'sd-step-path',
    'sd-step-index', 'sd-step-home', 'sd-log-error', 'sd-log-warn', 'sd-log-info', 'sd-ok', 'sd-warn', 'sd-error', 'sd-info']
    .flatMap(fg => [[fg, 'sd-bg'], [fg, 'sd-panel']]),
  // status text on its own tint
  ['sd-ok', 'sd-ok-bg'],
  ['sd-done', 'sd-done-bg'],
  ['sd-done', 'sd-panel'],
  ['sd-warn', 'sd-warn-bg'],
  ['sd-error', 'sd-error-bg'],
  ['sd-info', 'sd-info-bg'],
  // filled controls, brand button, pinned route, recruitment tiles
  // the recruit page's reading surface
  ['sd-text', 'sd-reading-bg'],
  ['sd-text-muted', 'sd-reading-bg'],
  ['sd-text-muted', 'sd-reading-card'],
  ['sd-link', 'sd-reading-bg'],
  ['sd-pinned-fg', 'sd-pinned'],
  ['sd-local-fg', 'sd-local-1'],
  ['sd-local-fg', 'sd-local-2'],
  ...['blue', 'teal', 'green', 'yellow', 'orange', 'red', 'purple', 'pink'].map(h => ['sd-tile-fg', `sd-tile-${h}`]),
]

// Every palette (src/runtime/css/dev-palettes.css) over the default, both modes
const palettesCss = readCss('src/runtime/css/dev-palettes.css')
const paletteNames = [...new Set([...palettesCss.matchAll(/data-sd-palette='([\w-]+)'/g)].map(m => m[1]))]
const devThemes = [['default light', lightDev], ['default dark', darkDev]]
for (const name of paletteNames) {
  devThemes.push([`${name} light`, { ...lightDev, ...tokensIn(palettesCss, s => s.includes(`[data-sd-palette='${name}'].light`)) }])
  devThemes.push([`${name} dark`, { ...darkDev, ...tokensIn(palettesCss, s => s.includes(`[data-sd-palette='${name}'].dark`)) }])
}

it('the palettes file defines palettes', () => {
  expect(paletteNames.length).toBeGreaterThan(0)
})

// Checked checkbox/switch: the mark is a graphic, not text, so it needs 3:1
// (WCAG 1.4.11, non-text contrast)
describe.each(devThemes)('dev tools theme, %s: control contrast', (_name, theme) => {
  it('the check mark on the solid fill is at least 3:1', () => {
    expect(contrast(theme, 'sd-solid-fg', 'sd-solid')).toBeGreaterThanOrEqual(3)
  })
})

describe.each(devThemes)('dev tools theme, %s: text contrast', (_name, theme) => {
  it.each(DEV_PAIRS)('%s on %s meets WCAG AA', (fg, bg) => {
    expect(contrast(theme, fg, bg)).toBeGreaterThanOrEqual(AA)
  })
})
