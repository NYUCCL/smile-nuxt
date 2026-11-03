import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Text contrast in the theme (#44). Reads the light (:root) and dark (.dark)
 * tokens from main.css and checks each text/background pair participants see
 * against WCAG AA (4.5:1 for normal text).
 */

const css = readFileSync(resolvePath(__dirname, '../../src/runtime/css/main.css'), 'utf8')

function block(selector) {
  const start = css.indexOf(`${selector} {`)
  return css.slice(start, css.indexOf('\n}', start))
}

function tokens(text) {
  const out = {}
  for (const m of text.matchAll(/--([\w-]+):([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

// :root holds the light theme; the first `:root {` block is the Tailwind
// @theme mapping, so take the one that defines --background.
const rootStart = css.indexOf('--background: oklch(1 0 0)')
const light = tokens(css.slice(css.lastIndexOf(':root', rootStart), css.indexOf('\n}', rootStart)))
const dark = { ...light, ...tokens(block('.dark')) }

function resolve(theme, value, depth = 0) {
  const ref = value.match(/^var\(--([\w-]+)\)$/)
  if (ref && depth < 5) return resolve(theme, theme[ref[1]], depth + 1)
  return value
}

const lin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** Linear-light sRGB of an oklch() or #hex color. */
function linearRGB(color) {
  const hex = color.match(/^#([0-9a-f]{6})$/i)
  if (hex) return [0, 2, 4].map(i => lin(Number.parseInt(hex[1].slice(i, i + 2), 16) / 255))
  const m = color.match(/^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/)
  if (!m) throw new Error(`can't read color ${color}`)
  const [L, C, h] = m.slice(1).map(Number)
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ].map(x => Math.min(Math.max(x, 0), 1))
}

function contrast(theme, fg, bg) {
  const lum = (name) => {
    const [r, g, b] = linearRGB(resolve(theme, theme[name]))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// [text, background]
const PAIRS = [
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

describe.each([['light', light], ['dark', dark]])('%s theme text contrast (#44)', (_name, theme) => {
  it.each(PAIRS)('%s on %s meets WCAG AA', (fg, bg) => {
    expect(contrast(theme, fg, bg)).toBeGreaterThanOrEqual(4.5)
  })
})
