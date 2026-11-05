import { readFileSync, readdirSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Every image and video in docs/ is used somewhere: by a page, the theme, an
 * example or the config. 55 unused files (38 MB) had piled up before this
 * check (plans/docs_figures_audit.md).
 */

const docsDir = resolve(__dirname, '../../docs')
const SKIP = new Set(['node_modules', 'dist', 'cache'])
const MEDIA = /\.(?:png|jpe?g|gif|svg|webp|avif|mp4|mov|webm)$/i
const SOURCE = /\.(?:md|vue|js|mjs|ts|css|html|json)$/i

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return []
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

describe('docs: no unused images or videos', () => {
  const files = walk(docsDir)
  const media = files.filter(f => MEDIA.test(f))
  const source = files.filter(f => SOURCE.test(f)).map(f => readFileSync(f, 'utf8')).join('\n')

  it('finds the docs media', () => {
    expect(media.length).toBeGreaterThan(10)
  })

  it('every media file is referenced', () => {
    // x.dark.webp is used wherever x.webp is (darkFigures.mjs pairs them)
    const used = f => source.includes(basename(f)) || source.includes(basename(f).replace(/\.dark\.webp$/, '.webp'))
    const unused = media.filter(f => !used(f)).map(f => relative(docsDir, f))
    expect(unused, 'delete these, or use them on a page').toEqual([])
  })
})
