/**
 * The dev tools' Docs mode: the docs that ship with the module, rendered.
 * Registered only under `nuxt dev` (src/module.ts), so it never reaches a
 * build. Routes, all GET:
 *
 *   /__smile/docs/index              the page list (index.json)
 *   /__smile/docs/page?path=a/b.md   one page: { title, html, headings, website, ... }
 *   /__smile/docs/search?q=words     matching sections, best first
 *   /__smile/docs/images/<name>.svg  a diagram
 */
import { createError, defineEventHandler, getQuery, setResponseHeader } from 'h3'
// @ts-expect-error — plain JS module, no type declarations
import { createDocs } from './renderDocs.js'

// The folder with index.json and the pages, set by the module.
declare const __SMILE_DOCS_DIR__: string

let docs: ReturnType<typeof createDocs> | undefined

export default defineEventHandler((event) => {
  docs ??= createDocs(__SMILE_DOCS_DIR__)
  const route = event.path.replace(/^\/__smile\/docs\/?/, '').split('?')[0]
  const query = getQuery(event)

  if (route === 'index') return docs.index()

  if (route === 'page') {
    const page = docs.page(String(query.path || ''))
    if (!page) throw createError({ statusCode: 404, statusMessage: 'No such docs page' })
    return page
  }

  if (route === 'search') return docs.search(String(query.q || ''))

  const image = route.match(/^images\/([\w.-]+\.svg)$/)
  if (image) {
    const svg = docs.image(image[1])
    if (svg) {
      setResponseHeader(event, 'content-type', 'image/svg+xml')
      return svg
    }
  }

  throw createError({ statusCode: 404, statusMessage: 'Not found' })
})
