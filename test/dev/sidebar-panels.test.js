/**
 * @fileoverview The dev side bar's other panels: study state and settings
 * (ConfigurationVariablesPanel), the seed and random variables
 * (RandomizationSidebarPanel), the study's name and version (StudyInfoPanel),
 * the database row of the Info tab, and the side bar that holds them all
 * (SmileDevSideBar).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import ConfigurationVariablesPanel from '../../src/runtime/components/dev/sidebar/ConfigurationVariablesPanel.vue'
import RandomizationSidebarPanel from '../../src/runtime/components/dev/sidebar/RandomizationSidebarPanel.vue'
import StudyInfoPanel from '../../src/runtime/components/dev/sidebar/StudyInfoPanel.vue'
import DatabaseStatusInfoPanel from '../../src/runtime/components/dev/sidebar/DatabaseStatusInfoPanel.vue'
import SmileDevSideBar from '../../src/runtime/components/dev/sidebar/SmileDevSideBar.vue'
import StepExplorerPanel from '../../src/runtime/components/dev/sidebar/StepExplorerPanel.vue'
import AppProgressPanel from '../../src/runtime/components/dev/sidebar/AppProgressPanel.vue'
import { createStore, createFakeApi, mountComponent, moduleComponents } from '../components/mount'
import { setFlags, resetFlags } from '../setup/flags'

// One API object for the whole file: the color mode composable keeps the
// first one it gets. Each test puts its own store and config on it.
const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))
vi.mock('../../src/runtime/composables/useViewAPI', async original => ({ ...(await original()), default: () => fake.api }))

/**
 * Makes a store and points the fake API at it.
 * @param {(store: object) => void} [more] - Sets the state the test needs
 * @returns {{ pinia: object, store: object }} The Pinia and the store
 */
function setup(more) {
  const { pinia, store } = createStore((s) => {
    // The store's config is one object shared by every store: give this one a copy
    s.config = {
      ...s.config,
      codeName: 'memory-study',
      mode: 'development',
      colorMode: 'light',
      responsiveUI: true,
      windowsizerAggressive: false,
      windowsizerRequest: { width: 800, height: 600 },
      maxWrites: 1000,
      github: { ...s.config.github, lastCommitHash: 'abc1234' },
    }
    s.dev.experimentColorMode = null
    if (more) more(s)
  })
  const next = createFakeApi(store, {
    config: store.config,
    connectDB: vi.fn(),
    // The step panel shows nothing without a stepper
    steps: null,
  })
  if (fake.api) Object.assign(fake.api, next)
  else fake.api = next
  return { pinia, store }
}

let wrapper
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  resetFlags()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const selects = () => wrapper.findAllComponents(moduleComponents.Select)
const switches = () => wrapper.findAllComponents(moduleComponents.Switch)
const checkboxes = () => wrapper.findAllComponents(moduleComponents.Checkbox)

describe('ConfigurationVariablesPanel', () => {
  const labelled = (components, label) => components.find(c => c.element.closest('label').textContent.includes(label))

  it('shows each study-state switch as the store has it', () => {
    const { pinia } = setup((s) => {
      s.cookieState.consented = true
      s.cookieState.done = true
      s.data.verifiedVisibility = true
    })
    wrapper = mountComponent(ConfigurationVariablesPanel, { pinia })
    const states = Object.fromEntries(wrapper.findAll('.sd-config-switch').map(l => [l.find('.sd-label').text(), l.find('button').attributes('aria-checked')]))
    expect(states).toEqual({ Consent: 'true', Known: 'false', Done: 'true', Withdrew: 'false', Visible: 'true' })
  })

  it.each([
    ['Consent', s => s.cookieState.consented],
    ['Known', s => s.cookieState.knownUser],
    ['Done', s => s.cookieState.done],
    ['Withdrew', s => s.cookieState.withdrawn],
    ['Visible', s => s.data.verifiedVisibility],
  ])('a click on the %s switch turns that state on, and a second turns it off', async (label, read) => {
    const { pinia, store } = setup()
    wrapper = mountComponent(ConfigurationVariablesPanel, { pinia })
    const button = wrapper.findAll('.sd-config-switch').find(l => l.text() === label).find('button')
    await button.trigger('click')
    expect(read(store)).toBe(true)
    await button.trigger('click')
    expect(read(store)).toBe(false)
  })

  it('the minimum window size fields show the config and change it', async () => {
    const { pinia, store } = setup()
    wrapper = mountComponent(ConfigurationVariablesPanel, { pinia })
    const width = wrapper.find('input[aria-label="minimum width"]')
    const height = wrapper.find('input[aria-label="minimum height"]')
    expect(width.element.value).toBe('800')
    expect(height.element.value).toBe('600')
    await width.setValue(1024)
    await wrapper.find('button[aria-label="Increase minimum height"]').trigger('click')
    expect(store.config.windowsizerRequest).toEqual({ width: 1024, height: 610 })
  })

  it('marks the window size row while the window is too small', async () => {
    const { pinia, store } = setup()
    wrapper = mountComponent(ConfigurationVariablesPanel, { pinia })
    const row = () => wrapper.findAll('.sd-config-row')[1]
    expect(row().classes()).not.toContain('sd-config-alert')
    store.browserEphemeral.tooSmall = true
    await nextTick()
    expect(row().classes()).toContain('sd-config-alert')
  })

  it('the Aggressive and Responsive UI checkboxes change the config', async () => {
    const { pinia, store } = setup()
    wrapper = mountComponent(ConfigurationVariablesPanel, { pinia })
    await labelled(checkboxes(), 'Aggressive').find('button').trigger('click')
    await labelled(checkboxes(), 'Responsive UI').find('button').trigger('click')
    expect(store.config.windowsizerAggressive).toBe(true)
    expect(store.config.responsiveUI).toBe(false)
  })

  it('the color mode shows the experiment\'s own setting until the dev tools pick one', async () => {
    const { pinia, store } = setup((s) => {
      s.config.colorMode = 'dark'
    })
    wrapper = mountComponent(ConfigurationVariablesPanel, { pinia })
    expect(selects()[0].text()).toBe('Dark')
    store.dev.experimentColorMode = 'light'
    await nextTick()
    expect(selects()[0].text()).toBe('Light')
  })

  it('a system color mode is shown with what the system prefers', () => {
    const { pinia } = setup((s) => {
      s.config.colorMode = 'system'
    })
    wrapper = mountComponent(ConfigurationVariablesPanel, { pinia })
    // happy-dom's matchMedia does not match prefers-color-scheme: dark
    expect(selects()[0].text()).toBe('System (light)')
  })

  it('a color mode that is not one of the three is shown as it is', () => {
    const { pinia } = setup((s) => {
      s.dev.experimentColorMode = 'sepia'
    })
    wrapper = mountComponent(ConfigurationVariablesPanel, { pinia })
    expect(selects()[0].text()).toBe('sepia')
  })

  // The Select's menu does not open in happy-dom: the choice is made by
  // emitting update:modelValue, as choosing an item does.
  it('choosing a color mode sets the dev tools\' mode and the config', async () => {
    const { pinia, store } = setup()
    wrapper = mountComponent(ConfigurationVariablesPanel, { pinia })
    selects()[0].vm.$emit('update:modelValue', 'dark')
    await nextTick()
    expect(store.dev.experimentColorMode).toBe('dark')
    expect(store.config.colorMode).toBe('dark')
    expect(selects()[0].text()).toBe('Dark')
  })

  it('choosing a recruitment service sets it on the data', async () => {
    const { pinia, store } = setup((s) => {
      s.data.recruitmentService = 'web'
      s.browserEphemeral.urls = { web: '?', prolific: '?PROLIFIC_PID=1' }
    })
    wrapper = mountComponent(ConfigurationVariablesPanel, { pinia })
    selects()[1].vm.$emit('update:modelValue', 'prolific')
    await nextTick()
    expect(store.data.recruitmentService).toBe('prolific')
  })
})

describe('RandomizationSidebarPanel', () => {
  let reload
  beforeEach(() => {
    reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
  })

  const mountPanel = (more) => {
    const { pinia, store } = setup((s) => {
      s.cookieState.seedID = 'seed-1'
      s.localState.useSeed = true
      if (more) more(s)
    })
    wrapper = mountComponent(RandomizationSidebarPanel, { pinia })
    return store
  }
  const updateButton = () => wrapper.findAll('button').find(b => b.text() === 'Update')

  it('shows the current seed, editable while the fixed seed is on', () => {
    mountPanel()
    expect(wrapper.find('input').element.value).toBe('seed-1')
    expect(wrapper.find('input').attributes('disabled')).toBeUndefined()
    expect(updateButton().attributes('disabled')).toBeUndefined()
  })

  it('the seed field and Update are disabled while the fixed seed is off', () => {
    mountPanel((s) => {
      s.localState.useSeed = false
    })
    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
    expect(updateButton().attributes('disabled')).toBeDefined()
  })

  it('the Fixed seed switch turns the fixed seed on and off', async () => {
    const store = mountPanel()
    await switches()[0].find('button').trigger('click')
    expect(store.localState.useSeed).toBe(false)
    await switches()[0].find('button').trigger('click')
    expect(store.localState.useSeed).toBe(true)
  })

  it('Update saves the typed seed and reloads the page', async () => {
    const store = mountPanel()
    await wrapper.find('input').setValue('my-seed')
    await updateButton().trigger('click')
    expect(store.setSeedID).toHaveBeenCalledWith('my-seed')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('has no random variables section when the design has none', () => {
    mountPanel()
    expect(wrapper.text()).not.toContain('Random variables')
  })

  it('lists each random variable with its drawn value', () => {
    mountPanel((s) => {
      s.localState.possibleConditions = { taskOrder: ['AB', 'BA'], difficulty: ['easy', 'hard'] }
      s.localState.conditions = { taskOrder: 'BA', difficulty: 'easy' }
    })
    expect(wrapper.findAll('.sd-random-name').map(n => n.text())).toEqual(['taskOrder', 'difficulty'])
    expect(selects().map(s => s.props('modelValue'))).toEqual(['BA', 'easy'])
  })

  // Emitted on the Select, as choosing an item does (the menu does not open in happy-dom)
  it('choosing a value for a random variable sets the condition and reloads the page', async () => {
    const store = mountPanel((s) => {
      s.localState.possibleConditions = { taskOrder: ['AB', 'BA'] }
      s.localState.conditions = { taskOrder: 'BA' }
    })
    selects()[0].vm.$emit('update:modelValue', 'AB')
    await nextTick()
    expect(store.setCondition).toHaveBeenCalledWith('taskOrder', 'AB')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('shows the conditions saved in the data when they change', async () => {
    const store = mountPanel((s) => {
      s.localState.possibleConditions = { taskOrder: ['AB', 'BA'] }
      s.localState.conditions = { taskOrder: 'BA' }
    })
    store.data.conditions = { taskOrder: 'AB' }
    await nextTick()
    await nextTick()
    expect(selects()[0].props('modelValue')).toBe('AB')
  })
})

describe('StudyInfoPanel', () => {
  const rows = () => {
    const terms = wrapper.findAll('dt').map(d => d.text())
    const values = wrapper.findAll('dd').map(d => d.text())
    return Object.fromEntries(terms.map((t, i) => [t, values[i]]))
  }

  it('shows the study and the version, and no user before there is a participant', () => {
    const { pinia } = setup()
    wrapper = mountComponent(StudyInfoPanel, { pinia })
    expect(rows()).toEqual({ Study: 'memory-study', Version: 'abc1234' })
  })

  it('shows the first ten characters of the participant id', () => {
    const { pinia } = setup((s) => {
      s.cookieState.participantId = '0123456789abcdef'
    })
    wrapper = mountComponent(StudyInfoPanel, { pinia })
    expect(rows().User).toBe('0123456789')
  })

  it('on the dev server the version has the mode after it', () => {
    setFlags({ dev: true })
    const { pinia } = setup()
    wrapper = mountComponent(StudyInfoPanel, { pinia })
    expect(rows().Version).toBe('abc1234-development')
  })
})

describe('DatabaseStatusInfoPanel in the browser', () => {
  const row = label => wrapper.findAll('tr').find(tr => tr.find('td').text() === label)

  it('asks the server which database it uses and shows it', async () => {
    setFlags({ client: true })
    const fetch = vi.fn(async () => ({ json: async () => ({ type: 'SQLite', url: 'file:.data/experiment.db' }) }))
    vi.stubGlobal('fetch', fetch)
    const { pinia } = setup()
    wrapper = mountComponent(DatabaseStatusInfoPanel, { pinia })
    await flushPromises()
    expect(fetch).toHaveBeenCalledWith('/api/db-info')
    expect(row('Database').findAll('td')[1].text()).toBe('SQLitefile:.data/experiment.db')
  })

  it('has no database row when the server does not answer', async () => {
    setFlags({ client: true })
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline')
    }))
    const { pinia } = setup()
    wrapper = mountComponent(DatabaseStatusInfoPanel, { pinia })
    await flushPromises()
    expect(row('Database')).toBeUndefined()
    expect(row('Participant ID').findAll('td')[1].text()).toBe('(none)')
  })
})

describe('SmileDevSideBar', () => {
  const mountSideBar = (tab) => {
    const { pinia, store } = setup((s) => {
      s.dev.sideBarTab = tab
    })
    wrapper = mountComponent(SmileDevSideBar, { pinia })
    return store
  }
  const shown = () => ({
    steps: wrapper.findComponent(StepExplorerPanel).exists(),
    randomization: wrapper.findComponent(RandomizationSidebarPanel).exists(),
    db: wrapper.findComponent(DatabaseStatusInfoPanel).exists(),
  })

  it.each(['steps', 'randomization', 'db'])('shows the panel of the stored tab: %s', (tab) => {
    mountSideBar(tab)
    expect(shown()).toEqual({ steps: tab === 'steps', randomization: tab === 'randomization', db: tab === 'db' })
    expect(wrapper.find('[role="tab"][aria-selected="true"]').text()).toBe({ steps: 'Steps', randomization: 'Random', db: 'Info' }[tab])
  })

  it('changes the panel when the stored tab changes', async () => {
    const store = mountSideBar('steps')
    store.dev.sideBarTab = 'db'
    await vi.waitFor(() => expect(shown()).toEqual({ steps: false, randomization: false, db: true }))
  })

  it('choosing a tab stores it', async () => {
    const store = mountSideBar('steps')
    wrapper.findComponent(moduleComponents.Tabs).vm.$emit('update:modelValue', 'randomization')
    await nextTick()
    expect(store.dev.sideBarTab).toBe('randomization')
    await vi.waitFor(() => expect(shown().randomization).toBe(true))
  })

  it('has the settings, the data progress and the study info under every tab', () => {
    mountSideBar('db')
    const footer = wrapper.find('.sidebar-footer')
    expect(footer.findComponent(ConfigurationVariablesPanel).exists()).toBe(true)
    expect(footer.findComponent(AppProgressPanel).exists()).toBe(true)
    expect(footer.findComponent(StudyInfoPanel).text()).toContain('memory-study')
  })
})
