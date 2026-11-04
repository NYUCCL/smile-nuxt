// Dark-mode diagrams on the website, as in Docs mode (src/runtime/server/dev/darkFigures.js
// has the color rule, ported from the CCM book).
//
//  - darkFiguresMarkdown: every diagram (an SVG in docs/images/ drawn in the book
//    style) is written twice, the light one with class fig-light and a dark copy
//    pointing at `/images/<name>.dark.svg` with class fig-dark. CSS shows one.
//  - darkFiguresVite: serves the dark copies in dev, derived on request.
//  - writeDarkFigures: at the end of a build, writes the dark copies of the
//    diagrams the pages used into the output.
//
// The dark copies are derived, never committed, so they can't go stale.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { darkFigure } from '../../src/runtime/server/dev/darkFigures.js'

const IMAGES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../images')
const used = new Set() // diagram file names the pages showed

// '/images/x.svg' or '../images/x.svg' → 'x.svg', if it's a book-style diagram
function diagram(src) {
  const name = src.match(/^(?:\/|(?:\.\/)?(?:\.\.\/)+)images\/([\w-]+\.svg)$/)?.[1]
  if (!name) return null
  const file = path.join(IMAGES, name)
  return fs.existsSync(file) && darkFigure(fs.readFileSync(file, 'utf8')) ? name : null
}

const addClass = (attrs, cls) => (/\bclass="/.test(attrs) ? attrs.replace(/\bclass="/, `class="${cls} `) : `${attrs} class="${cls}"`)

// Each <img> of a diagram becomes a light and a dark copy. The dark src is bound
// as a string (`:src="'…'"`): a plain src would make Vite import a file that
// doesn't exist on disk.
function pairHtml(html) {
  return html.replace(/<img\b([^>]*?)\s*\/?>/g, (img, attrs) => {
    const src = attrs.match(/(?<![:\w-])src="([^"]+)"/)?.[1]
    const name = src && diagram(src)
    if (!name) return img
    used.add(name)
    const dark = attrs.replace(/(?<![:\w-])src="[^"]+"/, `:src="'/images/${name.replace(/\.svg$/, '.dark.svg')}'"`)
    return `<img${addClass(attrs, 'fig-light')}><img${addClass(dark, 'fig-dark')}>`
  })
}

export function darkFiguresMarkdown(md) {
  for (const rule of ['image', 'html_block', 'html_inline']) {
    const orig = md.renderer.rules[rule] ?? ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))
    md.renderer.rules[rule] = (tokens, idx, options, env, self) => pairHtml(orig(tokens, idx, options, env, self))
  }
}

export function darkFiguresVite() {
  return {
    name: 'smile-dark-figures',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = decodeURIComponent((req.url || '').split('?')[0]).match(/^\/images\/([\w-]+)\.dark\.svg$/)?.[1]
        const file = name && path.join(IMAGES, `${name}.svg`)
        const dark = file && fs.existsSync(file) && darkFigure(fs.readFileSync(file, 'utf8'))
        if (!dark) return next()
        res.setHeader('Content-Type', 'image/svg+xml')
        res.setHeader('Cache-Control', 'no-cache')
        res.end(dark)
      })
    },
  }
}

export function writeDarkFigures(outDir) {
  fs.mkdirSync(path.join(outDir, 'images'), { recursive: true })
  for (const name of used) {
    const dark = darkFigure(fs.readFileSync(path.join(IMAGES, name), 'utf8'))
    fs.writeFileSync(path.join(outDir, 'images', name.replace(/\.svg$/, '.dark.svg')), dark)
  }
  return used.size
}
