/**
 * The dev tools' Docs mode: the docs that ship with the module, rendered.
 * Registered only under `nuxt dev` (src/module.ts), so it never reaches a
 * build. Routes, all GET:
 *
 *   /__smile/docs/index              the page list (index.json)
 *   /__smile/docs/page?path=a/b.md   one page: { title, html, headings, website, ... }
 *   /__smile/docs/search?q=words     matching sections, best first
 *   /__smile/docs/images/<name>.svg  a diagram
 *   /__smile/docs/images/<name>.webp a screenshot
 */
import { createError, defineEventHandler, getQuery, setResponseHeader } from 'h3'
import { createDocs, loadHighlighter } from './renderDocs.js'

// The folder with index.json and the pages, set by the module.
declare const __SMILE_DOCS_DIR__: string

let docs: Promise<ReturnType<typeof createDocs>> | undefined

export default defineEventHandler(async (event) => {
  docs ??= loadHighlighter().then(highlight => createDocs(__SMILE_DOCS_DIR__, { highlight }))
  const service = await docs
  const route = event.path.replace(/^\/__smile\/docs\/?/, '').split('?')[0] ?? ''
  const query = getQuery(event)

  if (route === 'index') return service.index()

  if (route === 'page') {
    const page = service.page(String(query.path || ''))
    if (!page) throw createError({ statusCode: 404, statusMessage: 'No such docs page' })
    return page
  }

  if (route === 'search') return service.search(String(query.q || ''))

  const image = route.match(/^images\/([\w.-]+\.(svg|webp))$/)
  if (image) {
    const data = service.image(image[1]!)
    if (data) {
      setResponseHeader(event, 'content-type', image[2] === 'svg' ? 'image/svg+xml' : 'image/webp')
      return data
    }
  }

  throw createError({ statusCode: 404, statusMessage: 'Not found' })
})
