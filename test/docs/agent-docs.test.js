import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { NOT_SHIPPED, buildAgentDocs, buildIndex, linkToPath, listPages, readPage } from '../../scripts/build-agent-docs.mjs'
import { sidebar } from '../../docs/.vitepress/sidebar.mjs'

/**
 * The docs that ship in the package for coding agents
 * (scripts/build-agent-docs.mjs, plans/docs_in_dev_tools.md Phase 1).
 */

const docsDir = resolve(__dirname, '../../docs')

describe('agent docs: reading pages', () => {
  it('reads the title and a JSON-quoted description', () => {
    const page = readPage('---\ndescription: "Steps: trials and blocks."\n---\n\n# Stepping <SmileText/> Views\n\ntext')
    expect(page).toEqual({ title: 'Stepping SMILE Views', description: 'Steps: trials and blocks.' })
  })

  it('drops emoji shortcodes from titles', () => {
    expect(readPage('# :lady_beetle: Testing\n').title).toBe('Testing')
  })

  it('turns sidebar links into page paths', () => {
    expect(linkToPath('/coding/steps')).toBe('coding/steps.md')
    expect(linkToPath('/styling/imagesvideo.md')).toBe('styling/imagesvideo.md')
  })
})

describe('agent docs: the index', () => {
  const sections = buildIndex(docsDir, sidebar)
  const shipped = sections.flatMap(s => s.pages)

  it('covers every page except the ones on purpose left out', () => {
    const inSidebar = new Set(shipped.map(p => p.path))
    const missing = listPages(docsDir).filter(p => !inSidebar.has(p) && !NOT_SHIPPED.includes(p))
    expect(missing, 'add these to docs/.vitepress/sidebar.mjs, or to NOT_SHIPPED').toEqual([])
  })

  it('gives every page a title and a description', () => {
    const incomplete = shipped.filter(p => !p.title || !p.description).map(p => p.path)
    expect(incomplete, 'add a # title and a description: to these pages').toEqual([])
  })

  it('never ships index.md (it would collide with INDEX.md on macOS)', () => {
    expect(shipped.map(p => p.path.toLowerCase())).not.toContain('index.md')
  })
})

describe('agent docs: the build', () => {
  let outDir

  beforeAll(async () => {
    outDir = join(mkdtempSync(join(tmpdir(), 'smile-agent-docs-')), 'docs')
    await buildAgentDocs({ outDir })
  })

  afterAll(() => rmSync(resolve(outDir, '..'), { recursive: true, force: true }))

  it('writes every page INDEX.md lists', () => {
    const index = readFileSync(join(outDir, 'INDEX.md'), 'utf8')
    const paths = [...index.matchAll(/^- \*\*.+?\*\* \(`([^`]+)`\)/gm)].map(m => m[1])
    expect(paths.length).toBeGreaterThan(30)
    expect(paths.filter(p => !existsSync(join(outDir, p)))).toEqual([])
  })

  it('copies pages unchanged', () => {
    const page = 'coding/steps.md'
    expect(readFileSync(join(outDir, page), 'utf8')).toBe(readFileSync(join(docsDir, page), 'utf8'))
  })

  it('ships the examples without the docs-site imports', () => {
    const examples = readdirSync(join(outDir, 'examples'))
    expect(examples.length).toBeGreaterThan(10)
    const withImports = examples.filter(f => readFileSync(join(outDir, 'examples', f), 'utf8').includes('@/runtime/'))
    expect(withImports).toEqual([])
  })

  it('writes index.json with the version', () => {
    const data = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8'))
    const { version } = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8'))
    expect(data.version).toBe(version)
    expect(data.sections.length).toBe(sidebar.length)
  })
})
