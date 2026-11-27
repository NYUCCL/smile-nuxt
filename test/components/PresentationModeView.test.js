import { describe, it, expect, vi } from 'vitest'
import PresentationModeView from '../../src/runtime/components/builtins/PresentationModeView.vue'
import { createStore, createFakeApi, mountComponent } from './mount'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))

/**
 * Mounts the presentation home page.
 * @param {object} [props] - Its props
 * @returns {object} The wrapper
 */
function mountHome(props) {
  const { pinia, store } = createStore()
  fake.api = createFakeApi(store)
  return mountComponent(PresentationModeView, { pinia, props })
}

const cards = wrapper => wrapper.findAll('button.presentation-card')

describe('PresentationModeView', () => {
  it('with no props shows the placeholder title and one card that starts the study', async () => {
    const wrapper = mountHome()
    expect(wrapper.find('h1').text()).toBe('This is my default title for a project')
    expect(cards(wrapper)).toHaveLength(1)
    expect(cards(wrapper)[0].text()).toContain('Start from beginning')
    await cards(wrapper)[0].trigger('click')
    expect(fake.api.goToView).toHaveBeenCalledWith('welcome_anonymous')
  })

  it('shows the title, the subtitle and the footer author it is given', () => {
    const wrapper = mountHome({
      title: 'Category learning',
      subtitle: 'How people learn categories',
      siteAuthor: { name: 'Ada Lovelace', link: 'https://ada.example' },
    })
    expect(wrapper.find('h1').text()).toBe('Category learning')
    expect(wrapper.find('header').text()).toContain('How people learn categories')
    const author = wrapper.find('footer a')
    expect(author.text()).toBe('Ada Lovelace')
    expect(author.attributes('href')).toBe('https://ada.example')
  })

  it('links an author who has a link and prints the name of one who has none', () => {
    const wrapper = mountHome({
      projectAuthors: [
        { name: 'Ada', link: 'https://ada.example', affiliation: 'NYU' },
        { name: 'Grace', affiliation: 'Yale' },
      ],
    })
    const items = wrapper.findAll('header ul')[0].findAll('li')
    expect(items[0].find('a').attributes('href')).toBe('https://ada.example')
    expect(items[1].find('a').exists()).toBe(false)
    expect(items[1].find('span').text()).toBe('Grace')
  })

  it('lists each affiliation once and numbers the authors by it', () => {
    const wrapper = mountHome({
      projectAuthors: [
        { name: 'Ada', affiliation: 'NYU' },
        { name: 'Grace', affiliation: ['Yale', 'NYU'] },
        { name: 'Alan', affiliation: 'Yale' },
      ],
    })
    const [authors, affiliations] = wrapper.findAll('header ul')
    expect(affiliations.findAll('li').map(li => li.text().replace(/\s+/g, ' '))).toEqual(['1 NYU', '2 Yale'])
    const marks = authors.findAll('li').map(li => li.find('sup').text().replace(/\s+/g, ''))
    expect(marks).toEqual(['1', '2,1', '2'])
  })

  it('shows project info, as a link when it has one', () => {
    const wrapper = mountHome({
      info: [
        { title: 'Paper', data: 'Preprint', link: 'https://paper.example' },
        { title: 'Year', data: '2026' },
      ],
    })
    const header = wrapper.find('header')
    expect(header.text()).toContain('Paper')
    expect(header.find('a[href="https://paper.example"]').text()).toBe('Preprint')
    expect(header.text()).toContain('2026')
    expect(header.findAll('a[target="_blank"]').filter(a => a.text() === '2026')).toHaveLength(0)
  })

  it('has no info column when there is no info', () => {
    const wrapper = mountHome({ info: [] })
    expect(wrapper.findAll('header h2').map(h => h.text())).toEqual(['Authors', 'Affiliations'])
  })

  it('shows a description given as one string as one paragraph, and a list as several', () => {
    expect(mountHome({ description: 'One paragraph.' }).findAll('main p').map(p => p.text())).toEqual(['One paragraph.'])
    expect(mountHome({ description: ['First.', 'Second.'] }).findAll('main p').map(p => p.text())).toEqual(['First.', 'Second.'])
  })

  it('numbers the cards, and a card without a label uses its title on the button', () => {
    const wrapper = mountHome({
      sections: [
        { title: 'Instructions', description: 'Read them', label: 'Read', view: 'instructions' },
        { title: 'The task', view: 'exp' },
      ],
    })
    const [first, second] = cards(wrapper)
    expect(first.text()).toMatch(/^01\s*Instructions\s*Read them\s*Read$/)
    expect(second.text()).toMatch(/^02\s*The task\s*The task$/)
  })

  it('the first card spans both columns only when the number of cards is odd', () => {
    const section = { title: 'A', view: 'a' }
    expect(cards(mountHome({ sections: [section, section, section] }))[0].classes()).toContain('md:col-span-2')
    expect(cards(mountHome({ sections: [section, section] }))[0].classes()).not.toContain('md:col-span-2')
  })

  it('a card with a view goes to that view', async () => {
    const wrapper = mountHome({ sections: [{ title: 'A', view: 'a' }, { title: 'B', view: 'b' }] })
    await cards(wrapper)[1].trigger('click')
    expect(fake.api.goToView).toHaveBeenCalledWith('b')
  })

  it('a card with an address opens that address and does not change the view', async () => {
    const original = window.location
    Object.defineProperty(window, 'location', { value: { href: 'http://localhost/' }, writable: true, configurable: true })
    try {
      const wrapper = mountHome({ sections: [{ title: 'Paper', href: 'https://paper.example', view: 'ignored' }] })
      await cards(wrapper)[0].trigger('click')
      expect(window.location.href).toBe('https://paper.example')
      expect(fake.api.goToView).not.toHaveBeenCalled()
    }
    finally {
      Object.defineProperty(window, 'location', { value: original, writable: true, configurable: true })
    }
  })

  it('a card with neither a view nor an address does nothing', async () => {
    const wrapper = mountHome({ sections: [{ title: 'Nothing' }] })
    await cards(wrapper)[0].trigger('click')
    expect(fake.api.goToView).not.toHaveBeenCalled()
  })
})
