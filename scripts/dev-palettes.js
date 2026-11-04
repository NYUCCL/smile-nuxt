#!/usr/bin/env node
/**
 * Generates src/runtime/css/dev-palettes.css: the dev tools' palettes
 * (plans/dev_tools_theming.md, phase 3).
 *
 * A palette is its own neutrals plus eight named hues, light and dark. The
 * neutrals are used as given. The hues are taken from
 * the palette's own colors, keeping their hue and chroma, with the lightness
 * moved (if needed) until they read as text on the palette's surfaces: at
 * least TEXT_CONTRAST against both bg and surface. That's what lets a palette
 * like Nord or Solarized, whose accent colors are too light for text on a
 * light background, pass the contrast tests (test/css/contrast.test.js).
 *
 * Add a palette: add an entry to PALETTES, run `node scripts/dev-palettes.js`,
 * add its name to DEV_PALETTES in src/runtime/composables/useDevPalette.js,
 * and run the tests.
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const TEXT_CONTRAST = 5.2 // a margin over AA (4.5) for the status tints

const HUES = ['blue', 'teal', 'green', 'yellow', 'orange', 'red', 'purple', 'pink']

/* Each mode: neutrals [bg, surface, surface-2, border, fg, fg-muted] and
   the eight hues. surface is the chrome (rails, bars, tab strips); it may be
   darker than bg in dark mode (catppuccin, everforest, london), which sets the
   panels off from the content. Optional `accent`: the hue for focus rings and
   links-as-accent (default blue). */
const PALETTES = {
  github: {
    label: 'GitHub',
    light: {
      neutrals: ['#ffffff', '#f6f8fa', '#eaeef2', '#d1d9e0', '#1f2328', '#59636e'],
      hues: ['#0969da', '#1b7c83', '#1a7f37', '#9a6700', '#bc4c00', '#d1242f', '#8250df', '#bf3989'],
    },
    dark: {
      neutrals: ['#0d1117', '#151b23', '#212830', '#3d444d', '#f0f6fc', '#9198a1'],
      hues: ['#4493f8', '#39c5cf', '#3fb950', '#d29922', '#db6d28', '#f85149', '#ab7df8', '#db61a2'],
    },
  },
  nord: {
    label: 'Nord',
    light: {
      neutrals: ['#eceff4', '#e5e9f0', '#d8dee9', '#c8d0dc', '#2e3440', '#4c566a'],
      hues: ['#5e81ac', '#8fbcbb', '#a3be8c', '#ebcb8b', '#d08770', '#bf616a', '#b48ead', '#c895b4'],
    },
    dark: {
      neutrals: ['#2e3440', '#3b4252', '#434c5e', '#4c566a', '#eceff4', '#b4bccb'],
      hues: ['#81a1c1', '#88c0d0', '#a3be8c', '#ebcb8b', '#d08770', '#bf616a', '#b48ead', '#c895b4'],
    },
  },
  solarized: {
    label: 'Solarized',
    light: {
      neutrals: ['#fdf6e3', '#eee8d5', '#e4ddc8', '#d6cfb9', '#073642', '#52676f'],
      hues: ['#268bd2', '#2aa198', '#859900', '#b58900', '#cb4b16', '#dc322f', '#6c71c4', '#d33682'],
    },
    dark: {
      neutrals: ['#002b36', '#073642', '#0e4150', '#1d5261', '#eee8d5', '#93a1a1'],
      hues: ['#268bd2', '#2aa198', '#859900', '#b58900', '#cb4b16', '#dc322f', '#6c71c4', '#d33682'],
    },
  },
  catppuccin: {
    label: 'Catppuccin',
    light: { // Latte
      neutrals: ['#eff1f5', '#e6e9ef', '#dce0e8', '#ccd0da', '#4c4f69', '#5c5f77'],
      hues: ['#1e66f5', '#179299', '#40a02b', '#df8e1d', '#fe640b', '#d20f39', '#8839ef', '#ea76cb'],
    },
    dark: { // Mocha
      neutrals: ['#1e1e2e', '#181825', '#313244', '#45475a', '#cdd6f4', '#a6adc8'],
      hues: ['#89b4fa', '#94e2d5', '#a6e3a1', '#f9e2af', '#fab387', '#f38ba8', '#cba6f7', '#f5c2e7'],
    },
  },
  // Everforest and London follow tentacle's palettes (tentacle
  // app/assets/css/themes.css).
  everforest: {
    label: 'Everforest',
    light: {
      neutrals: ['#fdf6e3', '#f4f0d9', '#e6e2cc', '#d5d1bb', '#434f57', '#829181'],
      hues: ['#3a94c5', '#35a77c', '#8da101', '#b38600', '#f57d26', '#f85552', '#df69ba', '#ec5f88'],
    },
    dark: {
      neutrals: ['#2d353b', '#272e33', '#343f44', '#475258', '#e0d6bd', '#9da9a0'],
      hues: ['#7fbbb3', '#83c092', '#a7c080', '#dbbc7f', '#e69875', '#e67e80', '#d699b6', '#e08a9e'],
    },
  },
  london: {
    label: 'London',
    accent: 'yellow', // gold
    light: {
      neutrals: ['#f3eee3', '#e7e0d1', '#dcd3c1', '#cfc6b3', '#18232d', '#5b6c78'],
      hues: ['#35698e', '#3c7f7f', '#567a4c', '#7f6224', '#ad6538', '#b44c4b', '#7c6187', '#9a5670'],
    },
    dark: {
      neutrals: ['#18232d', '#121b24', '#263541', '#2e404d', '#dedbd2', '#91a0a9'],
      hues: ['#8eafc7', '#8dbbbb', '#99b391', '#d4b477', '#d99c72', '#df7776', '#b6a0bd', '#cf8ea2'],
    },
  },
}

/* ---- color math (sRGB <-> OKLab/OKLCH, WCAG luminance) ------------------- */

const lin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

function hexToOklab(hex) {
  const [r, g, b] = [1, 3, 5].map(i => lin(Number.parseInt(hex.slice(i, i + 2), 16) / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(x => Math.min(Math.max(x, 0), 1))
}

const luminance = (lab) => {
  const [r, g, b] = oklabToLinear(lab)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(x, y) {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

/** color-mix(in oklab, x p, y) */
const mix = (x, y, p) => x.map((v, i) => v * p + y[i] * (1 - p))

const toLch = ([L, a, b]) => [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360]
const fromLch = ([L, C, h]) => [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)]
const fmt = ([L, C, h]) => `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${h.toFixed(1)})`

/**
 * Move a color's lightness (keeping hue and chroma) toward `direction`
 * (-1 darker, +1 lighter) until it has `target` contrast with every
 * background. Colors that already pass are left alone.
 */
function fitLightness(hex, backgrounds, target, direction, tintOver = null) {
  let [L, C, h] = toLch(hexToOklab(hex))
  // tintOver: also read on its own tint (the status backgrounds: 15% of the
  // color over the palette's background)
  const ok = (l) => {
    const c = fromLch([l, C, h])
    const bgs = tintOver ? [...backgrounds, mix(c, tintOver, 0.15)] : backgrounds
    return bgs.every(bg => contrast(c, bg) >= target)
  }
  while (!ok(L) && L > 0.05 && L < 0.98) L += direction * 0.005
  return [L, C, h]
}

/* ---- build --------------------------------------------------------------- */

function modeBlock(spec, dark, accent) {
  const [bg, surface, surface2, border, fg, fgMuted] = spec.neutrals
  const backgrounds = [bg, surface].map(hexToOklab)
  const direction = dark ? 1 : -1
  const hues = spec.hues.map(hex => fitLightness(hex, backgrounds, TEXT_CONTRAST, direction, hexToOklab(bg)))
  // Muted text also sits on hover (surface-2) and the selected tint (28% blue)
  const selected = mix(fromLch(hues[0]), hexToOklab(bg), 0.28)
  const muted = fitLightness(fgMuted, [...backgrounds, hexToOklab(surface2), selected], 4.6, direction)
  const lines = [
    ['bg', bg], ['surface', surface], ['surface-2', surface2], ['border', border], ['fg', fg],
  ].map(([k, v]) => `  --sd-p-${k}: ${fmt(toLch(hexToOklab(v)))};`)
  lines.push(`  --sd-p-fg-muted: ${fmt(muted)};`)
  // Checked controls: a soft near-foreground fill, as light as it can be
  // while the mark (the background color) still has 3:1 on it
  let p = 0.58
  while (contrast(mix(hexToOklab(fg), hexToOklab(bg), p), hexToOklab(bg)) < 3.2 && p < 1) p += 0.02
  lines.push(`  --sd-p-solid: color-mix(in oklab, var(--sd-p-fg) ${Math.round(p * 100)}%, var(--sd-p-bg));`)
  HUES.forEach((name, i) => {
    lines.push(`  --sd-p-${name}: ${fmt(hues[i])};`)
  })
  lines.push(`  --sd-p-accent: var(--sd-p-${accent ?? 'blue'});`)
  return lines.join('\n')
}

let css = `/* Dev tools palettes. GENERATED by scripts/dev-palettes.js: edit the
   palettes there and rerun it (node scripts/dev-palettes.js).

   Each palette replaces the default palette's primitives (--sd-p-*, in
   dev-theme.css) when the dev tools pick it (data-sd-palette on <html>).
   Hues keep the palette's own hue and chroma; their lightness is adjusted
   to read as text on the palette's surfaces. The "local" stripes keep the
   default caution yellow. */
`
for (const [name, p] of Object.entries(PALETTES)) {
  css += `
/* ${p.label} */
[data-sd-palette='${name}'].light,
[data-sd-palette='${name}'] .light {
${modeBlock(p.light, false, p.accent)}
}

[data-sd-palette='${name}'].dark,
[data-sd-palette='${name}'] .dark {
${modeBlock(p.dark, true, p.accent)}
}
`
}

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../src/runtime/css/dev-palettes.css')
writeFileSync(out, css)
console.log(`wrote ${out}`)
