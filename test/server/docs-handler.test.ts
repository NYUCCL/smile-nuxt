// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer, type TestServer, type Browser } from './handler-helpers'

vi.mock('h3', async () => (await import('./handler-helpers')).loadH3())
vi.mock('nitropack/runtime', async () => (await import('./handler-helpers')).nitroRuntime())

/**
 * The dev tools' docs routes (server/dev/docs.ts) over a small docs folder.
 * The renderer itself is tested in test/docs/docs-render.test.js.
 */

const FIGURE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 100"><rect width="760" height="100" fill="white"/><text fill="#000000">hi</text></svg>'
const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="4" fill="#ff0000"/></svg>'
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBP')])

let docsDir: string
let server: TestServer
let browser: Browser

beforeAll(async () => {
  docsDir = mkdtempSync(join(tmpdir(), 'smile-docs-handler-'))
  mkdirSync(join(docsDir, 'coding'))
  mkdirSync(join(docsDir, 'images'))
  writeFileSync(join(docsDir, 'index.json'), JSON.stringify({
    sections: [
      { section: 'Start', pages: [{ path: 'intro.md', title: 'Introduction' }] },
      { section: 'Coding', pages: [{ path: 'coding/steps.md', title: 'Steps' }] },
    ],
  }))
  writeFileSync(join(docsDir, 'intro.md'), '# Introduction\n\nWelcome to the study builder.\n\n## Setting up\n\nInstall the zebra package first.\n')
  writeFileSync(join(docsDir, 'coding', 'steps.md'), '# Steps\n\nA step is one trial.\n\n```js\nconst a = 1\n```\n')
  writeFileSync(join(docsDir, 'secret.md'), '# Not in the index\n')
  writeFileSync(join(docsDir, 'images', 'figure.svg'), FIGURE)
  writeFileSync(join(docsDir, 'images', 'logo.svg'), LOGO)
  writeFileSync(join(docsDir, 'images', 'shot.webp'), WEBP)
  writeFileSync(join(docsDir, 'images', 'notes.txt'), 'not an image')
  vi.stubGlobal('__SMILE_DOCS_DIR__', docsDir)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  server = await startServer({ docs: true })
  browser = server.browser()
})
afterAll(() => {
  server.close()
  rmSync(docsDir, { recursive: true, force: true })
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('GET /__smile/docs/...', () => {
  it('index returns the page list', async () => {
    const reply = await browser.get('/__smile/docs/index')
    expect(reply.status).toBe(200)
    expect(reply.body.sections.map((s: { section: string }) => s.section)).toEqual(['Start', 'Coding'])
  })

  it('page returns a rendered page, with its title and headings', async () => {
    const reply = await browser.get('/__smile/docs/page?path=intro.md')
    expect(reply.status).toBe(200)
    expect(reply.body.title).toBe('Introduction')
    expect(reply.body.html).toContain('Welcome to the study builder.')
    expect(JSON.stringify(reply.body.headings)).toContain('Setting up')
  })

  it('page finds a page in a folder, and highlights its code', async () => {
    const reply = await browser.get('/__smile/docs/page?path=' + encodeURIComponent('coding/steps.md'))
    expect(reply.status).toBe(200)
    expect(reply.body.html).toContain('A step is one trial.')
    expect(reply.body.html).toMatch(/<span[^>]*style=/) // the highlighter's colored spans
  })

  it('page answers 404 for a path that is missing, not in the index, or outside the folder', async () => {
    for (const path of ['', 'nope.md', 'secret.md', '../package.json', 'index.json']) {
      const reply = await browser.get('/__smile/docs/page?path=' + encodeURIComponent(path))
      expect(reply.status, path).toBe(404)
      expect(reply.body.statusMessage).toBe('No such docs page')
    }
    expect((await browser.get('/__smile/docs/page')).status).toBe(404)
  })

  it('search returns the sections that match, and nothing for no words', async () => {
    const found = await browser.get('/__smile/docs/search?q=zebra')
    expect(found.status).toBe(200)
    expect(found.body).toHaveLength(1)
    expect(found.body[0].path).toBe('intro.md')
    expect((await browser.get('/__smile/docs/search?q=')).body).toEqual([])
    expect((await browser.get('/__smile/docs/search')).body).toEqual([])
    expect((await browser.get('/__smile/docs/search?q=xylophone')).body).toEqual([])
  })

  it('images returns a diagram as SVG, on no background', async () => {
    const reply = await browser.get('/__smile/docs/images/figure.svg')
    expect(reply.status).toBe(200)
    expect(reply.headers.get('content-type')).toBe('image/svg+xml')
    expect(reply.text).toContain('<rect width="760" height="100" fill="none"/>')
  })

  it('images returns the dark copy of a diagram, and none for an image that is not a diagram', async () => {
    const dark = await browser.get('/__smile/docs/images/figure.dark.svg')
    expect(dark.status).toBe(200)
    expect(dark.headers.get('content-type')).toBe('image/svg+xml')
    expect(dark.text).not.toContain('#000000')
    expect((await browser.get('/__smile/docs/images/logo.dark.svg')).status).toBe(404)
    const logo = await browser.get('/__smile/docs/images/logo.svg')
    expect(logo.text).toBe(LOGO)
  })

  it('images returns a screenshot as WebP', async () => {
    const response = await server.fetch(new Request('http://localhost/__smile/docs/images/shot.webp'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(Buffer.from(await response.arrayBuffer()).equals(WEBP)).toBe(true)
  })

  it('answers 404 for an image that is missing, of another type, or outside the images folder', async () => {
    for (const path of ['images/none.svg', 'images/notes.txt', 'images/..%2Findex.json', 'images/sub/figure.svg', 'images/', 'images']) {
      expect((await browser.get(`/__smile/docs/${path}`)).status, path).toBe(404)
    }
  })

  it('answers 404 for any other route', async () => {
    for (const path of ['/__smile/docs/nothing', '/__smile/docs/index/more', '/__smile/docs/page/intro.md']) {
      const reply = await browser.get(path)
      expect(reply.status, path).toBe(404)
      expect(reply.body.statusMessage).toBe('Not found')
    }
  })

  it('ignores a query on the index route', async () => {
    expect((await browser.get('/__smile/docs/index?x=1')).status).toBe(200)
  })
})
