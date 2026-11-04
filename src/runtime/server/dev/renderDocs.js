/**
 * Renders the docs that ship with the module (dist/docs/, written by
 * scripts/build-agent-docs.mjs) for the dev tools' Docs mode. Dev only: the
 * route that uses this is registered under `nuxt dev` and nowhere else.
 *
 * The pages are VitePress markdown. Most of it is plain markdown; the rest is
 * handled here so a page reads well outside VitePress:
 * - containers (tip, info, warning, danger, details, code-group)
 * - `{#id}` heading ids, and VitePress's own slugs for the rest, so links
 *   with #anchors from the website land on the same heading
 * - Vue in the pages: <SmileText/> becomes SMILE; live demos (::: raw,
 *   <ComponentViewer>) become a note with a link to the website, plus the
 *   example's source from examples/
 * - links between pages become in-app links (data-docs-page); images that
 *   ship (the SVG diagrams) are served from here, the rest link to the page
 *   on the website
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'
import MarkdownIt from 'markdown-it'
import container from 'markdown-it-container'
import footnote from 'markdown-it-footnote'
import mark from 'markdown-it-mark'

export const WEBSITE = 'https://smile.gureckislab.org'

/** VitePress's heading slugs (@mdit-vue/shared slugify). */
export function slugify(text) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F]/g, '')
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase()
}

/** The website's address for a page ('coding/steps.md'), with an optional #hash. */
export function websiteUrl(page, hash = '') {
  return `${WEBSITE}/${page.replace(/\.md$/, '.html')}${hash ? `#${hash}` : ''}`
}

const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Applies fn to the parts of a markdown text that aren't fenced code. */
export function outsideFences(text, fn) {
  const parts = []
  let buffer = []
  let fence = null
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(`{3,}|~{3,})/)
    if (fence) {
      buffer.push(line)
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) {
        parts.push(buffer.join('\n'))
        buffer = []
        fence = null
      }
    }
    else if (m) {
      parts.push(fn(buffer.join('\n')))
      buffer = [line]
      fence = m[1]
    }
    else {
      buffer.push(line)
    }
  }
  parts.push(fence ? buffer.join('\n') : fn(buffer.join('\n')))
  return parts.join('\n')
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s:?${name}="([^"]*)"`))
  return m ? m[1] : ''
}

/**
 * The page's markdown with its Vue parts made readable. `example(name)`
 * returns an example component's source (or '').
 */
export function prepareMarkdown(text, page, example = () => '') {
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '')
  return outsideFences(body, (md) => {
    const examples = []
    // Inline code is literal: hold it aside so <Button> in `<Button>` stays.
    const spans = []
    let out = md
      .replace(/(`+)(?!`)(.+?)(?<!`)\1(?!`)/g, (span) => {
        spans.push(span)
        return `\u0000${spans.length - 1}\u0000`
      })
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
      .replace(/<SmileText\s*\/>/g, 'SMILE')
      .replace(/<GureckisLabText\s*\/>/g, 'the Gureckis Lab')
    // A live example: what it is, where to see it, and its source.
    out = out.replace(/<ComponentViewer\b([^>]*?)(?:\/>|>([\s\S]*?)<\/ComponentViewer>)/g, (_, attrs) => {
      const name = attr(attrs, 'name')
      const description = attr(attrs, 'description')
      const raw = attr(attrs, 'raw-code') || attr(attrs, 'rawCode')
      const exampleName = raw.replace(/Raw$/, '')
      const source = exampleName ? example(exampleName) : ''
      const note = `<div class="sd-docs-example"><p class="sd-docs-example-title">Live example${name ? `: ${escapeHtml(name)}` : ''}</p>`
        + `${description ? `<p>${escapeHtml(description)}</p>` : ''}`
        + `<p><a href="${websiteUrl(page)}" target="_blank" rel="noopener">See it running on the website</a></p></div>`
      // Held aside until the tag stripping below is done, so the example's
      // own <Button> etc. survive.
      examples.push(`\n\n${note}\n\n${source ? `\`\`\`vue\n${source.trim()}\n\`\`\`\n` : ''}\n`)
      return `\n\n<div class="sd-docs-example" data-held="${examples.length - 1}"></div>\n\n`
    })
    // ::: raw holds live components; keep what we already turned into an
    // example, otherwise say where the demo is.
    out = out.replace(/^:{3,} *raw *\n([\s\S]*?)^:{3,} *$/gm, (_, inner) => {
      if (inner.includes('sd-docs-example')) return inner
      return `\n\n<div class="sd-docs-example"><p class="sd-docs-example-title">Live demo</p>`
        + `<p><a href="${websiteUrl(page)}" target="_blank" rel="noopener">See it running on the website</a></p></div>\n\n`
    })
    // Any other component tags: keep their text, drop the tags.
    out = out.replace(/<\/?[A-Z][A-Za-z0-9]*\b[^>]*?\/?>/g, '')
    return out
      .replace(/\n\n<div class="sd-docs-example" data-held="(\d+)"><\/div>\n\n/g, (_, i) => examples[Number(i)])

      .replace(/\0(\d+)\0/g, (_, i) => spans[Number(i)])
  })
}

/** Turns a link or image address in a page into where it should go here. */
export function resolveTarget(href, page) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return { external: href }
  const [pathPart, hash = ''] = href.split('#')
  if (!pathPart) return { hash }
  const dir = posix.dirname(page)
  const resolved = pathPart.startsWith('/')
    ? pathPart.slice(1)
    : posix.normalize(posix.join(dir === '.' ? '' : dir, pathPart))
  return { path: resolved.replace(/\/$/, '/index'), hash }
}

/** The address of a page link target: 'coding/steps' or 'coding/steps.md' -> 'coding/steps.md'. */
const asPage = path => path.replace(/\.(md|html)$/, '') + '.md'

function createRenderer({ hasImage }) {
  const md = new MarkdownIt({ html: true, linkify: true })
  md.use(footnote).use(mark)

  const callout = (type, label) => md.use(container, type, {
    render(tokens, idx) {
      const token = tokens[idx]
      if (token.nesting !== 1) return '</div>\n'
      const title = token.info.trim().slice(type.length).trim() || label
      return `<div class="sd-docs-callout sd-docs-${type}"><p class="sd-docs-callout-title">${md.utils.escapeHtml(title)}</p>\n`
    },
  })
  callout('tip', 'Tip')
  callout('info', 'Info')
  callout('warning', 'Warning')
  callout('danger', 'Danger')
  md.use(container, 'details', {
    render(tokens, idx) {
      const token = tokens[idx]
      if (token.nesting !== 1) return '</details>\n'
      const title = token.info.trim().slice('details'.length).trim() || 'Details'
      return `<details class="sd-docs-details"><summary>${md.utils.escapeHtml(title)}</summary>\n`
    },
  })
  md.use(container, 'code-group', {
    render: (tokens, idx) => tokens[idx].nesting === 1 ? '<div class="sd-docs-code-group">\n' : '</div>\n',
  })

  // Fences: ```sh [pnpm] gets a label; no highlighting.
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]
    const info = token.info.trim()
    const lang = info.split(/[\s{[]/)[0]
    const label = (info.match(/\[([^\]]+)\]/) || [])[1]
    const head = label ? `<div class="sd-docs-code-label">${md.utils.escapeHtml(label)}</div>` : ''
    return `<div class="sd-docs-code">${head}<pre><code${lang ? ` class="language-${md.utils.escapeHtml(lang)}"` : ''}>${md.utils.escapeHtml(token.content)}</code></pre></div>\n`
  }

  // Headings: {#id} or VitePress's slug; collect h2/h3 for the outline.
  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const inline = tokens[idx + 1]
    let text = inline.children.map(c => c.content).join('')
    let id
    const custom = inline.content.match(/\s*\{#([^}]+)\}\s*$/)
    if (custom) {
      id = custom[1]
      for (const child of inline.children) child.content = child.content.replace(/\s*\{#[^}]+\}\s*$/, '')
      text = text.replace(/\s*\{#[^}]+\}\s*$/, '')
    }
    else {
      id = slugify(text)
    }
    const seen = env.slugs[id] ?? 0
    env.slugs[id] = seen + 1
    if (seen) id = `${id}-${seen}`
    token.attrSet('id', id)
    if (token.tag === 'h2' || token.tag === 'h3') env.headings.push({ level: Number(token.tag[1]), id, text: text.trim() })
    return self.renderToken(tokens, idx, options)
  }

  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const target = resolveTarget(token.attrGet('href') || '', env.page)
    if (target.external) {
      token.attrSet('target', '_blank')
      token.attrSet('rel', 'noopener')
    }
    else if (target.path && /\.(?:png|jpe?g|gif|svg|webp|mp4|mov|pdf)$/i.test(target.path)) {
      token.attrSet('href', `${WEBSITE}/${target.path}`)
      token.attrSet('target', '_blank')
    }
    else if (target.path) {
      const page = asPage(target.path)
      token.attrSet('href', websiteUrl(page, target.hash))
      token.attrSet('data-docs-page', page)
      if (target.hash) token.attrSet('data-docs-hash', target.hash)
    }
    else {
      token.attrSet('href', `#${target.hash}`)
      token.attrSet('data-docs-hash', target.hash)
    }
    return self.renderToken(tokens, idx, options)
  }

  const imageHtml = (src, alt, env, size = '') => {
    const target = resolveTarget(src, env.page)
    if (target.external) return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${size}>`
    const name = posix.basename(target.path || '')
    if (target.path && hasImage(name)) return `<img src="/__smile/docs/images/${encodeURIComponent(name)}" alt="${escapeHtml(alt)}"${size}>`
    // Screenshots and other images don't ship: link to the page that has them.
    return `<a class="sd-docs-figure" href="${websiteUrl(env.page)}" target="_blank" rel="noopener">`
      + `<span>Image${alt ? `: ${escapeHtml(alt)}` : ''}</span><span class="sd-docs-figure-hint">on the website</span></a>`
  }

  md.renderer.rules.image = (tokens, idx, options, env) => {
    const token = tokens[idx]
    return imageHtml(token.attrGet('src') || '', token.content, env)
  }

  // <img>, <video> and <source> written as HTML in the pages.
  const rewriteHtml = (html, env) => html
    .replace(/<img\b[^>]*>/g, (tag) => {
      // Keep the page's sizing (width="300" on the logo, width="600" on diagrams)
      const size = ['width', 'height'].map(n => attr(tag, n) ? ` ${n}="${escapeHtml(attr(tag, n))}"` : '').join('')
      return imageHtml(attr(tag, 'src'), attr(tag, 'alt'), env, size)
    })
    .replace(/<(video|source)\b([^>]*)\ssrc="([^"]*)"/g, (all, tag, before, src) => {
      const target = resolveTarget(src, env.page)
      return target.external ? all : `<${tag}${before} src="${WEBSITE}/${target.path}"`
    })
  for (const rule of ['html_block', 'html_inline']) {
    md.renderer.rules[rule] = (tokens, idx, options, env) => rewriteHtml(tokens[idx].content, env)
  }

  return md
}

/**
 * The docs service for one docs folder: the page list, rendered pages (cached
 * by modification time), search and the shipped images.
 */
export function createDocs(docsDir) {
  const read = file => readFileSync(join(docsDir, file), 'utf8')
  const index = () => JSON.parse(read('index.json'))
  const pages = () => new Map(index().sections.flatMap(s => s.pages.map(p => [p.path, { ...p, section: s.section }])))
  const hasImage = name => /\.svg$/i.test(name) && existsSync(join(docsDir, 'images', name))
  const example = (name) => {
    const file = join(docsDir, 'examples', `${name}.vue`)
    return /^[A-Z0-9]+$/i.test(name) && existsSync(file) ? readFileSync(file, 'utf8') : ''
  }
  const md = createRenderer({ hasImage })
  const cache = new Map()

  function page(path) {
    const info = pages().get(path)
    if (!info) return null
    const mtime = statSync(join(docsDir, path)).mtimeMs
    const hit = cache.get(path)
    if (hit && hit.mtime === mtime) return hit.result
    const env = { page: path, slugs: {}, headings: [] }
    let html = md.render(prepareMarkdown(read(path), path, example), env)
    // [[toc]]: the page's headings, as VitePress renders it.
    html = html.replace(/<p>\[\[toc\]\]<\/p>/g, () => `<nav class="sd-docs-toc"><ul>${env.headings
      .map(h => `<li class="sd-docs-toc-${h.level}"><a href="#${h.id}" data-docs-hash="${h.id}">${escapeHtml(h.text)}</a></li>`)
      .join('')}</ul></nav>`)
    const result = { path, title: info.title, section: info.section, description: info.description, html, headings: env.headings, website: websiteUrl(path) }
    cache.set(path, { mtime, result })
    return result
  }

  /** Pages and sections matching every word of the query, best first. */
  function search(query, limit = 20) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return []
    const results = []
    for (const info of pages().values()) {
      const text = prepareMarkdown(read(info.path), info.path)
      // Sections: the text under each heading (code included, so API names match).
      const sections = [{ heading: '', id: '', lines: [] }]
      let fence = false
      for (const line of text.split('\n')) {
        if (/^\s*(?:```|~~~)/.test(line)) fence = !fence
        const h = !fence && line.match(/^#{1,4}\s(.*)$/)
        if (h) {
          const custom = h[1].match(/\{#([^}]+)\}\s*$/)
          const heading = h[1].replace(/\s*\{#[^}]+\}\s*$/, '').replace(/`/g, '').trim()
          sections.push({ heading, id: custom ? custom[1] : slugify(heading), lines: [] })
        }
        else {
          sections.at(-1).lines.push(line)
        }
      }
      const title = info.title.toLowerCase()
      for (const section of sections) {
        const body = section.lines.join('\n')
        const hay = `${section.heading}\n${body}`.toLowerCase()
        if (!words.every(w => hay.includes(w) || title.includes(w))) continue
        if (!words.some(w => hay.includes(w))) continue
        let score = 0
        for (const w of words) {
          if (title.includes(w)) score += 6
          if (section.heading.toLowerCase().includes(w)) score += 4
          score += Math.min(hay.split(w).length - 1, 5)
        }
        const flat = body.replace(/<[^>]+>/g, ' ').replace(/[`*_#>[\]()]/g, '').replace(/\s+/g, ' ')
        const at = flat.toLowerCase().indexOf(words[0])
        const snippet = at < 0 ? flat.slice(0, 140) : `${at > 50 ? '…' : ''}${flat.slice(Math.max(0, at - 50), at + 110)}…`
        results.push({ path: info.path, title: info.title, section: info.section, heading: section.heading, hash: section.id, snippet: snippet.trim(), score })
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  function image(name) {
    return hasImage(name) ? readFileSync(join(docsDir, 'images', name)) : null
  }

  return { index, page, search, image }
}
