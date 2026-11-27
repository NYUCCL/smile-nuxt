/**
 * @fileoverview Docs mode: the page list, a page, search, links inside a
 * page, the copy button, previous / next, "On this page", and what happens
 * when the docs route does not answer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import SmileDevDocsView from '../../src/runtime/components/dev/docs/SmileDevDocsView.vue'
import { docsJump } from '../../src/runtime/components/dev/palette/bus.js'
import { createStore, createFakeApi, mountComponent } from '../components/mount'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))

const INDEX = {
  version: '1.0.0',
  sections: [
    { section: 'Start', pages: [{ path: 'introduction.md', title: 'Introduction' }, { path: 'install.md', title: 'Installing' }] },
    { section: 'Coding', pages: [{ path: 'coding/steps.md', title: 'Steps' }] },
  ],
}

/**
 * A rendered page, as the docs route sends it.
 * @param {string} path - The page
 * @param {object} [extra] - Fields to add or replace
 * @returns {object} The page
 */
function docPage(path, extra = {}) {
  return {
    path,
    website: `https://smile.gureckislab.org/${path.replace(/\.md$/, '')}`,
    html: `<h1>${path}</h1>
      <h2 id="first">First</h2>
      <h2 id="second">Second</h2>
      <p><a id="to-steps" data-docs-page="coding/steps.md" data-docs-hash="second" href="#">steps</a>
      <a id="to-self" data-docs-page="${path}" data-docs-hash="second" href="#">here</a>
      <a id="to-heading" data-docs-hash="first" href="#first">first</a>
      <a id="outside" href="https://example.org">out</a></p>
      <div><button class="sd-docs-copy">copy</button><pre><code>pnpm dev</code></pre></div>
      <div><button class="sd-docs-copy" id="copy-nothing">copy</button></div>`,
    headings: [{ id: 'first', text: 'First', level: 2 }, { id: 'second', text: 'Second', level: 6 }],
    ...extra,
  }
}

let fetchMock
let routes

/**
 * Mounts Docs mode and waits for the index and the first page.
 * @param {object} [options] - What to start from
 * @param {string|null} [options.docsPage] - The page the store remembers
 * @param {boolean} [options.attach] - false keeps the view out of the document
 * @returns {Promise<{ wrapper: object, store: object }>} The wrapper and the store
 */
async function mountDocs({ docsPage = null, attach = true } = {}) {
  const { pinia, store } = createStore((s) => {
    s.dev.docsPage = docsPage
  })
  fake.api = createFakeApi(store)
  const wrapper = mountComponent(SmileDevDocsView, { pinia, attachTo: attach ? document.body : undefined })
  await flushPromises()
  return { wrapper, store }
}

const pageRequests = () => fetchMock.mock.calls.filter(c => c[0] === '/__smile/docs/page').map(c => c[1].query.path)
const pageLink = (wrapper, title) => wrapper.findAll('.docs-page-link').find(b => b.text() === title)
const article = wrapper => wrapper.find('[data-testid="docs-page"]')
const search = wrapper => wrapper.find('[data-testid="docs-search"]')

describe('SmileDevDocsView', () => {
  let wrapper
  let scrollIntoView
  let scrollTo

  beforeEach(() => {
    docsJump.value = null
    routes = {
      index: async () => INDEX,
      page: async path => docPage(path),
      search: async () => [],
    }
    fetchMock = vi.fn(async (url, options) => {
      if (url === '/__smile/docs/index') return routes.index()
      if (url === '/__smile/docs/page') return routes.page(options.query.path)
      if (url === '/__smile/docs/search') return routes.search(options.query.q)
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('$fetch', fetchMock)
    scrollIntoView = vi.fn()
    scrollTo = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    Element.prototype.scrollTo = scrollTo
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('opening', () => {
    it('lists the sections and pages and opens the introduction', async () => {
      ({ wrapper } = await mountDocs())
      expect(wrapper.findAll('.docs-section-title').map(p => p.text())).toEqual(['Start', 'Coding'])
      expect(wrapper.findAll('.docs-page-link').map(b => b.text())).toEqual(['Introduction', 'Installing', 'Steps'])
      expect(pageRequests()).toEqual(['introduction.md'])
      expect(article(wrapper).find('h1').text()).toBe('introduction.md')
    })

    it('marks the open page in the list', async () => {
      ({ wrapper } = await mountDocs())
      expect(pageLink(wrapper, 'Introduction').attributes('aria-current')).toBe('page')
      expect(pageLink(wrapper, 'Installing').attributes('aria-current')).toBeUndefined()
    })

    it('opens the page read last time', async () => {
      ({ wrapper } = await mountDocs({ docsPage: 'coding/steps.md' }))
      expect(pageRequests()).toEqual(['coding/steps.md'])
      expect(pageLink(wrapper, 'Steps').attributes('aria-current')).toBe('page')
    })

    it('opens the introduction when the remembered page no longer exists', async () => {
      let store
      ({ wrapper, store } = await mountDocs({ docsPage: 'gone.md' }))
      expect(pageRequests()).toEqual(['introduction.md'])
      expect(store.dev.docsPage).toBe('introduction.md')
    })

    it('opens the page and heading the command palette asked for, and takes the request', async () => {
      docsJump.value = { path: 'coding/steps.md', hash: 'second' };
      ({ wrapper } = await mountDocs({ docsPage: 'install.md' }))
      expect(pageRequests()).toEqual(['coding/steps.md'])
      expect(docsJump.value).toBeNull()
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      expect(scrollIntoView.mock.instances[0].id).toBe('second')
    })

    it('links to the same page on the website', async () => {
      ({ wrapper } = await mountDocs())
      const link = wrapper.find('.docs-bar a')
      expect(link.text()).toContain('On the website')
      expect(link.attributes('href')).toBe('https://smile.gureckislab.org/introduction')
    })
  })

  describe('when the docs route does not answer', () => {
    // Not attached to the document: happy-dom logs an error when an iframe in it tries to load
    it('shows the website instead when the request fails', async () => {
      routes.index = async () => {
        throw new Error('404')
      };
      ({ wrapper } = await mountDocs({ attach: false }))
      expect(wrapper.find('iframe').attributes('src')).toBe('https://smile.gureckislab.org')
      expect(wrapper.find('.docs-nav').exists()).toBe(false)
      expect(pageRequests()).toEqual([])
    })

    it('shows the website when the answer is the app\'s HTML and not an index', async () => {
      routes.index = async () => '<!DOCTYPE html><html></html>';
      ({ wrapper } = await mountDocs({ attach: false }))
      expect(wrapper.find('iframe').exists()).toBe(true)
    })
  })

  describe('a page that fails to load', () => {
    it('says so when it is the first page', async () => {
      routes.page = async () => {
        throw new Error('500')
      };
      ({ wrapper } = await mountDocs())
      expect(wrapper.find('.docs-error').text()).toBe('Couldn\'t load introduction.md.')
      expect(article(wrapper).exists()).toBe(false)
    })

    it('keeps the page on screen, says so above it, and keeps the remembered page', async () => {
      let store
      ({ wrapper, store } = await mountDocs())
      routes.page = async () => {
        throw new Error('500')
      }
      await pageLink(wrapper, 'Installing').trigger('click')
      await flushPromises()
      expect(wrapper.find('.docs-page .text-sd-error').text()).toBe('Couldn\'t load install.md.')
      expect(article(wrapper).find('h1').text()).toBe('introduction.md')
      expect(store.dev.docsPage).toBe('introduction.md')
    })

    it('the message goes away when the next page loads', async () => {
      ({ wrapper } = await mountDocs())
      routes.page = async () => {
        throw new Error('500')
      }
      await pageLink(wrapper, 'Installing').trigger('click')
      await flushPromises()
      routes.page = async path => docPage(path)
      await pageLink(wrapper, 'Steps').trigger('click')
      await flushPromises()
      expect(wrapper.find('.text-sd-error').exists()).toBe(false)
      expect(article(wrapper).find('h1').text()).toBe('coding/steps.md')
    })
  })

  describe('the page list', () => {
    it('a click opens the page, remembers it and goes to its top', async () => {
      let store
      ({ wrapper, store } = await mountDocs())
      scrollTo.mockClear()
      await pageLink(wrapper, 'Installing').trigger('click')
      await flushPromises()
      expect(article(wrapper).find('h1').text()).toBe('install.md')
      expect(store.dev.docsPage).toBe('install.md')
      expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
      expect(pageLink(wrapper, 'Installing').attributes('aria-current')).toBe('page')
    })

    it('dims the page while the next one loads', async () => {
      ({ wrapper } = await mountDocs())
      let finish
      routes.page = path => new Promise((resolve) => {
        finish = () => resolve(docPage(path))
      })
      await pageLink(wrapper, 'Installing').trigger('click')
      expect(article(wrapper).classes()).toContain('docs-loading')
      finish()
      await flushPromises()
      expect(article(wrapper).classes()).not.toContain('docs-loading')
    })
  })

  describe('previous and next', () => {
    const pager = w => w.find('[data-testid="docs-pager"]')

    it('the first page has only a next link', async () => {
      ({ wrapper } = await mountDocs())
      expect(pager(wrapper).findAll('button')).toHaveLength(1)
      expect(pager(wrapper).text()).toContain('Next page')
      expect(pager(wrapper).text()).toContain('Installing')
    })

    it('a middle page has both, across sections', async () => {
      ({ wrapper } = await mountDocs({ docsPage: 'install.md' }))
      const [prev, next] = pager(wrapper).findAll('button')
      expect(prev.text()).toContain('Introduction')
      expect(next.text()).toContain('Steps')
    })

    it('the last page has only a previous link, which opens that page', async () => {
      ({ wrapper } = await mountDocs({ docsPage: 'coding/steps.md' }))
      const buttons = pager(wrapper).findAll('button')
      expect(buttons).toHaveLength(1)
      expect(buttons[0].text()).toContain('Previous page')
      await buttons[0].trigger('click')
      await flushPromises()
      expect(article(wrapper).find('h1').text()).toBe('install.md')
    })

    it('next opens the next page', async () => {
      ({ wrapper } = await mountDocs())
      await pager(wrapper).find('button').trigger('click')
      await flushPromises()
      expect(pageRequests()).toEqual(['introduction.md', 'install.md'])
    })
  })

  describe('links inside a page', () => {
    it('a link to another page opens it here, at its heading', async () => {
      ({ wrapper } = await mountDocs())
      await wrapper.find('#to-steps').trigger('click')
      await flushPromises()
      expect(pageRequests()).toEqual(['introduction.md', 'coding/steps.md'])
      expect(scrollIntoView.mock.instances.at(-1).id).toBe('second')
    })

    it('a link to a heading of the open page scrolls and loads nothing', async () => {
      ({ wrapper } = await mountDocs())
      await wrapper.find('#to-self').trigger('click')
      await wrapper.find('#to-heading').trigger('click')
      expect(pageRequests()).toEqual(['introduction.md'])
      expect(scrollIntoView.mock.instances.map(el => el.id)).toEqual(['second', 'first'])
    })

    it('a link out of the docs is left to the browser', async () => {
      ({ wrapper } = await mountDocs())
      const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
      wrapper.find('#outside').element.dispatchEvent(click)
      expect(click.defaultPrevented).toBe(false)
      expect(pageRequests()).toEqual(['introduction.md'])
    })

    it.each(['metaKey', 'ctrlKey', 'shiftKey'])('a click with %s is left to the browser', async (key) => {
      ({ wrapper } = await mountDocs())
      const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, [key]: true })
      wrapper.find('#to-steps').element.dispatchEvent(click)
      await flushPromises()
      expect(click.defaultPrevented).toBe(false)
      expect(pageRequests()).toEqual(['introduction.md'])
    })

    it('a click on plain text does nothing', async () => {
      ({ wrapper } = await mountDocs())
      scrollTo.mockClear()
      await article(wrapper).find('h1').trigger('click')
      expect(pageRequests()).toEqual(['introduction.md'])
      expect(scrollTo).not.toHaveBeenCalled()
    })
  })

  describe('the copy button on a code block', () => {
    it('copies the code and is marked as copied for 2 seconds', async () => {
      const writeText = vi.fn(async () => {})
      vi.stubGlobal('navigator', { ...navigator, platform: 'MacIntel', clipboard: { writeText } });
      ({ wrapper } = await mountDocs())
      vi.useFakeTimers()
      const button = wrapper.find('.sd-docs-copy')
      await button.trigger('click')
      await vi.advanceTimersByTimeAsync(0)
      expect(writeText).toHaveBeenCalledWith('pnpm dev')
      expect(button.classes()).toContain('copied')
      await vi.advanceTimersByTimeAsync(2000)
      expect(button.classes()).not.toContain('copied')
    })

    it('is not marked when the browser refuses the copy', async () => {
      const writeText = vi.fn(async () => {
        throw new Error('denied')
      })
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
      ({ wrapper } = await mountDocs())
      const button = wrapper.find('.sd-docs-copy')
      await button.trigger('click')
      await flushPromises()
      expect(writeText).toHaveBeenCalled()
      expect(button.classes()).not.toContain('copied')
    })

    it('does nothing when there is no code next to it', async () => {
      const writeText = vi.fn(async () => {})
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
      ({ wrapper } = await mountDocs())
      await wrapper.find('#copy-nothing').trigger('click')
      await flushPromises()
      expect(writeText).not.toHaveBeenCalled()
    })
  })

  describe('search', () => {
    const results = w => w.find('[data-testid="docs-results"]')

    /**
     * Types into the search field and waits for the request and its answer.
     * @param {object} w - The wrapper
     * @param {string} text - What to type
     */
    async function type(w, text) {
      await search(w).setValue(text)
      await vi.advanceTimersByTimeAsync(150)
      await nextTick()
    }

    it('asks 150 ms after the last key, once', async () => {
      ({ wrapper } = await mountDocs())
      vi.useFakeTimers()
      await search(wrapper).setValue('st')
      await vi.advanceTimersByTimeAsync(100)
      await search(wrapper).setValue('steps')
      await vi.advanceTimersByTimeAsync(149)
      expect(fetchMock).not.toHaveBeenCalledWith('/__smile/docs/search', expect.anything())
      await vi.advanceTimersByTimeAsync(1)
      const calls = fetchMock.mock.calls.filter(c => c[0] === '/__smile/docs/search')
      expect(calls).toHaveLength(1)
      expect(calls[0][1]).toEqual({ query: { q: 'steps' } })
    })

    it('shows the results in place of the page list, with heading and snippet', async () => {
      routes.search = async () => [
        { path: 'coding/steps.md', hash: 'second', title: 'Steps', heading: 'Second', snippet: 'about steps' },
        { path: 'install.md', hash: '', title: 'Installing', heading: '', snippet: 'how to install' },
      ];
      ({ wrapper } = await mountDocs())
      vi.useFakeTimers()
      await type(wrapper, 'steps')
      expect(wrapper.find('.docs-pages').exists()).toBe(false)
      const items = results(wrapper).findAll('.docs-result')
      expect(items[0].find('.docs-result-title').text()).toBe('Steps › Second')
      expect(items[0].find('.docs-result-snippet').text()).toBe('about steps')
      expect(items[1].find('.docs-result-title').text()).toBe('Installing')
    })

    it('says nothing was found', async () => {
      ({ wrapper } = await mountDocs())
      vi.useFakeTimers()
      await type(wrapper, 'zzz')
      expect(results(wrapper).text()).toBe('Nothing found.')
    })

    it('says nothing was found when the search request fails', async () => {
      routes.search = async () => [{ path: 'install.md', hash: '', title: 'Installing', snippet: '' }];
      ({ wrapper } = await mountDocs())
      vi.useFakeTimers()
      await type(wrapper, 'install')
      expect(results(wrapper).findAll('.docs-result')).toHaveLength(1)
      routes.search = async () => {
        throw new Error('500')
      }
      await type(wrapper, 'installing')
      expect(results(wrapper).text()).toBe('Nothing found.')
    })

    it('a result opens its page at its heading and brings the page list back', async () => {
      routes.search = async () => [{ path: 'coding/steps.md', hash: 'second', title: 'Steps', heading: 'Second', snippet: '' }];
      ({ wrapper } = await mountDocs())
      vi.useFakeTimers()
      await type(wrapper, 'steps')
      await results(wrapper).find('.docs-result').trigger('click')
      await vi.advanceTimersByTimeAsync(0)
      await nextTick()
      expect(search(wrapper).element.value).toBe('')
      expect(wrapper.find('.docs-pages').exists()).toBe(true)
      expect(article(wrapper).find('h1').text()).toBe('coding/steps.md')
      expect(scrollIntoView.mock.instances.at(-1).id).toBe('second')
    })

    it('only spaces is not a search', async () => {
      ({ wrapper } = await mountDocs())
      vi.useFakeTimers()
      await type(wrapper, '   ')
      expect(results(wrapper).exists()).toBe(false)
      expect(fetchMock).not.toHaveBeenCalledWith('/__smile/docs/search', expect.anything())
    })

    it('the clear button and Escape empty the field and put the cursor in it', async () => {
      routes.search = async () => [{ path: 'install.md', hash: '', title: 'Installing', snippet: '' }];
      ({ wrapper } = await mountDocs())
      vi.useFakeTimers()
      expect(wrapper.find('.docs-search-key').exists()).toBe(true)
      await type(wrapper, 'install')
      expect(wrapper.find('.docs-search-key').exists()).toBe(false)
      await wrapper.find('[aria-label="Clear search"]').trigger('click')
      expect(search(wrapper).element.value).toBe('')
      expect(results(wrapper).exists()).toBe(false)
      expect(document.activeElement).toBe(search(wrapper).element)

      await type(wrapper, 'install')
      await search(wrapper).trigger('keydown', { key: 'Escape' })
      expect(search(wrapper).element.value).toBe('')
      expect(wrapper.find('.docs-search-key').exists()).toBe(true)
    })

    it.each([['metaKey', 'k'], ['ctrlKey', 'K']])('%s + %s puts the cursor in the search field', async (modifier, key) => {
      ({ wrapper } = await mountDocs())
      const event = new KeyboardEvent('keydown', { key, [modifier]: true, cancelable: true })
      window.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(search(wrapper).element)
    })

    it('k alone, or the shortcut after Docs mode is closed, does nothing', async () => {
      ({ wrapper } = await mountDocs())
      const plain = new KeyboardEvent('keydown', { key: 'k', cancelable: true })
      window.dispatchEvent(plain)
      expect(plain.defaultPrevented).toBe(false)
      expect(document.activeElement).not.toBe(search(wrapper).element)
      wrapper.unmount()
      wrapper = null
      const after = new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true })
      window.dispatchEvent(after)
      expect(after.defaultPrevented).toBe(false)
    })
  })

  describe('on this page', () => {
    const toc = w => w.find('[data-testid="docs-toc"]')

    it('lists the page\'s headings, indented by level up to 4', async () => {
      ({ wrapper } = await mountDocs())
      const links = toc(wrapper).findAll('a')
      expect(links.map(a => a.text())).toEqual(['First', 'Second'])
      expect(links[0].attributes('href')).toBe('#first')
      expect(links[0].classes()).toContain('docs-toc-2')
      expect(links[1].classes()).toContain('docs-toc-4')
    })

    it('is left out for a page with no headings or with the outline turned off', async () => {
      routes.page = async path => docPage(path, { headings: [] });
      ({ wrapper } = await mountDocs())
      expect(toc(wrapper).exists()).toBe(false)
      wrapper.unmount()
      routes.page = async path => docPage(path, { outline: false });
      ({ wrapper } = await mountDocs())
      expect(toc(wrapper).exists()).toBe(false)
    })

    it('a click on a heading scrolls to it', async () => {
      ({ wrapper } = await mountDocs())
      await toc(wrapper).findAll('a')[1].trigger('click')
      expect(scrollIntoView.mock.instances.at(-1).id).toBe('second')
    })

    /**
     * Gives the page's scroll box a size and position, and each heading a place.
     * @param {object} w - The wrapper
     * @param {object} box - scrollTop, clientHeight, scrollHeight of the box
     * @param {object} tops - Each heading's distance from the top of the window, by id
     */
    function layout(w, box, tops) {
      const main = w.find('main').element
      for (const [key, value] of Object.entries(box)) {
        Object.defineProperty(main, key, { value, configurable: true })
      }
      main.getBoundingClientRect = () => ({ top: 0 })
      for (const [id, top] of Object.entries(tops)) {
        main.querySelector(`[id="${id}"]`).getBoundingClientRect = () => ({ top })
      }
    }

    /**
     * Scrolls the page and waits for the frame in which the heading is marked.
     * @param {object} w - The wrapper
     */
    async function scroll(w) {
      await w.find('main').trigger('scroll')
      await new Promise(resolve => requestAnimationFrame(resolve))
      await nextTick()
    }

    const current = w => toc(w).findAll('a').filter(a => a.attributes('aria-current') === 'location').map(a => a.text())

    it('marks the last heading that has reached the top of the page', async () => {
      ({ wrapper } = await mountDocs())
      layout(wrapper, { scrollTop: 100, clientHeight: 500, scrollHeight: 2000 }, { first: 50, second: 400 })
      await scroll(wrapper)
      expect(current(wrapper)).toEqual(['First'])
      layout(wrapper, { scrollTop: 400, clientHeight: 500, scrollHeight: 2000 }, { first: -250, second: 96 })
      await scroll(wrapper)
      expect(current(wrapper)).toEqual(['Second'])
    })

    it('marks none above the first heading', async () => {
      ({ wrapper } = await mountDocs())
      layout(wrapper, { scrollTop: 0, clientHeight: 500, scrollHeight: 2000 }, { first: 300, second: 900 })
      await scroll(wrapper)
      expect(current(wrapper)).toEqual([])
    })

    it('marks the last heading at the bottom of the page', async () => {
      ({ wrapper } = await mountDocs())
      layout(wrapper, { scrollTop: 1500, clientHeight: 500, scrollHeight: 2000 }, { first: -900, second: 300 })
      await scroll(wrapper)
      expect(current(wrapper)).toEqual(['Second'])
    })
  })

  describe('the command palette\'s docs search while Docs mode is open', () => {
    it('opens another page at the heading and takes the request', async () => {
      ({ wrapper } = await mountDocs())
      docsJump.value = { path: 'coding/steps.md', hash: 'first' }
      await flushPromises()
      expect(docsJump.value).toBeNull()
      expect(article(wrapper).find('h1').text()).toBe('coding/steps.md')
      expect(scrollIntoView.mock.instances.at(-1).id).toBe('first')
    })

    it('scrolls on the open page without loading it again', async () => {
      ({ wrapper } = await mountDocs())
      docsJump.value = { path: 'introduction.md', hash: 'second' }
      await flushPromises()
      expect(pageRequests()).toEqual(['introduction.md'])
      expect(scrollIntoView.mock.instances.at(-1).id).toBe('second')
    })

    it('a request with no heading goes to the top of the page', async () => {
      ({ wrapper } = await mountDocs())
      scrollTo.mockClear()
      docsJump.value = { path: 'introduction.md' }
      await flushPromises()
      expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
    })

    it('is left for later when the docs are not available', async () => {
      routes.index = async () => {
        throw new Error('404')
      };
      ({ wrapper } = await mountDocs({ attach: false }))
      docsJump.value = { path: 'install.md', hash: '' }
      await flushPromises()
      expect(docsJump.value).toEqual({ path: 'install.md', hash: '' })
      expect(pageRequests()).toEqual([])
    })
  })
})
