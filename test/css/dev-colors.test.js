import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Dev tools colors come only from the dev theme (src/runtime/css/dev-theme.css,
 * the --sd-* tokens) or the shared shadcn tokens the dev tools' controls are
 * built on. No raw colors, no Tailwind palette classes, and no tokens meant for
 * something else (chart-*, *-button, participant boxes). See
 * plans/dev_tools_theming.md.
 */

const repo = resolve(__dirname, '../..')

function vueFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return vueFiles(path)
    return name.endsWith('.vue') ? [path] : []
  })
}

const FILES = [
  ...vueFiles(join(repo, 'src/runtime/components/dev')),
  join(repo, 'src/runtime/layouts/development.vue'),
  join(repo, 'src/runtime/components/dev/docs/docs-prose.css'),
  join(repo, 'src/runtime/layouts/presentation.vue'),
]

// Shared shadcn tokens (the controls use them; .sd-root remaps the accent ones)
// and non-color layout variables.
const ALLOWED_VARS = new Set([
  'background', 'foreground', 'muted', 'muted-foreground', 'border', 'input', 'ring',
  'primary', 'primary-foreground', 'accent', 'accent-foreground', 'card', 'card-foreground',
  'popover', 'popover-foreground', 'secondary', 'secondary-foreground', 'destructive',
  'font-mono', 'sidebar-width-icon', 'device-width', 'device-height', 'toast-offset-x', 'toast-offset-y',
  // Docs mode's code blocks: the colors Shiki writes into each token (github-light / github-dark)
  'shiki-light', 'shiki-dark',
])

const PALETTE = 'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone'
const PROPS = 'bg|text|border|ring|fill|stroke|outline|decoration|divide|from|via|to|shadow|accent|caret'

const RULES = [
  ['raw oklch()/hsl() color', /\b(oklch|hsla?|lab|lch)\(/g],
  ['raw hex color', /(?<![\w&-])#(?:[\da-f]{3}){1,2}(?:[\da-f]{2})?(?=[\s;,)'"\]]|$)/gi],
  // Shadows may use black or white at low opacity; any other rgb() is a color.
  ['raw rgb() color', /rgba?\((?!\s*0,\s*0,\s*0\b)(?!\s*255,\s*255,\s*255\b)[^)]*\)/g],
  ['Tailwind palette class', new RegExp(`\\b(?:${PROPS})-(?:${PALETTE})-\\d{2,3}\\b`, 'g')],
  ['borrowed token', /\b(?:bg|text|border|fill|stroke|ring)-(?:chart-\d|[a-z]+-button[\w-]*|status-[\w-]+|dev-[\w-]+|window-sizer[\w-]*|withdraw[\w-]*|warning-[\w-]+)\b/g],
]

describe('dev tools use only themed colors', () => {
  it.each(FILES.map(f => [relative(repo, f)]))('%s', (file) => {
    const text = readFileSync(join(repo, file), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
    const problems = []
    for (const [label, pattern] of RULES) {
      for (const m of text.matchAll(pattern)) problems.push(`${label}: ${m[0]}`)
    }
    for (const m of text.matchAll(/var\(--([\w-]+)/g)) {
      if (!m[1].startsWith('sd-') && !ALLOWED_VARS.has(m[1])) problems.push(`non-dev token: var(--${m[1]})`)
    }
    expect(problems).toEqual([])
  })
})
