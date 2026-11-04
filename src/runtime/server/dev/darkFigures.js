/**
 * Dark-mode copies of the docs' diagrams, for Docs mode (dev server only).
 *
 * Ported from the CCM book (Todd's `src/styles/darkFigures.mjs`), whose figure
 * style the SMILE docs follow. darkSvg() recolors a light figure with one rule,
 * in OKLab: grays flip their lightness (white paper, ink text -> dark paper,
 * light text), pale colored fills become a mid-dark shade of the same hue, and
 * data colors keep their hue and are lifted a little. The dark files are made
 * when asked for, never committed, so they can't go stale.
 *
 * lightFigure() / darkFigure() take a book-style figure (a full-size white
 * background rect first) and make that background transparent, so the figure
 * sits on the dev tools' page whatever the palette; darkFigure() recolors it
 * too. Other images (the logo) get null and are served as they are.
 */

// The dark background the colors are worked out against (VitePress's dark
// page) and the light ink
const BG = '#1b1b1f'
const FG = '#e6e6e6'

const OVERRIDES = {
  '#ffffff': BG,
  '#000000': FG,
  '#050505': FG,
}

// ---- color math ----------------------------------------------------------

const clamp01 = v => Math.min(1, Math.max(0, v))
const toLin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGam = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

function rgbToOklab([r, g, b]) {
  const [R, G, B] = [r, g, b].map(v => toLin(v / 255))
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function oklabToLinRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

// OKLab to sRGB, pulling chroma in until the color fits the gamut
function oklabToRgb([L, a, b]) {
  let k = 1
  for (let i = 0; i < 30; i++) {
    const lin = oklabToLinRgb([L, a * k, b * k])
    if (lin.every(v => v >= -1e-4 && v <= 1 + 1e-4)) break
    k *= 0.95
  }
  return oklabToLinRgb([L, a * k, b * k]).map(v => Math.round(clamp01(toGam(clamp01(v))) * 255))
}

const hex2 = v => v.toString(16).padStart(2, '0')
const toHex = ([r, g, b]) => '#' + hex2(r) + hex2(g) + hex2(b)

const NAMED = { white: '#ffffff', black: '#000000' }

// '#abc', '#aabbcc', 'white', 'rgb(1,2,3)', 'rgba(1,2,3,0.5)' -> { rgb, alpha } or null
function parse(color) {
  const c = color.trim().toLowerCase()
  if (NAMED[c]) return parse(NAMED[c])
  let m = c.match(/^#([0-9a-f]{3})$/)
  if (m) return { rgb: [...m[1]].map(h => Number.parseInt(h + h, 16)), alpha: null }
  m = c.match(/^#([0-9a-f]{6})$/)
  if (m) return { rgb: [0, 2, 4].map(i => Number.parseInt(m[1].slice(i, i + 2), 16)), alpha: null }
  m = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/)
  if (m) return { rgb: [+m[1], +m[2], +m[3]], alpha: m[4] === undefined ? null : +m[4] }
  return null
}

const L_BG = rgbToOklab(parse(BG).rgb)[0]
const L_FG = rgbToOklab(parse(FG).rgb)[0]

function darkRgb(rgb) {
  const key = toHex(rgb)
  if (OVERRIDES[key]) return parse(OVERRIDES[key]).rgb
  const [L, a, b] = rgbToOklab(rgb)
  const C = Math.hypot(a, b)
  // grays and near-white tints: straight flip between the dark ink and the background
  if (C < 0.03) return oklabToRgb([L_FG + L * (L_BG - L_FG), a, b])
  // Colored: two rules, blended across L = 0.7 to 0.85 so neighbouring shades
  // (the block-face ramp) do not jump.
  //  - pale colored fills become a mid-dark shade of the same hue, light enough
  //    to stand off the background and dark enough to hold light text, with a
  //    little more chroma so the hue still reads at the lower lightness;
  //    saturated ones (the highlight) stay a step lighter so they still glow
  //  - colors that carry data keep their hue and are lifted halfway toward 0.7
  const pale = 0.55 - Math.max(0, L - 0.8) + 0.8 * C
  const data = L < 0.7 ? L + (0.7 - L) * 0.5 : L
  const t = Math.min(1, Math.max(0, (L - 0.7) / 0.15))
  const k = 1 + 0.4 * t
  return oklabToRgb([data + (pale - data) * t, a * k, b * k])
}

const cache = new Map()
// The dark counterpart of one color string. Anything it cannot parse (none,
// currentColor, url(#grad), a CSS variable) comes back unchanged.
export function darkColor(color) {
  if (cache.has(color)) return cache.get(color)
  const p = parse(color)
  let out = color
  if (p) {
    const rgb = darkRgb(p.rgb)
    out = p.alpha === null ? toHex(rgb) : `rgba(${rgb.join(', ')}, ${p.alpha})`
  }
  cache.set(color, out)
  return out
}

// ---- static SVG files -----------------------------------------------------

// (not a url(#id) reference: a gradient id such as cb0 reads as a hex color)
const COLOR = /(?<!url\()(?:#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b)|rgba?\([\d.\s,]+\)/g
const PAINT_ATTR = /(?<![\w-])(fill|stroke|stop-color|flood-color|lighting-color|color)="([^"]*)"/g

// A light-mode SVG file as its dark-mode counterpart. Colors are recolored in
// paint attributes, in style attributes and in any <style> element. The root
// gets an explicit fill so that text and shapes that relied on SVG's default
// black fill come out in the light ink instead.
//
// An element marked data-dark="keep" keeps its colors: an object that is black
// in the world (the Atari screen) rather than black because it is ink. It
// covers that element's own paint only. data-dark="keep-all" on a <g> covers
// everything inside the group, for a drawn object that keeps its own paper and
// ink (a magazine cover, a card with words on it). A keep-all group with no
// fill of its own is given the light file's root fill (black if the root sets
// none), so that what it inherits does not change with the dark copy's root.
//
// An element with data-dark-fill="<color>" (or data-dark-stroke) takes that
// color in dark mode instead of the derived one. It is for the few places the
// rule cannot serve, such as grey notes inside a pale colored box, where the
// derived box and the derived grey land on the same lightness.
export function darkSvg(svg) {
  const rootFill = svg.match(/<svg\b[^>]*?\sfill="([^"]*)"/)?.[1] ?? '#000000'
  const kept = [] // one entry per open <g>: is it inside a keep-all group?
  let out = svg
    .replace(/<\/?[a-z][^>]*>/gi, (tag) => {
      const inKept = kept.length > 0 && kept[kept.length - 1]
      if (tag.startsWith('</')) {
        if (/^<\/g\b/.test(tag)) kept.pop()
        return tag
      }
      const keepAll = /\bdata-dark="keep-all"/.test(tag)
      if (/^<g\b/.test(tag) && !tag.endsWith('/>')) {
        kept.push(inKept || keepAll)
        if (keepAll && !inKept && !/\sfill="/.test(tag)) return tag.replace(/^<g\b/, `<g fill="${rootFill}"`)
      }
      // kept paint is left alone, but a pinned dark color still applies (a kept
      // white card can take a light grey in dark mode with data-dark-fill)
      if (inKept || keepAll || /\bdata-dark="keep"/.test(tag)) return pinColors(tag)
      return pinColors(
        tag
          .replace(PAINT_ATTR, (_, attr, val) => `${attr}="${val.replace(COLOR, darkColor).replace(/^(white|black)$/i, darkColor)}"`)
          .replace(/\bstyle="([^"]*)"/g, (_, css) => `style="${recolorCss(css)}"`),
      )
    })
    .replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g, (_, a, css, b) => a + recolorCss(css) + b)
  out = out.replace(/<svg\b([^>]*)>/, (tag, attrs) => (/\sfill="/.test(attrs) ? tag : `<svg${attrs} fill="${FG}">`))
  return out
}

// data-dark-fill / data-dark-stroke: set that paint in the dark copy
function pinColors(tag) {
  for (const attr of ['fill', 'stroke']) {
    const pin = tag.match(new RegExp(`\\bdata-dark-${attr}="([^"]*)"`))
    if (!pin) continue
    const re = new RegExp(`(\\s)${attr}="[^"]*"`)
    tag = re.test(tag) ? tag.replace(re, `$1${attr}="${pin[1]}"`) : tag.replace(/^<([a-z]+)/i, `<$1 ${attr}="${pin[1]}"`)
  }
  return tag
}

function recolorCss(css) {
  return css
    .replace(COLOR, darkColor)
    .replace(/((?:fill|stroke|stop-color|color)\s*:\s*)(white|black)\b/gi, (_, p, c) => p + darkColor(c))
}

// A book-style figure: <svg viewBox="0 0 760 H"> with <rect width="760" … fill="white"/> first
const BACKGROUND = /^(\s*<svg\b[^>]*>\s*(?:<(?:title|desc|defs|style)\b[\s\S]*?<\/(?:title|desc|defs|style)>\s*)*)<rect width="760" height="(\d+(?:\.\d+)?)" fill="(?:white|#fff|#ffffff)"\s*\/>/i

/**
 * A diagram on no background, so it sits on the dev tools' page whatever the
 * palette, or null if it isn't a book-style figure.
 */
export function lightFigure(svg) {
  const text = svg.replace(/^\s*<\?xml[^>]*>\s*/, '')
  return BACKGROUND.test(text) ? text.replace(BACKGROUND, '$1<rect width="760" height="$2" fill="none"/>') : null
}

/** The dark copy of a diagram (also on no background), or null if it isn't a book-style figure. */
export function darkFigure(svg) {
  const light = lightFigure(svg)
  return light && darkSvg(light)
}
