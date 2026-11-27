/**
 * @fileoverview The data dashboard: the project list (real / testing,
 * grouping, search), a project's records, one record's data, and what a
 * failed request shows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import SmileDevDashboardView from '../../src/runtime/components/dev/dashboard/SmileDevDashboardView.vue'
import { mountComponent, moduleComponents } from '../components/mount'

const PROJECTS = [
  { id: 'p-alpha', owner: 'zoe', repo: 'alpha', branch: 'main', mode: 'live', recordCount: 3, lastUpdated: '2026-01-01T00:00:00Z' },
  { id: 'p-beta', owner: 'adam', repo: 'beta', branch: 'main', mode: 'live', recordCount: 7, lastUpdated: '2026-03-01T00:00:00Z' },
  { id: 'p-beta-dev', owner: 'adam', repo: 'beta', branch: 'dev', mode: 'live', recordCount: 1, lastUpdated: null },
  { id: 'p/test 1', owner: 'adam', repo: 'gamma', branch: 'main', mode: 'test', recordCount: 2, lastUpdated: 'not a date' },
]
const RECORDS = [
  { id: 'rec/1', createdAt: '2026-02-03T10:00:00Z' },
  { id: 'rec-2', createdAt: null },
  { id: 'rec-3', createdAt: 'yesterday-ish' },
]

let fetchMock
let routes

/**
 * Mounts the dashboard and waits for the project list.
 * @returns {Promise<object>} The wrapper
 */
async function mountDashboard() {
  const wrapper = mountComponent(SmileDevDashboardView)
  await flushPromises()
  return wrapper
}

const cards = wrapper => wrapper.findAll('.project-card')
const cardNames = wrapper => cards(wrapper).map(c => `${c.find('.project-name').text()}/${c.find('.branch-badge').text()}`)
const pane = (wrapper, name) => wrapper.find(`.${name}-pane`)
const records = wrapper => pane(wrapper, 'records').findAll('.list-item')

/**
 * Switches between real and testing data. (reka-ui's tab triggers don't
 * react to a click in happy-dom, so the Tabs component's value is set as
 * the trigger would set it.)
 * @param {object} wrapper - The wrapper
 * @param {'live'|'test'} mode - The tab
 */
async function showTab(wrapper, mode) {
  wrapper.findComponent(moduleComponents.Tabs).vm.$emit('update:modelValue', mode)
  await flushPromises()
}

/**
 * Picks how the projects are grouped (set on the ToggleGroup, as a click on an item would).
 * @param {object} wrapper - The wrapper
 * @param {'user'|'repo'|'updated'} view - The grouping
 */
async function groupBy(wrapper, view) {
  wrapper.findComponent(moduleComponents.ToggleGroup).vm.$emit('update:modelValue', view)
  await flushPromises()
}

describe('SmileDevDashboardView', () => {
  beforeEach(() => {
    routes = {
      projects: async () => PROJECTS,
      participants: async () => RECORDS,
      record: async () => ({ data: { trials: [1, 2], done: true } }),
    }
    fetchMock = vi.fn(async (url) => {
      if (url === '/api/projects') return routes.projects()
      if (/\/participants$/.test(url)) return routes.participants(url)
      if (/\/participants\//.test(url)) return routes.record(url)
      throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('$fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('the project list', () => {
    it('shows the real projects, newest first, with branch and record count', async () => {
      const wrapper = await mountDashboard()
      expect(cardNames(wrapper)).toEqual(['beta/main', 'alpha/main', 'beta/dev'])
      expect(cards(wrapper)[0].find('.record-count').text()).toBe('7')
      expect(cards(wrapper)[0].find('.record-count').attributes('title')).toBe('7 records')
      expect(wrapper.find('.group-label').exists()).toBe(false)
    })

    it('counts the real and the testing projects on the tabs', async () => {
      const wrapper = await mountDashboard()
      expect(wrapper.findAll('.tab-count').map(s => s.text())).toEqual(['3', '1'])
    })

    it('the testing tab shows the testing projects', async () => {
      const wrapper = await mountDashboard()
      await showTab(wrapper, 'test')
      expect(cardNames(wrapper)).toEqual(['gamma/main'])
    })

    it('says so while the projects load', async () => {
      let finish
      routes.projects = () => new Promise((resolve) => {
        finish = () => resolve(PROJECTS)
      })
      const wrapper = await mountDashboard()
      expect(pane(wrapper, 'projects').find('.empty').text()).toBe('Loading…')
      expect(wrapper.find('button[title="Refresh"]').attributes('disabled')).toBeDefined()
      finish()
      await flushPromises()
      expect(cards(wrapper)).toHaveLength(3)
      expect(wrapper.find('button[title="Refresh"]').attributes('disabled')).toBeUndefined()
    })

    it('says there is no data yet for a mode with no projects', async () => {
      routes.projects = async () => PROJECTS.filter(p => p.mode === 'test')
      const wrapper = await mountDashboard()
      expect(pane(wrapper, 'projects').find('.empty').text()).toBe('No real data yet.')
      routes.projects = async () => []
      await wrapper.find('button[title="Refresh"]').trigger('click')
      await flushPromises()
      await showTab(wrapper, 'test')
      expect(pane(wrapper, 'projects').find('.empty').text()).toBe('No testing data yet.')
    })

    it.each([
      ['the server\'s status message', { statusMessage: 'Not linked', message: 'x' }, 'Not linked'],
      ['the error\'s message', new Error('Network down'), 'Network down'],
      ['a general message when the error has none', {}, 'Failed to load projects'],
    ])('a failed request shows %s and no projects', async (_what, error, shown) => {
      routes.projects = async () => {
        throw error
      }
      const wrapper = await mountDashboard()
      expect(pane(wrapper, 'projects').find('.empty').text()).toBe(shown)
      expect(cards(wrapper)).toHaveLength(0)
      expect(wrapper.findAll('.tab-count').map(s => s.text())).toEqual(['0', '0'])
    })

    it('refresh asks again and clears the error', async () => {
      routes.projects = async () => {
        throw new Error('Network down')
      }
      const wrapper = await mountDashboard()
      routes.projects = async () => PROJECTS
      await wrapper.find('button[title="Refresh"]').trigger('click')
      await flushPromises()
      expect(fetchMock.mock.calls.filter(c => c[0] === '/api/projects')).toHaveLength(2)
      expect(wrapper.text()).not.toContain('Network down')
      expect(cards(wrapper)).toHaveLength(3)
    })
  })

  describe('grouping and search', () => {
    it('groups by GitHub user, users and projects in alphabetical order', async () => {
      const wrapper = await mountDashboard()
      await groupBy(wrapper, 'user')
      expect(wrapper.findAll('.group-label').map(g => g.text())).toEqual(['adam', 'zoe'])
      expect(cardNames(wrapper)).toEqual(['beta/dev', 'beta/main', 'alpha/main'])
    })

    it('groups by repo', async () => {
      const wrapper = await mountDashboard()
      await groupBy(wrapper, 'repo')
      expect(wrapper.findAll('.group-label').map(g => g.text())).toEqual(['alpha', 'beta'])
      expect(wrapper.findAll('.project-group')[1].findAll('.project-card')).toHaveLength(2)
    })

    it('puts a project with no owner under Other', async () => {
      routes.projects = async () => [...PROJECTS, { id: 'p-x', repo: 'delta', branch: 'main', mode: 'live', recordCount: 0 }]
      const wrapper = await mountDashboard()
      await groupBy(wrapper, 'user')
      expect(wrapper.findAll('.group-label').map(g => g.text())).toEqual(['adam', 'Other', 'zoe'])
    })

    it('search matches owner, repo, branch or id, whatever the case', async () => {
      const wrapper = await mountDashboard()
      const input = wrapper.find('input[placeholder="Search projects…"]')
      await input.setValue('ZOE')
      expect(cardNames(wrapper)).toEqual(['alpha/main'])
      await input.setValue(' dev ')
      expect(cardNames(wrapper)).toEqual(['beta/dev'])
      await input.setValue('p-beta')
      expect(cardNames(wrapper)).toEqual(['beta/main', 'beta/dev'])
      await input.setValue('')
      expect(cards(wrapper)).toHaveLength(3)
    })

    it('says which search matched nothing', async () => {
      const wrapper = await mountDashboard()
      await wrapper.find('input[placeholder="Search projects…"]').setValue('nope')
      expect(pane(wrapper, 'projects').find('.empty').text()).toBe('No projects match “nope”.')
    })
  })

  describe('records', () => {
    it('asks to pick a project first', async () => {
      const wrapper = await mountDashboard()
      expect(pane(wrapper, 'records').find('.empty').text()).toBe('Select a project.')
      expect(pane(wrapper, 'detail').find('.empty').text()).toBe('Select a record.')
    })

    it('a click on a project marks it and lists its records with their count', async () => {
      const wrapper = await mountDashboard()
      await cards(wrapper)[0].trigger('click')
      await flushPromises()
      expect(fetchMock).toHaveBeenCalledWith('/api/projects/p-beta/participants')
      expect(cards(wrapper)[0].classes()).toContain('selected')
      expect(pane(wrapper, 'records').find('.pane-title').text()).toBe('Records (3)')
      expect(records(wrapper).map(r => r.find('.font-mono').text())).toEqual(['rec/1', 'rec-2', 'rec-3'])
    })

    it('shows when each record was made: a date, a dash for none, the raw value when it is not a date', async () => {
      const wrapper = await mountDashboard()
      await cards(wrapper)[0].trigger('click')
      await flushPromises()
      const dates = records(wrapper).map(r => r.find('.text-muted-foreground.block').text())
      expect(dates).toEqual([new Date('2026-02-03T10:00:00Z').toLocaleString(), '—', 'yesterday-ish'])
    })

    it('encodes the project id in the address', async () => {
      const wrapper = await mountDashboard()
      await showTab(wrapper, 'test')
      await cards(wrapper)[0].trigger('click')
      await flushPromises()
      expect(fetchMock).toHaveBeenCalledWith('/api/projects/p%2Ftest%201/participants')
    })

    it('says so while the records load, with no count yet', async () => {
      let finish
      routes.participants = () => new Promise((resolve) => {
        finish = () => resolve([])
      })
      const wrapper = await mountDashboard()
      await cards(wrapper)[0].trigger('click')
      expect(pane(wrapper, 'records').find('.empty').text()).toBe('Loading…')
      expect(pane(wrapper, 'records').find('.pane-title').text()).toBe('Records')
      finish()
      await flushPromises()
      expect(pane(wrapper, 'records').find('.empty').text()).toBe('No records in this project.')
      expect(pane(wrapper, 'records').find('.pane-title').text()).toBe('Records (0)')
    })

    it.each([
      [{ statusMessage: 'Forbidden' }, 'Forbidden'],
      [new Error('Timed out'), 'Timed out'],
      [null, 'Failed to load records'],
    ])('a failed request shows why (%#)', async (error, shown) => {
      routes.participants = async () => {
        throw error
      }
      const wrapper = await mountDashboard()
      await cards(wrapper)[0].trigger('click')
      await flushPromises()
      expect(pane(wrapper, 'records').find('.empty').text()).toBe(shown)
      expect(records(wrapper)).toHaveLength(0)
    })

    it('another project replaces the records and closes the open record', async () => {
      const wrapper = await mountDashboard()
      await cards(wrapper)[0].trigger('click')
      await flushPromises()
      await records(wrapper)[1].trigger('click')
      await flushPromises()
      expect(pane(wrapper, 'detail').find('pre').exists()).toBe(true)
      routes.participants = async () => [{ id: 'other-1', createdAt: null }]
      await cards(wrapper)[1].trigger('click')
      await flushPromises()
      expect(records(wrapper).map(r => r.find('.font-mono').text())).toEqual(['other-1'])
      expect(pane(wrapper, 'detail').find('.empty').text()).toBe('Select a record.')
    })

    it('changing between real and testing clears the project, its records and the record', async () => {
      const wrapper = await mountDashboard()
      await cards(wrapper)[0].trigger('click')
      await flushPromises()
      await records(wrapper)[1].trigger('click')
      await flushPromises()
      await showTab(wrapper, 'test')
      expect(pane(wrapper, 'records').find('.empty').text()).toBe('Select a project.')
      expect(pane(wrapper, 'detail').find('.empty').text()).toBe('Select a record.')
      expect(wrapper.find('.project-card.selected').exists()).toBe(false)
    })
  })

  describe('one record', () => {
    /**
     * Mounts, opens the first project and clicks one of its records.
     * @param {number} [index] - Which record
     * @returns {Promise<object>} The wrapper
     */
    async function openRecord(index = 1) {
      const wrapper = await mountDashboard()
      await cards(wrapper)[0].trigger('click')
      await flushPromises()
      await records(wrapper)[index].trigger('click')
      return wrapper
    }

    it('a click marks the record and shows its data as indented JSON', async () => {
      const wrapper = await openRecord()
      await flushPromises()
      expect(fetchMock).toHaveBeenCalledWith('/api/projects/p-beta/participants/rec-2')
      expect(records(wrapper)[1].classes()).toContain('selected')
      expect(pane(wrapper, 'detail').find('pre').text()).toBe(JSON.stringify({ trials: [1, 2], done: true }, null, 2))
    })

    it('encodes the record id in the address', async () => {
      await openRecord(0)
      expect(fetchMock).toHaveBeenCalledWith('/api/projects/p-beta/participants/rec%2F1')
    })

    it('shows the whole answer when it has no data field', async () => {
      routes.record = async () => ({ id: 'rec-2', consented: true })
      const wrapper = await openRecord()
      await flushPromises()
      expect(JSON.parse(pane(wrapper, 'detail').find('pre').text())).toEqual({ id: 'rec-2', consented: true })
    })

    it('shows an empty box for an empty answer', async () => {
      routes.record = async () => null
      const wrapper = await openRecord()
      await flushPromises()
      expect(pane(wrapper, 'detail').find('pre').text()).toBe('')
    })

    it('says so while the record loads', async () => {
      routes.record = () => new Promise(() => {})
      const wrapper = await openRecord()
      await flushPromises()
      expect(pane(wrapper, 'detail').find('.empty').text()).toBe('Loading…')
    })

    it.each([
      [{ statusMessage: 'Gone' }, 'Gone'],
      [new Error('Timed out'), 'Timed out'],
      [undefined, 'Failed to load record'],
    ])('a failed request shows why (%#)', async (error, shown) => {
      routes.record = async () => {
        throw error
      }
      const wrapper = await openRecord()
      await flushPromises()
      expect(pane(wrapper, 'detail').find('.empty').text()).toBe(shown)
      expect(pane(wrapper, 'detail').find('pre').exists()).toBe(false)
    })
  })
})
