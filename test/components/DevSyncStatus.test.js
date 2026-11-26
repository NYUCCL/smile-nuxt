/**
 * The dev tools' three views of the state of saving: the side bar's status
 * table and progress stages, and the nav bar's database button.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import DatabaseStatusInfoPanel from '../../src/runtime/components/dev/sidebar/DatabaseStatusInfoPanel.vue'
import AppProgressPanel from '../../src/runtime/components/dev/sidebar/AppProgressPanel.vue'
import DatabaseButtonGroup from '../../src/runtime/components/dev/navbar/DatabaseButtonGroup.vue'
import CircleProgress from '../../src/runtime/components/dev/navbar/CircleProgress.vue'
import { createStore, createFakeApi, mountComponent } from './mount'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))

/**
 * Makes the store and the fake API for a state of saving.
 * @param {object} [options] - What to set
 * @param {object} [options.ephemeral] - Parts of browserEphemeral
 * @param {object} [options.sync] - The sync status (api.syncStatus)
 * @param {(store: object) => void} [options.setup] - Other store state
 * @returns {{ pinia: object, store: object }} The Pinia and the store
 */
function setup({ ephemeral = {}, sync = { status: 'saved', error: null }, setup: more } = {}) {
  const { pinia, store } = createStore((s) => {
    Object.assign(s.browserEphemeral, { dataLoaded: true, unsavedChanges: false, otherTab: false }, ephemeral)
    if (more) more(s)
  })
  fake.api = createFakeApi(store, { syncStatus: sync, connectDB: vi.fn() })
  fake.api.config.maxWrites = 1000
  return { pinia, store }
}

// Every state the three components show, with what each should say
const STATES = [
  { name: 'no record yet', options: { ephemeral: { dataLoaded: false } }, state: 'none', label: 'No record yet', stage: 'off', short: 'Never saved' },
  { name: 'saved', options: {}, state: 'saved', label: 'Saved', stage: 'ok', short: 'Saved' },
  { name: 'a change waiting', options: { sync: { status: 'pending', error: null } }, state: 'pending', label: 'Unsaved changes', stage: 'warn', short: 'Unsaved changes' },
  { name: 'a save on its way', options: { sync: { status: 'saving', error: null } }, state: 'saving', label: 'Saving', stage: 'warn', short: 'Saving' },
  { name: 'offline', options: { sync: { status: 'offline', error: null } }, state: 'offline', label: 'Offline: will save when back', stage: 'error', short: 'Offline' },
  { name: 'a failed save being retried', options: { sync: { status: 'error', error: { kind: 'retrying', message: 'HTTP 500' } } }, state: 'retrying', label: 'Save failed: trying again', stage: 'error', short: 'Save failed, retrying' },
  { name: 'over the size limit', options: { sync: { status: 'error', error: { kind: 'oversize', message: 'too big' } } }, state: 'stopped', label: 'Not saved: the record is over the size limit', stage: 'error', short: 'Not saving' },
  { name: 'another tab', options: { ephemeral: { otherTab: 'newer-tab' } }, state: 'paused', label: 'Paused: open in another tab', stage: 'error', short: 'Paused (other tab)' },
]

describe('DatabaseStatusInfoPanel', () => {
  let wrapper
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-11-22T12:00:00Z') })
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ type: 'SQLite', url: 'file:.data/experiment.db' }) })))
  })
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  /**
   * Mounts the panel.
   * @param {object} [options] - See setup()
   * @returns {object} The store
   */
  function mountPanel(options) {
    const { pinia, store } = setup(options)
    wrapper = mountComponent(DatabaseStatusInfoPanel, { pinia })
    return store
  }
  const row = label => wrapper.findAll('tr').find(tr => tr.find('td').text() === label)
  const status = () => wrapper.find('[data-testid="sync-status"]')

  it.each(STATES)('shows the state of saving: $name', ({ options, state, label }) => {
    mountPanel(options)
    expect(status().find('[data-state]').attributes('data-state')).toBe(state)
    expect(status().find('[data-state]').text()).toBe(label)
  })

  it('shows the loop\'s status and the saved and current rev', () => {
    mountPanel({ sync: { status: 'pending', error: null }, ephemeral: { rev: 7, savedRev: 5 } })
    expect(status().text()).toContain('pending, rev 5 of 7')
  })

  it('shows the error\'s message', () => {
    mountPanel({ sync: { status: 'error', error: { kind: 'retrying', message: 'HTTP 503 from the server' } } })
    expect(status().text()).toContain('HTTP 503 from the server')
  })

  it('counts down to the next try of a failed save', async () => {
    mountPanel({ sync: { status: 'error', error: { kind: 'retrying', message: 'x' }, retryAt: Date.now() + 4200 } })
    expect(status().text()).not.toContain('(in')
    await vi.advanceTimersByTimeAsync(500)
    expect(status().text()).toContain('(in 4 s)')
    await vi.advanceTimersByTimeAsync(3000)
    expect(status().text()).toContain('(in 1 s)')
    await vi.advanceTimersByTimeAsync(5000)
    expect(status().text()).toContain('(in 0 s)')
  })

  it('shows no countdown when no try is planned', async () => {
    mountPanel()
    await vi.advanceTimersByTimeAsync(1000)
    expect(status().text()).not.toContain('(in')
  })

  it('shows the participant ID, or "(none)"', () => {
    mountPanel()
    expect(row('Participant ID').text()).toContain('(none)')
    wrapper.unmount()
    mountPanel({ setup: (s) => {
      s.cookieState.participantId = 'abc-123'
    } })
    expect(row('Participant ID').text()).toContain('abc-123')
  })

  it('shows the last route and the mode', () => {
    mountPanel({ setup: (s) => {
      s.cookieState.lastRoute = 'exp'
    } })
    expect(row('Last route').text()).toContain('/exp')
    expect(row('Mode').text()).toContain('development')
  })

  it('shows the saves confirmed and sent, with the limit', () => {
    mountPanel({ setup: (s) => {
      s.localState.totalWrites = 12
      s.localState.totalSends = 15
    } })
    expect(row('Saves').text()).toContain('12 confirmed')
    expect(row('Saves').text()).toContain('15 sent of 1,000')
  })

  it.each([
    [5_000, '5.0 secs ago'],
    [90_000, '1.50 mins ago'],
    [300_000, 'a few mins ago'],
    [3_600_000, 'a long time ago'],
  ])('says how long ago the last save was (%i ms)', async (ago, text) => {
    mountPanel({ setup: (s) => {
      s.localState.lastWrite = Date.now() - ago + 500
    } })
    await vi.advanceTimersByTimeAsync(500)
    expect(row('Last save').text()).toContain(text)
  })

  it('says "Never saved" when there is no record', async () => {
    mountPanel({ ephemeral: { dataLoaded: false } })
    await vi.advanceTimersByTimeAsync(500)
    expect(row('Last save').text()).toContain('Never saved')
  })

  it('shows the record\'s size and the limits', () => {
    mountPanel({ setup: (s) => {
      s.localState.approxDataSize = 123_456
    } })
    expect(row('Size').text()).toContain('123.5 KB as JSON (most: 20.00 MB)')
    expect(row('Size').text()).toContain('a save must fit 4.00 MB on the network')
  })

  it('has no "Last send" row before the first save', () => {
    mountPanel()
    expect(wrapper.find('[data-testid="last-send"]').exists()).toBe(false)
  })

  it('shows what the last save weighed, before and after gzip, how long it took and the answer', () => {
    mountPanel({ ephemeral: { lastSend: { sentBytes: 2_400, textBytes: 1_500_000, ms: 87, status: 200 } } })
    const text = wrapper.find('[data-testid="last-send"]').text()
    expect(text).toContain('2.4 KB sent')
    expect(text).toContain('(1.50 MB before gzip)')
    expect(text).toContain('87 ms, 200')
  })

  it('leaves out the size before gzip for a save sent as plain text, and says when there was no answer', () => {
    mountPanel({ ephemeral: { lastSend: { sentBytes: 900, textBytes: 900, ms: 30000, status: 0 } } })
    const text = wrapper.find('[data-testid="last-send"]').text()
    expect(text).toContain('0.9 KB sent')
    expect(text).not.toContain('before gzip')
    expect(text).toContain('no answer')
  })

  it('shows a "Browser copy" row only when the local copy could not be written', () => {
    mountPanel()
    expect(wrapper.find('[data-testid="local-copy-error"]').exists()).toBe(false)
    wrapper.unmount()
    mountPanel({ ephemeral: { localCopyError: 'QuotaExceededError' } })
    const cell = wrapper.find('[data-testid="local-copy-error"]')
    expect(cell.text()).toContain('Not written')
    expect(cell.text()).toContain('QuotaExceededError')
  })

  it('stops its timer when it is removed', () => {
    mountPanel()
    wrapper.unmount()
    wrapper = null
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('AppProgressPanel', () => {
  /**
   * Mounts the panel.
   * @param {object} [options] - See setup()
   * @returns {object} The wrapper
   */
  function mountPanel(options) {
    const { pinia } = setup(options)
    return mountComponent(AppProgressPanel, { pinia })
  }
  const stage = (wrapper, i) => wrapper.findAll('li')[i]

  it.each(STATES)('shows the save stage for: $name', ({ options, stage: expected, short }) => {
    const wrapper = mountPanel(options)
    expect(stage(wrapper, 2).attributes('data-state')).toBe(expected)
    expect(stage(wrapper, 2).text()).toBe(short)
  })

  it('shows whether the user is known', () => {
    expect(stage(mountPanel(), 0).text()).toBe('Unknown user')
    expect(stage(mountPanel(), 0).attributes('data-state')).toBe('off')
    const known = mountPanel({ setup: (s) => {
      s.cookieState.knownUser = true
    } })
    expect(stage(known, 0).text()).toBe('Known user')
    expect(stage(known, 0).attributes('data-state')).toBe('ok')
  })

  it('shows whether the record exists', () => {
    expect(stage(mountPanel(), 1).text()).toBe('Record created')
    expect(stage(mountPanel(), 1).attributes('data-state')).toBe('ok')
    const none = mountPanel({ ephemeral: { dataLoaded: false } })
    expect(stage(none, 1).text()).toBe('No record yet')
    expect(stage(none, 1).attributes('data-state')).toBe('off')
  })

  it('connects to the database when the record stage is pressed', async () => {
    const wrapper = mountPanel({ ephemeral: { dataLoaded: false } })
    expect(wrapper.findAll('button')).toHaveLength(1)
    await stage(wrapper, 1).find('button').trigger('click')
    expect(fake.api.connectDB).toHaveBeenCalledTimes(1)
  })

  it('puts the error\'s message in the save stage\'s tooltip', () => {
    const wrapper = mountPanel({ sync: { status: 'error', error: { kind: 'refused', message: 'HTTP 400' } } })
    expect(stage(wrapper, 2).find('[title]').attributes('title')).toBe('Not saved: the server refused the save (HTTP 400)')
  })

  it('follows the state as it changes', async () => {
    const wrapper = mountPanel({ sync: { status: 'saving', error: null } })
    expect(stage(wrapper, 2).text()).toBe('Saving')
    fake.api.syncStatus = { status: 'saved', error: null }
    await nextTick()
    expect(stage(wrapper, 2).text()).toBe('Saved')
  })
})

describe('DatabaseButtonGroup', () => {
  // The tooltip's text is only in the page while the tooltip is open: show it always
  const stubs = { TooltipContent: { template: '<div data-testid="tooltip"><slot /></div>' } }

  /**
   * Mounts the button.
   * @param {object} [options] - See setup()
   * @returns {object} The wrapper
   */
  function mountButton(options) {
    const { pinia } = setup(options)
    return mountComponent(DatabaseButtonGroup, { pinia, stubs })
  }
  const icon = wrapper => wrapper.find('[data-testid="nav-sync-icon"]')
  const tooltip = wrapper => wrapper.find('[data-testid="tooltip"]').text()

  it.each(STATES)('marks the sync icon for: $name', ({ options, state }) => {
    const wrapper = mountButton(options)
    expect(icon(wrapper).attributes('data-state')).toBe(state)
    expect(icon(wrapper).classes().includes('animate-spin')).toBe(state === 'saving')
  })

  it('says in the tooltip that there is no record yet', () => {
    expect(tooltip(mountButton({ ephemeral: { dataLoaded: false } }))).toBe('No record yet')
  })

  it('gives the record, the state and the size in the tooltip', async () => {
    const wrapper = mountButton({ setup: (s) => {
      s.localState.approxDataSize = 400_000
    } })
    await flushPromises()
    expect(tooltip(wrapper)).toBe('Record created | Saved | 10% of the size limit')
  })

  it('adds the error\'s message and a failed browser copy to the tooltip', () => {
    const wrapper = mountButton({
      sync: { status: 'error', error: { kind: 'retrying', message: 'HTTP 500' } },
      ephemeral: { localCopyError: 'QuotaExceededError' },
    })
    expect(tooltip(wrapper)).toContain('Save failed: trying again (HTTP 500)')
    expect(tooltip(wrapper)).toContain('Browser copy not written')
  })

  it('draws the size from the record as JSON before any save has gone', () => {
    const wrapper = mountButton({ setup: (s) => {
      s.localState.approxDataSize = 1_000_000
    } })
    expect(wrapper.findComponent(CircleProgress).props('percentage')).toBe(25)
  })

  it('draws the size from what the last save weighed on the network once one has gone', () => {
    const wrapper = mountButton({
      ephemeral: { lastSend: { sentBytes: 50_000, textBytes: 3_000_000, ms: 10, status: 200 } },
      setup: (s) => {
        s.localState.approxDataSize = 3_000_000
      },
    })
    expect(wrapper.findComponent(CircleProgress).props('percentage')).toBe(1.3)
  })

  it('never draws more than 100%', () => {
    const wrapper = mountButton({ setup: (s) => {
      s.localState.approxDataSize = 9_000_000
    } })
    expect(wrapper.findComponent(CircleProgress).props('percentage')).toBe(100)
  })
})
