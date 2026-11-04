import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { buildAgentDocs } from '../../scripts/build-agent-docs.mjs'
import { createDocs, prepareMarkdown, resolveTarget, slugify, websiteUrl } from '../../src/runtime/server/dev/renderDocs.js'

/**
 * The dev tools' Docs mode renderer (src/runtime/server/dev/renderDocs.js),
 * and every shipped page through it.
 */

describe('docs renderer: pieces', () => {
  it('slugs headings like VitePress', () => {
    expect(slugify('The Design File (design.js)')).toBe('the-design-file-design-js')
    expect(slugify('Persisting data for the view (not just a step)')).toBe('persisting-data-for-the-view-not-just-a-step')
    expect(slugify('stepData vs stepDataLeaf')).toBe('stepdata-vs-stepdataleaf')
    expect(slugify('1. First')).toBe('_1-first')
  })

  it('makes the Vue in a page readable', () => {
    const md = '---\ndescription: "x"\n---\n\n<script setup>\nimport X from \'../examples/X.vue?raw\'\n</script>\n\n# Hi <SmileText/>\n\nWrite `<Button>` here.\n\n```vue\n<Button>kept</Button>\n```\n'
    const out = prepareMarkdown(md, 'a.md')
    expect(out).not.toContain('<script')
    expect(out).toContain('# Hi SMILE')
    expect(out).toContain('`<Button>`') // inline code is literal
    expect(out).toContain('<Button>kept</Button>') // and so is fenced code
  })

  it('turns a live example into a note and its source', () => {
    const md = '<ComponentViewer\n  name="Buttons"\n  description="Some buttons"\n  :raw-code="ButtonsExampleRaw"\n>\n  <ButtonsExample />\n</ComponentViewer>\n'
    const out = prepareMarkdown(md, 'styling/uikit.md', name => name === 'ButtonsExample' ? '<template>\n  <Button>Go</Button>\n</template>\n' : '')
    expect(out).toContain('Live example: Buttons')
    expect(out).toContain(websiteUrl('styling/uikit.md'))
    expect(out).toContain('```vue\n<template>\n  <Button>Go</Button>')
  })

  it('resolves links from the page they are on', () => {
    expect(resolveTarget('/coding/steps#x', 'api.md')).toEqual({ path: 'coding/steps', hash: 'x' })
    expect(resolveTarget('./steps.md', 'coding/timeline.md')).toEqual({ path: 'coding/steps.md', hash: '' })
    expect(resolveTarget('../images/a.svg', 'recruit/deploying.md')).toEqual({ path: 'images/a.svg', hash: '' })
    expect(resolveTarget('#here', 'api.md')).toEqual({ hash: 'here' })
    expect(resolveTarget('https://example.org', 'api.md')).toEqual({ external: 'https://example.org' })
  })
})

describe('docs renderer: the shipped pages', () => {
  let tmp
  let docs
  let rendered

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'smile-docs-render-'))
    await buildAgentDocs({ outDir: join(tmp, 'docs') })
    docs = createDocs(join(tmp, 'docs'))
    const paths = docs.index().sections.flatMap(s => s.pages.map(p => p.path))
    rendered = Object.fromEntries(paths.map(p => [p, docs.page(p)]))
  })

  afterAll(() => rmSync(tmp, { recursive: true, force: true }))

  const ids = page => new Set([...page.html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]))

  it('renders every page', () => {
    expect(Object.keys(rendered).length).toBeGreaterThan(30)
    for (const page of Object.values(rendered)) expect(page.html.length, page.path).toBeGreaterThan(100)
  })

  it('leaves no VitePress syntax or Vue components in the text', () => {
    const leftovers = []
    for (const page of Object.values(rendered)) {
      const text = page.html.replace(/<pre>[\s\S]*?<\/pre>/g, '').replace(/<code>[\s\S]*?<\/code>/g, '')
      for (const [re, what] of [[/^:::/m, 'a ::: container'], [/\{#[\w-]+\}/, 'a {#id}'], [/<script/, '<script>'], [/<[A-Z][A-Za-z]+[\s/>]/, 'a component tag'], [/\[\[toc\]\]/, '[[toc]]']]) {
        if (re.test(text)) leftovers.push(`${page.path}: ${what}`)
      }
    }
    expect(leftovers).toEqual([])
  })

  it('links only to pages and headings that exist', () => {
    const broken = []
    for (const page of Object.values(rendered)) {
      for (const m of page.html.matchAll(/data-docs-page="([^"]+)"(?: data-docs-hash="([^"]+)")?/g)) {
        const target = rendered[m[1]]
        if (!target) broken.push(`${page.path} -> ${m[1]}`)
        else if (m[2] && !ids(target).has(m[2])) broken.push(`${page.path} -> ${m[1]}#${m[2]}`)
      }
      for (const m of page.html.matchAll(/<a href="#([^"]+)" data-docs-hash/g)) {
        if (!ids(page).has(m[1])) broken.push(`${page.path} -> #${m[1]}`)
      }
    }
    expect(broken, 'fix these links in docs/ (VitePress does not check #anchors)').toEqual([])
  })

  it('serves the diagrams that ship, and links out for the rest', () => {
    const timeline = rendered['coding/timeline.md'].html
    expect(timeline).toContain('<img src="/__smile/docs/images/timeline.svg"')
    expect(docs.image('timeline.svg')).not.toBeNull()
    expect(docs.image('../index.json')).toBeNull()
    const recruitment = rendered['recruit/recruitment.md'].html
    expect(recruitment).toContain('class="sd-docs-figure"')
  })

  it('finds a section by its words', () => {
    const [first] = docs.search('randomized node')
    expect(first).toMatchObject({ path: 'coding/timeline.md', hash: 'randomized-nodes' })
    expect(docs.search('')).toEqual([])
  })

  it('refuses paths that are not docs pages', () => {
    expect(docs.page('../package.json')).toBeNull()
    expect(docs.page('index.md')).toBeNull()
  })
})
