/**
 * @fileoverview The dev console: its rail of tabs (SmileDevConsole), the log
 * (ConsoleLogPanel), and the data and configuration browsers
 * (ConsoleDatabaseBrowsePanel with DatabaseList, ConsoleConfigPanel with
 * ConfigList).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { nextTick } from 'vue'
import SmileDevConsole from '../../src/runtime/components/dev/console/SmileDevConsole.vue'
import ConsoleLogPanel from '../../src/runtime/components/dev/console/ConsoleLogPanel.vue'
import ConsoleConfigPanel from '../../src/runtime/components/dev/console/ConsoleConfigPanel.vue'
import ConsoleDatabaseBrowsePanel from '../../src/runtime/components/dev/console/ConsoleDatabaseBrowsePanel.vue'
import ConfigList from '../../src/runtime/components/dev/console/ConfigList.vue'
import DatabaseList from '../../src/runtime/components/dev/console/DatabaseList.vue'
import useLog from '../../src/runtime/stores/log'
import { createStore, createFakeApi, mountComponent, moduleComponents } from '../components/mount'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))

// What the browsers list: api.all_data and api.all_config
const DATA = {
  private: { recruitmentInfo: { service: 'prolific', id: 'p-1' } },
  data: {
    recruitmentService: 'prolific',
    trialNum: 0,
    done: false,
    withdrawData: null,
    conditions: { taskOrder: 'AB', nested: { deep: { deeper: { deepest: 1 } } } },
    studyData: [{ rt: 512 }, { rt: 640 }],
    empty: {},
    aVeryLongFieldNameThatGoesOnAndOn: 'a value that is much longer than twenty characters',
  },
}
const CONFIG = {
  browserPersisted: { knownUser: true },
  dev: { showConsoleBar: true },
  code: { owner: 'nyuccl', branch: 'main' },
  config: {
    mode: 'development',
    maxWrites: 1000,
    labURL: null,
    windowsizerRequest: { width: 800, height: 600 },
    github: { owner: 'nyuccl', commit: { hash: 'abc1234', author: { name: 'Ada' } } },
    aSettingWithAVeryLongNameThatGoesPastThirty: 'a value that is much longer than thirty characters',
  },
}

/**
 * Makes the store and the fake API.
 * @param {object} [dev] - Parts of the store's dev state
 * @returns {{ pinia: object, store: object }} The Pinia and the store
 */
function setup(dev = {}) {
  const { pinia, store } = createStore((s) => {
    Object.assign(s.dev, {
      consoleBarTab: 'browse',
      showConsoleBar: true,
      consoleBarHeight: 300,
      dataPath: null,
      configPath: null,
      searchParams: '',
      logFilter: 'All',
      notificationFilter: 'All',
      lastViewLimit: false,
    }, dev)
  })
  fake.api = createFakeApi(store, { all_data: structuredClone(DATA), all_config: structuredClone(CONFIG) })
  return { pinia, store }
}

let wrapper
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

// A list's rows: "key: value" for a value, "key >" for something to open
const rows = list => list.findAll('li').map((li) => {
  if (li.find('button').exists()) return `${li.find('.item-key').text()} >`
  if (li.find('.primitive-item').exists()) return li.find('.item-key').text() + li.find('.item-value').text()
  return li.text()
})
const open = (list, key) => list.findAll('button').find(b => b.text() === key).trigger('click')
const crumbs = () => wrapper.find('nav').findAll('button').map(b => b.text() || '/')

describe.each([
  ['DatabaseList', DatabaseList, '/.data', '/.data.conditions'],
  ['ConfigList', ConfigList, '/.config', '/.config.windowsizerRequest'],
])('%s', (name, List, top, nestedPath) => {
  const mountList = (props) => {
    const { pinia } = setup()
    wrapper = mountComponent(List, { pinia, props })
  }

  it('shows nothing without a path', () => {
    mountList({ data: null })
    expect(wrapper.findAll('li')).toHaveLength(0)
    expect(wrapper.find('.font-mono').exists()).toBe(false)
  })

  it('the root path lists the top-level sections under a house icon', () => {
    mountList({ data: '/' })
    expect(wrapper.find('aside > div').find('svg').exists()).toBe(true)
    expect(rows(wrapper)).toEqual(name === 'DatabaseList'
      ? ['private >', 'data >']
      : ['browserPersisted >', 'dev >', 'code >', 'config >'])
  })

  it('a path\'s header is its last part', () => {
    mountList({ data: nestedPath })
    expect(wrapper.find('aside > div').text()).toBe(nestedPath.split('.').pop())
  })

  it('a click on something to open emits its key', async () => {
    mountList({ data: top })
    const key = name === 'DatabaseList' ? 'conditions' : 'github'
    await open(wrapper, key)
    expect(wrapper.emitted('selected')).toEqual([[key]])
  })

  it('highlights the selected key', () => {
    const key = name === 'DatabaseList' ? 'conditions' : 'github'
    mountList({ data: top, selected: key })
    const marked = wrapper.findAll('button').filter(b => b.classes().includes('bg-sd-selected'))
    expect(marked.map(b => b.text())).toEqual([key])
  })
})

describe('DatabaseList', () => {
  const mountList = (data) => {
    const { pinia } = setup()
    wrapper = mountComponent(DatabaseList, { pinia, props: { data } })
  }

  it('lists values as key: value and objects and arrays as things to open', () => {
    mountList('/.data')
    expect(rows(wrapper)).toEqual([
      'recruitmentService: prolific',
      'trialNum: 0',
      'done: false',
      'withdrawData: null',
      'conditions >',
      'studyData >',
      'empty >',
      // Keys and values are cut at 20 characters
      'aVeryLongFieldNameTh...: a value that is much...',
    ])
  })

  it('lists an array by index', () => {
    mountList('/.data.studyData')
    expect(rows(wrapper)).toEqual(['0 >', '1 >'])
  })

  it('says an empty object is empty', () => {
    mountList('/.data.empty')
    expect(rows(wrapper)).toEqual(['Empty currently'])
  })
})

describe('ConfigList', () => {
  const mountList = (data) => {
    const { pinia } = setup()
    wrapper = mountComponent(ConfigList, { pinia, props: { data } })
  }

  it('lists values as key: value and objects as things to open', () => {
    mountList('/.config')
    expect(rows(wrapper)).toEqual([
      'mode: development',
      'maxWrites: 1000',
      'labURL: null',
      'windowsizerRequest >',
      'github >',
      // Keys and values are cut at 30 characters
      'aSettingWithAVeryLongNameThatG...: a value that is much longer th...',
    ])
  })
})

describe('ConsoleDatabaseBrowsePanel', () => {
  const mountPanel = (dev) => {
    const { pinia, store } = setup(dev)
    wrapper = mountComponent(ConsoleDatabaseBrowsePanel, { pinia })
    return store
  }
  const lists = () => wrapper.findAllComponents(DatabaseList)

  it('starts at the root, with the other two panels empty', () => {
    mountPanel()
    expect(crumbs()).toEqual(['/'])
    expect(rows(lists()[0])).toEqual(['private >', 'data >'])
    expect(rows(lists()[1])).toEqual([])
    expect(rows(lists()[2])).toEqual([])
  })

  it('opening a section shows it in the next panel and stores the path', async () => {
    const store = mountPanel()
    await open(lists()[0], 'data')
    expect(crumbs()).toEqual(['/', 'data'])
    expect(rows(lists()[1])).toContain('conditions >')
    expect(JSON.parse(store.dev.dataPath)).toEqual(['/', 'data', null])
    await open(lists()[1], 'conditions')
    expect(crumbs()).toEqual(['/', 'data', 'conditions'])
    expect(rows(lists()[2])).toEqual(['taskOrder: AB', 'nested >'])
    expect(JSON.parse(store.dev.dataPath)).toEqual(['/', 'data', 'conditions'])
  })

  it('opening something in the last panel moves every panel one level down', async () => {
    const store = mountPanel({ dataPath: JSON.stringify(['/', 'data', 'conditions']) })
    await nextTick()
    await open(lists()[2], 'nested')
    expect(crumbs()).toEqual(['/', 'data', 'conditions', 'nested'])
    expect(lists().map(l => l.props('data'))).toEqual(['/.data', '/.data.conditions', '/.data.conditions.nested'])
    expect(rows(lists()[2])).toEqual(['deep >'])
    expect(JSON.parse(store.dev.dataPath)).toEqual(['/', 'data', 'conditions', 'nested'])
  })

  it('comes back at the stored path', async () => {
    mountPanel({ dataPath: JSON.stringify(['/', 'private', 'recruitmentInfo']) })
    await nextTick()
    expect(crumbs()).toEqual(['/', 'private', 'recruitmentInfo'])
    expect(rows(lists()[2])).toEqual(['service: prolific', 'id: p-1'])
    expect(lists()[0].props('selected')).toBe('private')
    expect(lists()[1].props('selected')).toBe('recruitmentInfo')
  })

  it('a choice in the first panel replaces what the second had open', async () => {
    mountPanel({ dataPath: JSON.stringify(['/', 'data', 'conditions']) })
    await nextTick()
    await open(lists()[0], 'private')
    expect(crumbs()).toEqual(['/', 'private'])
    expect(rows(lists()[1])).toEqual(['recruitmentInfo >'])
    expect(rows(lists()[2])).toEqual([])
  })

  it('a click on the root breadcrumb goes back to the root', async () => {
    mountPanel({ dataPath: JSON.stringify(['/', 'data', 'conditions', 'nested']) })
    await nextTick()
    await wrapper.find('nav').findAll('button')[0].trigger('click')
    expect(crumbs()).toEqual(['/'])
    expect(rows(lists()[0])).toEqual(['private >', 'data >'])
    expect(rows(lists()[1])).toEqual([])
  })

  it('a click on a breadcrumb closes what is after it', async () => {
    mountPanel({ dataPath: JSON.stringify(['/', 'data', 'conditions']) })
    await nextTick()
    await wrapper.find('nav').findAll('button')[1].trigger('click')
    expect(crumbs()).toEqual(['/', 'data'])
    expect(rows(lists()[2])).toEqual([])
  })
})

describe('ConsoleConfigPanel', () => {
  const mountPanel = (dev) => {
    const { pinia, store } = setup(dev)
    wrapper = mountComponent(ConsoleConfigPanel, { pinia })
    return store
  }
  const lists = () => wrapper.findAllComponents(ConfigList)

  it('starts at the root, with a link to the configuration docs', () => {
    mountPanel()
    expect(crumbs()).toEqual(['/'])
    expect(rows(lists()[0])).toEqual(['browserPersisted >', 'dev >', 'code >', 'config >'])
    expect(rows(lists()[1])).toEqual([])
    expect(wrapper.find('a').attributes('href')).toBe('https://smile.gureckislab.org/configuration.html')
  })

  it('opening a section shows it in the next panel and stores the path', async () => {
    const store = mountPanel()
    await open(lists()[0], 'config')
    expect(crumbs()).toEqual(['/', 'config'])
    expect(rows(lists()[1])).toContain('mode: development')
    expect(JSON.parse(store.dev.configPath)).toEqual(['/', 'config', null])
    await open(lists()[1], 'github')
    expect(crumbs()).toEqual(['/', 'config', 'github'])
    expect(rows(lists()[2])).toEqual(['owner: nyuccl', 'commit >'])
    expect(JSON.parse(store.dev.configPath)).toEqual(['/', 'config', 'github'])
  })

  it('opening an object in the last panel moves every panel one level down', async () => {
    const store = mountPanel({ configPath: JSON.stringify(['/', 'config', 'github']) })
    await nextTick()
    await open(lists()[2], 'commit')
    expect(crumbs()).toEqual(['/', 'config', 'github', 'commit'])
    expect(rows(lists()[2])).toEqual(['hash: abc1234', 'author >'])
    expect(JSON.parse(store.dev.configPath)).toEqual(['/', 'config', 'github', 'commit'])
  })

  it('a value chosen in the last panel is not opened', async () => {
    const store = mountPanel({ configPath: JSON.stringify(['/', 'config', 'github']) })
    await nextTick()
    lists()[2].vm.$emit('selected', 'owner')
    await nextTick()
    expect(crumbs()).toEqual(['/', 'config', 'github'])
    expect(JSON.parse(store.dev.configPath)).toEqual(['/', 'config', 'github'])
  })

  it('a choice in the first panel replaces what the second had open', async () => {
    mountPanel({ configPath: JSON.stringify(['/', 'config', 'github']) })
    await nextTick()
    await open(lists()[0], 'code')
    expect(crumbs()).toEqual(['/', 'code'])
    expect(rows(lists()[1])).toEqual(['owner: nyuccl', 'branch: main'])
    expect(rows(lists()[2])).toEqual([])
  })

  it('a click on a breadcrumb closes what is after it', async () => {
    mountPanel({ configPath: JSON.stringify(['/', 'config', 'github', 'commit']) })
    await nextTick()
    await wrapper.find('nav').findAll('button')[1].trigger('click')
    expect(crumbs()).toEqual(['/', 'config'])
    expect(rows(lists()[1])).toContain('github >')
    expect(rows(lists()[2])).toEqual([])
  })
})

describe('ConsoleLogPanel', () => {
  const HISTORY = [
    { type: 'log', time: '12:00:01', message: 'ROUTER GUARD: going to /consent', trace: 'guard.js:10' },
    { type: 'debug', time: '12:00:02', message: 'SMILESTORE: syncing', trace: 'store.js:20' },
    { type: 'warn', time: '12:00:03', message: 'DEV MODE: slow save', trace: 'dev.js:30' },
    { type: 'error', time: '12:00:04', message: 'DATABASE: save failed', trace: 'db.js:40' },
    { type: 'success', time: '12:00:05', message: 'TIMELINE STEPPER: built', trace: 'timeline.js:50' },
    { type: 'log', time: '12:00:06', message: 'TRIAL STEPPER: step 2', trace: 'stepper.js:60' },
    { type: 'log', time: '12:00:07', message: 'a plain message', trace: 'view.vue:70' },
  ]
  const PAGE = HISTORY.slice(5)

  const mountPanel = (dev, page = PAGE) => {
    const { pinia, store } = setup({ consoleBarTab: 'log', ...dev })
    vi.mocked(useLog).mockReturnValue({ history: HISTORY, page_history: page })
    wrapper = mountComponent(ConsoleLogPanel, { pinia })
    return store
  }
  const messages = () => wrapper.findAll('.sd-log-row').map(li => li.find('.sd-log-message').text())
  const selects = () => wrapper.findAllComponents(moduleComponents.Select)

  it('shows every message with its time and where it was logged', () => {
    mountPanel()
    expect(messages()).toHaveLength(7)
    expect(messages()[0]).toBe('12:00:01 ROUTER GUARD: going to /consent')
    expect(wrapper.findAll('.sd-log-trace')[0].text()).toBe('guard.js:10')
  })

  it('tints debug, warning, error and success messages', () => {
    mountPanel()
    const tints = wrapper.findAll('.sd-log-row').map(li => li.classes().find(c => c.startsWith('sd-log-') && c !== 'sd-log-row') ?? null)
    expect(tints).toEqual([null, 'sd-log-debug', 'sd-log-warn', 'sd-log-error', 'sd-log-ok', null, null])
  })

  it.each([false, true])('gives each kind of message its icon (since last view: %s)', (lastViewLimit) => {
    // Every message is in the current view here, so both lists show them all
    mountPanel({ lastViewLimit }, HISTORY)
    const icons = wrapper.findAll('.sd-log-row').map(li => li.find('.sd-log-icon svg').classes().find(c => /^lucide-.*-icon$/.test(c)))
    expect(icons).toEqual(['git-branch', 'database', 'settings', 'database', 'clock', 'timer', 'chevron-right'].map(n => `lucide-${n}-icon`))
  })

  it('with "since last view" on, shows only the messages of the current view', async () => {
    const store = mountPanel({ lastViewLimit: true })
    expect(messages()).toEqual(['12:00:06 TRIAL STEPPER: step 2', '12:00:07 a plain message'])
    store.dev.lastViewLimit = false
    await nextTick()
    expect(messages()).toHaveLength(7)
  })

  it('the "since last view" switch changes the stored setting', async () => {
    const store = mountPanel()
    await wrapper.findComponent(moduleComponents.Switch).find('button').trigger('click')
    expect(store.dev.lastViewLimit).toBe(true)
    expect(messages()).toHaveLength(2)
  })

  it('typing in the search box keeps the messages that contain the text, in any case', async () => {
    const store = mountPanel()
    await wrapper.find('input').setValue('stepper')
    expect(store.dev.searchParams).toBe('stepper')
    expect(messages()).toEqual(['12:00:05 TIMELINE STEPPER: built', '12:00:06 TRIAL STEPPER: step 2'])
  })

  it.each([
    ['All', 7],
    ['Debug only', ['SMILESTORE: syncing']],
    ['Warnings and Errors only', ['DEV MODE: slow save', 'DATABASE: save failed']],
    ['Warnings only', ['DEV MODE: slow save']],
    ['Errors only', ['DATABASE: save failed']],
  ])('the filter "%s" keeps the messages of that type', (logFilter, expected) => {
    mountPanel({ logFilter })
    if (typeof expected === 'number') expect(messages()).toHaveLength(expected)
    else expect(messages().map(m => m.slice(9))).toEqual(expected)
  })

  it('the filter and the search apply together, to the current view\'s messages too', () => {
    mountPanel({ lastViewLimit: true, logFilter: 'Errors only' })
    expect(messages()).toEqual([])
  })

  // The Selects' menus do not open in happy-dom: the choice is made by
  // emitting update:modelValue, as choosing an item does.
  it('choosing a filter stores it and filters the list', async () => {
    const store = mountPanel()
    selects()[0].vm.$emit('update:modelValue', 'Errors only')
    await nextTick()
    expect(store.dev.logFilter).toBe('Errors only')
    expect(messages()).toEqual(['12:00:04 DATABASE: save failed'])
  })

  it('choosing which notifications to show stores it', async () => {
    const store = mountPanel()
    selects()[1].vm.$emit('update:modelValue', 'Errors only')
    await nextTick()
    expect(store.dev.notificationFilter).toBe('Errors only')
  })

  it('the list is as tall as the console less its control bar', () => {
    mountPanel({ consoleBarHeight: 400 })
    expect(wrapper.find('.overflow-y-scroll').attributes('style')).toContain('height: 345px')
  })
})

describe('SmileDevConsole', () => {
  const mountConsole = (dev) => {
    const { pinia, store } = setup(dev)
    vi.mocked(useLog).mockReturnValue({ history: [], page_history: [] })
    wrapper = mountComponent(SmileDevConsole, { pinia, attachTo: document.body })
    return store
  }
  const shown = () => ({
    browse: wrapper.findComponent(ConsoleDatabaseBrowsePanel).exists(),
    log: wrapper.findComponent(ConsoleLogPanel).exists(),
    config: wrapper.findComponent(ConsoleConfigPanel).exists(),
  })
  const rail = () => wrapper.find('.sd-rail').findAll('button')

  it.each(['browse', 'log', 'config'])('shows the panel of the stored tab: %s', (tab) => {
    mountConsole({ consoleBarTab: tab })
    expect(shown()).toEqual({ browse: tab === 'browse', log: tab === 'log', config: tab === 'config' })
    const marked = rail().map(b => b.classes().includes('bg-sd-selected'))
    expect(marked).toEqual([tab === 'browse', tab === 'log', tab === 'config', false])
  })

  it('the rail\'s buttons change the tab', async () => {
    const store = mountConsole()
    await rail()[1].trigger('click')
    expect(store.dev.consoleBarTab).toBe('log')
    expect(shown()).toEqual({ browse: false, log: true, config: false })
    await rail()[2].trigger('click')
    expect(store.dev.consoleBarTab).toBe('config')
    expect(shown()).toEqual({ browse: false, log: false, config: true })
    await rail()[0].trigger('click')
    expect(store.dev.consoleBarTab).toBe('browse')
    expect(shown()).toEqual({ browse: true, log: false, config: false })
  })

  it('a rail button shows its name when it has the keyboard focus', async () => {
    mountConsole()
    for (const [i, name] of ['Data Explorer', 'Narrative Log', 'Configuration', 'Hide Console'].entries()) {
      await rail()[i].trigger('focus')
      await vi.waitFor(() => expect(document.body.textContent).toContain(name))
      await rail()[i].trigger('blur')
    }
  })

  it('the bottom button hides the console', async () => {
    const store = mountConsole()
    await rail()[3].trigger('click')
    expect(store.dev.showConsoleBar).toBe(false)
  })
})
