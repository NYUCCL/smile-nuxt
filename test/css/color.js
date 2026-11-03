/**
 * Small color toolkit for the theme tests: read custom properties out of a
 * CSS file, resolve var() and color-mix(in oklab, …), and compute WCAG
 * contrast. Supports the formats the themes use: oklch(L C H), #rrggbb, and
 * color-mix(in oklab, <color> N%, <color>).
 */
import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'

export function readCss(relativeToRepo) {
  return readFileSync(resolvePath(__dirname, '../..', relativeToRepo), 'utf8')
}

/** Custom properties declared in every block whose selector list matches `selectorTest`. */
export function tokensIn(css, selectorTest) {
  const out = {}
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map(s => s.trim())
    if (!selectorTest(selectors)) continue
    for (const d of m[2].matchAll(/--([\w-]+):([^;]+);/g)) out[d[1]] = d[2].replace(/\/\*[\s\S]*?\*\//g, '').trim()
  }
  return out
}

const lin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

function hexToOklab(hex) {
  const [r, g, b] = [0, 2, 4].map(i => lin(Number.parseInt(hex.slice(i, i + 2), 16) / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** Split "a, b, c" at top-level commas (not inside parentheses). */
function splitArgs(text) {
  const parts = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')') depth--
    else if (text[i] === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(text.slice(start).trim())
  return parts
}

/** Oklab [L, a, b] of a color value, resolving var() against `tokens`. */
export function toOklab(tokens, value, depth = 0) {
  if (depth > 10) throw new Error(`var() loop at ${value}`)
  const v = value.trim()
  const ref = v.match(/^var\(--([\w-]+)\)$/)
  if (ref) {
    if (!(ref[1] in tokens)) throw new Error(`undefined token --${ref[1]}`)
    return toOklab(tokens, tokens[ref[1]], depth + 1)
  }
  const hex = v.match(/^#([0-9a-f]{6})$/i)
  if (hex) return hexToOklab(hex[1])
  const lch = v.match(/^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/)
  if (lch) {
    const [L, C, h] = lch.slice(1).map(Number)
    return [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)]
  }
  const mix = v.match(/^color-mix\(in oklab,(.*)\)$/)
  if (mix) {
    const [first, second] = splitArgs(mix[1])
    // "<color> N%": the percentage is the last word
    const space = first.lastIndexOf(' ')
    const percent = first.slice(space + 1)
    if (space < 0 || !percent.endsWith('%')) throw new Error(`can't read color-mix ${v}`)
    const p = Number(percent.slice(0, -1)) / 100
    const x = toOklab(tokens, first.slice(0, space), depth + 1)
    const y = toOklab(tokens, second, depth + 1)
    return x.map((c, i) => c * p + y[i] * (1 - p))
  }
  throw new Error(`can't read color ${v}`)
}

function luminance([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const [r, g, bl] = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(x => Math.min(Math.max(x, 0), 1))
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl
}

/** WCAG contrast ratio between two tokens. */
export function contrast(tokens, fg, bg) {
  const [hi, lo] = [luminance(toOklab(tokens, `var(--${fg})`)), luminance(toOklab(tokens, `var(--${bg})`))].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
