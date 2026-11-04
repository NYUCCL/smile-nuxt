/**
 * Ship the docs with the module, for coding agents (plans/docs_in_dev_tools.md,
 * Phase 1). Runs in prepack, after nuxt-module-build (which empties dist/).
 *
 * Copies the docs pages in the website's sidebar (docs/.vitepress/sidebar.mjs),
 * the example components (docs/examples/*.vue) and the SVG images
 * (docs/images/ and docs/public/images/) to dist/docs/, and writes two generated files next to
 * them:
 *
 *   dist/docs/INDEX.md    every page with its title, path and description,
 *                         grouped like the website's sidebar
 *   dist/docs/index.json  the same list, as data
 *
 * A project gets them at node_modules/@nyuccl/smile-nuxt/dist/docs/, always
 * matching the installed module. The template (start/AGENTS.md and the
 * smile-docs skill) only points there.
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKIP_DIRS = new Set(['node_modules', '.vitepress', 'public', 'images', 'examples'])

// Pages on disk that aren't in the sidebar, so aren't shipped: the website's
// home page, and a draft that's commented out of the sidebar. A test checks
// every other page is in the sidebar.
export const NOT_SHIPPED = ['index.md', 'styling/animations.md']

/** Every docs page, as a path relative to docsDir ('coding/steps.md'). */
export function listPages(docsDir) {
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path)
    return entry.name.endsWith('.md') ? [relative(docsDir, path)] : []
  })
  return walk(docsDir).sort()
}

/** The title (first # heading) and frontmatter description of a page. */
export function readPage(text) {
  let body = text
  let description = ''
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/)
  if (fm) {
    body = text.slice(fm[0].length)
    const line = fm[1].split('\n').find(l => l.startsWith('description:'))
    if (line) {
      const raw = line.slice('description:'.length).trim()
      try {
        description = raw.startsWith('"') ? JSON.parse(raw) : raw.replace(/^'|'$/g, '')
      }
      catch {
        description = raw
      }
    }
  }
  const heading = body.match(/^# (.+)$/m)
  const title = heading
    ? heading[1].replace(/<SmileText\s*\/>/g, 'SMILE').replace(/:[a-z_]+:/g, '').trim()
    : ''
  return { title, description }
}

/** A sidebar link ('/coding/steps', '/styling/imagesvideo.md') as a page path. */
export function linkToPath(link) {
  return link.replace(/^\//, '').replace(/\.md$/, '') + '.md'
}

/**
 * The sidebar's pages, grouped like the sidebar. Each page:
 * { path, title, description }.
 */
export function buildIndex(docsDir, sidebar) {
  const pages = new Map(listPages(docsDir).map((path) => {
    const info = readPage(readFileSync(join(docsDir, path), 'utf8'))
    return [path, { path, ...info }]
  }))
  return sidebar.map(section => ({
    section: section.text,
    pages: section.items.map((item) => {
      const path = linkToPath(item.link)
      const page = pages.get(path)
      if (!page) throw new Error(`The sidebar links to ${item.link}, but docs/${path} doesn't exist`)
      return { ...page, title: page.title || item.text }
    }),
  }))
}

export function indexMarkdown(sections, version) {
  const out = [
    `# SMILE docs (@nyuccl/smile-nuxt ${version})`,
    '',
    'The documentation for the version of SMILE installed in this project, as',
    'markdown. Each line below is a page: its title, its file (relative to this',
    'folder) and what it covers. The website has the same pages, with images',
    'and live examples: https://smile.gureckislab.org',
    '',
    'Reading the pages:',
    '',
    '- A link like `/coding/steps` or `/coding/steps#navigating-through-steps`',
    '  is the file `coding/steps.md` here (the part after `#` is a heading).',
    '- Outside code blocks, `<SmileText/>` is the word SMILE and',
    '  `<GureckisLabText/>` is \'the Gureckis Lab\'. `<ComponentViewer>` and',
    '  tags ending in `Example` show live examples on the website; their code',
    '  is in `examples/` (for example `examples/ButtonVariantsExample.vue`).',
    '- The diagrams (SVG) are in `images/`. Screenshots aren\'t included;',
    '  the website has them.',
    '- When a page and the code disagree, the code wins: it is in',
    '  `../runtime/` (composables in `composables/`, components in',
    '  `components/`).',
    '',
  ]
  for (const { section, pages } of sections) {
    out.push(`## ${section}`, '')
    for (const p of pages) {
      out.push(`- **${p.title}** (\`${p.path}\`)${p.description ? `: ${p.description}` : ''}`)
    }
    out.push('')
  }
  return out.join('\n')
}

export async function buildAgentDocs({ docsDir = join(repoRoot, 'docs'), outDir = join(repoRoot, 'dist/docs') } = {}) {
  const { sidebar } = await import(pathToFileURL(join(docsDir, '.vitepress/sidebar.mjs')).href)
  const { version } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
  const sections = buildIndex(docsDir, sidebar)

  rmSync(outDir, { recursive: true, force: true })
  for (const path of sections.flatMap(s => s.pages.map(p => p.path))) {
    mkdirSync(dirname(join(outDir, path)), { recursive: true })
    cpSync(join(docsDir, path), join(outDir, path))
  }
  // The examples as a project would write them (what the website shows).
  const { forReaders } = await import(pathToFileURL(join(docsDir, '.vitepress/theme/forReaders.js')).href)
  mkdirSync(join(outDir, 'examples'), { recursive: true })
  for (const file of readdirSync(join(docsDir, 'examples')).filter(f => f.endsWith('.vue'))) {
    writeFileSync(join(outDir, 'examples', file), forReaders(readFileSync(join(docsDir, 'examples', file), 'utf8')))
  }
  // The diagrams: small, and drawn as SVG, so agents can read them too and
  // the dev tools' Docs mode can show them offline. Screenshots stay out.
  mkdirSync(join(outDir, 'images'), { recursive: true })
  for (const dir of ['images', 'public/images']) {
    for (const file of readdirSync(join(docsDir, dir)).filter(f => f.endsWith('.svg'))) {
      cpSync(join(docsDir, dir, file), join(outDir, 'images', file))
    }
  }
  writeFileSync(join(outDir, 'INDEX.md'), indexMarkdown(sections, version))
  writeFileSync(join(outDir, 'index.json'), JSON.stringify({ version, sections }, null, 2) + '\n')
  const count = sections.reduce((n, s) => n + s.pages.length, 0)
  return { count, outDir }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { count, outDir } = await buildAgentDocs()
  console.log(`  ✔  ${count} docs pages copied to ${relative(repoRoot, outDir)}/ (INDEX.md, index.json)`)
}
