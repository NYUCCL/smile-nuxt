/**
 * The `:` command palette's component (palette/DevCommandPalette.vue): how
 * it opens and closes, what it lists, its keys in insert and normal mode,
 * and what running a row does. The matcher, the commands and the history
 * have their own tests in palette.test.js.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import DevCommandPalette from '../../src/runtime/components/dev/palette/DevCommandPalette.vue'
import { GROUPS, commandsFor, fullName } from '../../src/runtime/components/dev/palette/commands'
import { openCommandPalette } from '../../src/runtime/components/dev/palette/bus'
import { HISTORY_KEY } from '../../src/runtime/components/dev/palette/history'
import { devApi, setupDev, mountComponent, pressKey } from './mountDev'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))
fake.api = devApi

const SEQUENCE = [
  { name: 'landing', redirect: '/consent', meta: {} },
  { name: 'consent', meta: {} },
  { name: 'task', meta: {} },
  { name: 'thanks', meta: {} },
]
const ROUTES = [...SEQUENCE, { name: 'withdraw', meta: {} }]

const DOCS = [
  { path: 'coding/autofill.md', hash: 'faker', title: 'Autofill', heading: 'Fake data', section: 'Coding' },
  { path: 'coding/steps.md', hash: '', title: 'Steps', heading: 'Steps', section: 'Coding' },
]

let wrapper
let location
beforeEach(() => {
  localStorage.clear()
  location = { pathname: '/dev/task', origin: 'http://localhost:3000', href: 'http://localhost:3000/dev/task' }
  vi.stubGlobal('location', location)
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => DOCS })))
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/**
 * Mounts the palette (closed).
 * @param {object} [options] - `context` ('dev' or 'participant'), `setup` and `api` (see setupDev)
 * @returns {{ store: object, api: object }} The store and the fake API
 */
function mountPalette({ context = 'dev', setup, api: overrides } = {}) {
  const { pinia, store, api } = setupDev({
    setup: (s) => {
      s.localState.seqtimeline = SEQUENCE
      s.localState.routes = ROUTES
      if (setup) setup(s)
    },
    api: overrides,
  })
  wrapper = mountComponent(DevCommandPalette, { pinia, props: { context }, attachTo: document.body })
  return { store, api }
}

/** A key pressed on the page (not in a text field) */
const key = (k, init) => pressKey(k, { target: document.body, ...init })
const box = () => wrapper.find('[data-testid="command-palette"]')
const isOpen = () => box().exists()
const input = () => wrapper.find('input')
const rows = () => wrapper.findAll('[role="option"]')
const entries = () => rows().map(r => r.attributes('data-command'))
const selected = () => wrapper.find('.is-selected').exists() ? wrapper.find('.is-selected').attributes('data-command') : null
const error = () => wrapper.find('[data-testid="command-palette-error"]')
const isNormal = () => wrapper.find('[data-testid="command-palette-normal"]').exists()
const saved = () => JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')

/**
 * Opens the palette with `:` and waits for it.
 */
async function openPalette() {
  key(':')
  await nextTick()
  await nextTick()
}

/**
 * Types text into the palette's field (replacing what is there).
 * @param {string} text - The text
 */
async function type(text) {
  await input().setValue(text)
  await nextTick()
}

/**
 * Presses a key and waits for the palette to finish what it does.
 * @param {string} k - The key
 * @param {object} [init] - Other KeyboardEvent fields
 * @returns {Promise<KeyboardEvent>} The event
 */
async function press(k, init) {
  const event = key(k, init)
  await flushPromises()
  return event
}

describe('opening and closing', () => {
  it('is closed at first', () => {
    mountPalette()
    expect(isOpen()).toBe(false)
  })

  it('a ":" on the page opens it, with the field focused and empty', async () => {
    mountPalette()
    const event = key(':')
    await nextTick()
    await nextTick()
    expect(isOpen()).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(input().element)
    expect(input().element.value).toBe('')
  })

  it('a ":" typed in a text field does not open it', async () => {
    mountPalette()
    const field = document.createElement('input')
    document.body.appendChild(field)
    const event = pressKey(':', { target: field })
    await nextTick()
    expect(isOpen()).toBe(false)
    expect(event.defaultPrevented).toBe(false)
  })

  it('a ":" with ctrl, the key going up, and other keys do not open it', async () => {
    mountPalette()
    key(':', { ctrlKey: true })
    key(':', { type: 'keyup' })
    key('a')
    await nextTick()
    expect(isOpen()).toBe(false)
  })

  it('the rail\'s command palette button opens it', async () => {
    mountPalette()
    openCommandPalette()
    await nextTick()
    expect(isOpen()).toBe(true)
    // a second request while it is open changes nothing
    await type('si')
    openCommandPalette()
    await nextTick()
    expect(input().element.value).toBe('si')
  })

  it('open() and close() are there for the layout to call', async () => {
    mountPalette()
    wrapper.vm.open()
    await nextTick()
    expect(isOpen()).toBe(true)
    wrapper.vm.close()
    await nextTick()
    expect(isOpen()).toBe(false)
  })

  it('escape on an empty line closes it', async () => {
    mountPalette()
    await openPalette()
    await press('Escape')
    expect(isOpen()).toBe(false)
  })

  it('backspace on an empty line closes it, and with text it does not', async () => {
    mountPalette()
    await openPalette()
    await type('si')
    const withText = await press('Backspace')
    expect(isOpen()).toBe(true)
    expect(withText.defaultPrevented).toBe(false)
    await type('')
    await press('Backspace')
    expect(isOpen()).toBe(false)
  })

  it('a press on the backdrop closes it, and a press inside the box does not', async () => {
    mountPalette()
    await openPalette()
    await box().trigger('mousedown')
    expect(isOpen()).toBe(true)
    await wrapper.find('[data-testid="command-palette-backdrop"]').trigger('mousedown')
    expect(isOpen()).toBe(false)
  })

  it('gives the focus back to where it was when it closes', async () => {
    mountPalette()
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    await openPalette()
    expect(document.activeElement).toBe(input().element)
    await press('Escape')
    expect(document.activeElement).toBe(button)
  })

  it('opens empty again after a line was typed and left', async () => {
    mountPalette()
    await openPalette()
    await type('zzz')
    await press('Enter')
    expect(error().exists()).toBe(true)
    wrapper.vm.close()
    await openPalette()
    expect(input().element.value).toBe('')
    expect(error().exists()).toBe(false)
    expect(isNormal()).toBe(false)
  })

  it('stops listening for keys when it is removed', async () => {
    mountPalette()
    wrapper.unmount()
    const event = key(':')
    expect(event.defaultPrevented).toBe(false)
    wrapper = null
  })
})

describe('keys and the page', () => {
  it('while it is open no key event reaches the page, and when it is closed they do', async () => {
    mountPalette()
    const seen = []
    const listener = e => seen.push(`${e.type}:${e.key}`)
    for (const t of ['keydown', 'keypress', 'keyup']) document.addEventListener(t, listener)
    await openPalette()
    seen.length = 0
    key('a')
    key('a', { type: 'keypress' })
    key('a', { type: 'keyup' })
    key('ArrowDown')
    expect(seen).toEqual([])

    await press('Escape')
    await press('Escape') // already closed: this one is the page's
    expect(seen).toEqual(['keydown:Escape'])
    for (const t of ['keydown', 'keypress', 'keyup']) document.removeEventListener(t, listener)
  })

  it('ignores keys of a text composition (IME)', async () => {
    mountPalette()
    await openPalette()
    await press('Escape', { isComposing: true })
    expect(isOpen()).toBe(true)
  })

  it('a key pressed after the focus left the field puts the focus back', async () => {
    mountPalette()
    await openPalette()
    input().element.blur()
    expect(document.activeElement).not.toBe(input().element)
    await press('s')
    expect(document.activeElement).toBe(input().element)
  })
})

describe('the theme', () => {
  it('wears the dev tools\' mode and palette, not the experiment\'s', () => {
    mountPalette({ setup: (s) => {
      s.dev.globalColorMode = 'dark'
      s.dev.experimentColorMode = 'light'
      s.dev.devPalette = 'nord'
    } })
    const scope = wrapper.find('.sd-palette-scope')
    expect(scope.classes()).toContain('dark')
    expect(scope.attributes('data-sd-palette')).toBe('nord')
  })

  it('uses the default palette for a stored palette that does not exist', () => {
    mountPalette({ setup: (s) => {
      s.dev.devPalette = 'gone'
    } })
    expect(wrapper.find('.sd-palette-scope').attributes('data-sd-palette')).toBe('default')
  })

  it('the dark and light commands set the dev tools\' mode', async () => {
    const { store } = mountPalette()
    await openPalette()
    await type('dark')
    await press('Enter')
    expect(store.dev.globalColorMode).toBe('dark')
    expect(wrapper.find('.sd-palette-scope').classes()).toContain('dark')
    await openPalette()
    await type('light')
    await press('Enter')
    expect(store.dev.globalColorMode).toBe('light')
    expect(wrapper.find('.sd-palette-scope').classes()).toContain('light')
  })
})

describe('the list on an empty line', () => {
  it('lists every dev command under its group, in group order, with nothing chosen', async () => {
    mountPalette()
    await openPalette()
    const expected = GROUPS.flatMap(g => commandsFor('dev').filter(c => c.group === g).map(fullName))
    expect(entries()).toEqual(expected)
    const groups = wrapper.findAll('.sd-palette-group').map(g => g.text())
    expect(groups).toEqual(GROUPS.filter(g => commandsFor('dev').some(c => c.group === g)))
    expect(selected()).toBeNull()
  })

  it('shows each command\'s description and shortcut', async () => {
    mountPalette()
    await openPalette()
    const zap = wrapper.find('[data-command="zap"]')
    expect(zap.find('.sd-palette-desc').text()).toBe('Zap the local state and reload')
    expect(zap.find('kbd').text()).toBe('Ctrl R')
    expect(wrapper.find('[data-command="dark"]').find('kbd').exists()).toBe(false)
  })

  it('in the participant view, leaves out the commands that need the dev tools', async () => {
    mountPalette({ context: 'participant' })
    await openPalette()
    expect(entries()).toContain('go')
    expect(entries()).toContain('zap')
    expect(entries()).not.toContain('pin')
    expect(entries()).not.toContain('side')
    expect(entries()).not.toContain('part')
  })

  it('enter with nothing chosen does nothing', async () => {
    mountPalette()
    await openPalette()
    await press('Enter')
    expect(isOpen()).toBe(true)
    expect(error().exists()).toBe(false)
    expect(saved()).toEqual([])
  })

  it('says how escape will act: close on an empty line, normal mode with text', async () => {
    mountPalette()
    await openPalette()
    expect(wrapper.find('.sd-palette-foot').text()).toContain('Esc close')
    await type('s')
    expect(wrapper.find('.sd-palette-foot').text()).toContain('Esc normal')
  })
})

describe('recent commands', () => {
  const remember = list => localStorage.setItem(HISTORY_KEY, JSON.stringify(list))

  it('lists the last three first, leaving out ones that no longer run', async () => {
    // "go" has no view and "bogus" is no command: both are left out
    remember(['side steps', 'go', 'bogus', 'go consent', 'zap', 'reload'])
    mountPalette()
    await openPalette()
    expect(entries().slice(0, 3)).toEqual(['side steps', 'go consent', 'zap'])
    expect(wrapper.findAll('.sd-palette-group')[0].text()).toBe('Recent')
    expect(rows()[1].find('.sd-palette-name').text()).toBe('go consent')
  })

  it('the last command is chosen, so ":" then enter repeats it', async () => {
    remember(['go consent', 'zap'])
    const { api } = mountPalette()
    await openPalette()
    expect(selected()).toBe('go consent')
    await press('Enter')
    expect(api.goToView).toHaveBeenCalledWith('consent', true)
    expect(isOpen()).toBe(false)
  })

  it('leaves out a dev tools command in the participant view', async () => {
    remember(['pin', 'zap'])
    mountPalette({ context: 'participant' })
    await openPalette()
    expect(entries()[0]).toBe('zap')
    expect(wrapper.findAll('[data-command="zap"]')).toHaveLength(2)
  })

  it('reads the history again each time it opens', async () => {
    mountPalette()
    await openPalette()
    expect(wrapper.findAll('.sd-palette-group')[0].text()).not.toBe('Recent')
    await press('Escape')
    remember(['zap'])
    await openPalette()
    expect(wrapper.findAll('.sd-palette-group')[0].text()).toBe('Recent')
  })
})

describe('typing a command', () => {
  it('lists the matches, best first, with the best chosen and no group names', async () => {
    mountPalette()
    await openPalette()
    await type('side')
    expect(entries()).toEqual(['side', 'side steps', 'side random', 'side info'])
    expect(selected()).toBe('side')
    expect(wrapper.find('.sd-palette-group').exists()).toBe(false)
  })

  it('shows at most eight matches', async () => {
    mountPalette()
    await openPalette()
    await type('e')
    expect(rows()).toHaveLength(8)
  })

  it('bolds the letters that matched', async () => {
    mountPalette()
    await openPalette()
    await type('cons')
    const name = rows()[0].find('.sd-palette-name')
    expect(name.text()).toBe('console')
    expect(name.find('b').text()).toBe('cons')
  })

  it('shows the alias that matched next to the command', async () => {
    mountPalette()
    await openPalette()
    await type('reset')
    expect(rows()[0].attributes('data-command')).toBe('zap')
    expect(rows()[0].find('.sd-palette-alias').text()).toBe('reset')
  })

  it('a tab\'s short name bolds it in the full name, with no alias shown', async () => {
    mountPalette()
    await openPalette()
    await type('steps')
    const row = rows()[0]
    expect(row.attributes('data-command')).toBe('side steps')
    expect(row.find('.sd-palette-name').text()).toBe('side steps')
    expect(row.find('b').text()).toBe('steps')
    expect(row.find('.sd-palette-alias').exists()).toBe(false)
  })

  it('says so when nothing matches', async () => {
    mountPalette()
    await openPalette()
    await type('zzzz')
    expect(rows()).toHaveLength(0)
    expect(wrapper.find('.sd-palette-empty').text()).toBe('No matching command')
  })

  it('enter runs the chosen command, closes, and remembers it', async () => {
    const { store } = mountPalette()
    await openPalette()
    await type('side')
    const event = await press('Enter')
    expect(event.defaultPrevented).toBe(true)
    expect(store.dev.showSideBar).toBe(true)
    expect(isOpen()).toBe(false)
    expect(saved()).toEqual(['side'])
  })

  it('a tab is run and remembered by its full name', async () => {
    const { store } = mountPalette()
    await openPalette()
    await type('log')
    await press('Enter')
    expect(store.dev.showConsoleBar).toBe(true)
    expect(store.dev.consoleBarTab).toBe('log')
    expect(saved()).toEqual(['console log'])
  })

  it('a command leaves the build settings for developer mode, where the experiment shows', async () => {
    const { store } = mountPalette({ setup: (s) => {
      s.dev.mainView = 'config'
    } })
    await openPalette()
    await type('console')
    await press('Enter')
    expect(store.dev.mainView).toBe('devmode')
  })

  it('a click on a row runs it', async () => {
    const { api } = mountPalette()
    await openPalette()
    await wrapper.find('[data-command="reload"]').trigger('click')
    await flushPromises()
    expect(api.reloadBrowser).toHaveBeenCalledTimes(1)
    expect(isOpen()).toBe(false)
  })

  it('the row under the pointer is chosen', async () => {
    mountPalette()
    await openPalette()
    await type('side')
    await rows()[2].trigger('mousemove')
    expect(selected()).toBe('side random')
    expect(input().attributes('aria-activedescendant')).toBe('sd-palette-row-2')
  })
})

describe('a command that fails', () => {
  it('says why under the prompt, stays open, and is not remembered', async () => {
    mountPalette()
    await openPalette()
    await type('fill')
    await press('Enter')
    expect(error().text()).toBe('No Autofill Available')
    expect(isOpen()).toBe(true)
    expect(saved()).toEqual([])
  })

  it('the message goes away when the line changes', async () => {
    mountPalette()
    await openPalette()
    await type('fill')
    await press('Enter')
    await type('fil')
    expect(error().exists()).toBe(false)
  })

  it('a line that names no command says "Unknown command"', async () => {
    mountPalette()
    await openPalette()
    await type('zzzz now')
    await press('Enter')
    expect(error().text()).toBe('Unknown command: zzzz')
  })

  it('a command that throws says "Failed" with the error\'s message', async () => {
    mountPalette({ api: { resetLocalState: vi.fn(() => {
      throw new Error('storage is blocked')
    }) } })
    await openPalette()
    await type('zap')
    await press('Enter')
    expect(error().text()).toBe('Failed: storage is blocked')
    expect(isOpen()).toBe(true)
  })

  it('a command that throws something that is not an error says what was thrown', async () => {
    mountPalette({ api: { reloadBrowser: vi.fn(() => {
      throw 'no window'
    }) } })
    await openPalette()
    await type('reload')
    await press('Enter')
    expect(error().text()).toBe('Failed: no window')
  })
})

describe('go: a command that takes a view', () => {
  it('enter on "go" asks for the view: the line becomes "go " and lists the views', async () => {
    const { api } = mountPalette()
    await openPalette()
    await type('go')
    await press('Enter')
    await nextTick()
    expect(input().element.value).toBe('go ')
    expect(isOpen()).toBe(true)
    expect(api.goToView).not.toHaveBeenCalled()
    expect(entries()).toEqual(['go consent', 'go task', 'go thanks', 'go withdraw'])
  })

  it('marks the current view', async () => {
    mountPalette()
    await openPalette()
    await type('go ')
    const current = wrapper.find('.is-current')
    expect(current.attributes('data-command')).toBe('go task')
    expect(current.find('.sd-palette-desc').text()).toBe('current view')
    expect(current.find('.sd-palette-dot').exists()).toBe(true)
    expect(wrapper.find('[data-command="go consent"]').find('.sd-palette-desc').text()).toBe('')
  })

  it('filters the views by what is typed and goes to the chosen one', async () => {
    const { api } = mountPalette()
    await openPalette()
    await type('go th')
    expect(entries()).toEqual(['go thanks', 'go withdraw'])
    await press('Enter')
    expect(api.goToView).toHaveBeenCalledWith('thanks', true)
    expect(isOpen()).toBe(false)
    expect(saved()).toEqual(['go thanks'])
  })

  it('a view that does not exist is an error', async () => {
    const { api } = mountPalette()
    await openPalette()
    await type('go nowhere')
    expect(rows()).toHaveLength(0)
    await press('Enter')
    expect(error().text()).toBe('No view "nowhere"')
    expect(api.goToView).not.toHaveBeenCalled()
  })

  it('the alias works too', async () => {
    const { api } = mountPalette()
    await openPalette()
    await type('goto consent')
    await press('Enter')
    expect(api.goToView).toHaveBeenCalledWith('consent', true)
  })
})

describe('choosing with the keys (insert mode)', () => {
  it.each([
    ['the arrows', k => press(k), 'ArrowDown', 'ArrowUp'],
    ['ctrl-j and ctrl-k', k => press(k, { ctrlKey: true }), 'j', 'k'],
    ['ctrl-n and ctrl-p', k => press(k, { ctrlKey: true }), 'n', 'p'],
  ])('%s move down and up, and wrap at the ends', async (_name, send, down, up) => {
    mountPalette()
    await openPalette()
    await type('side')
    await send(down)
    expect(selected()).toBe('side steps')
    await send(up)
    await send(up)
    expect(selected()).toBe('side info')
    await send(down)
    expect(selected()).toBe('side')
    expect(input().element.value).toBe('side')
  })

  it('on an empty line, down chooses the first row and up the last', async () => {
    mountPalette()
    await openPalette()
    await press('ArrowDown')
    expect(selected()).toBe(entries()[0])
    await type('x')
    await type('')
    expect(selected()).toBeNull()
    await press('ArrowUp')
    expect(selected()).toBe(entries().at(-1))
  })

  it('moving with nothing listed does nothing', async () => {
    mountPalette()
    await openPalette()
    await type('zzzz')
    await press('ArrowDown')
    expect(selected()).toBeNull()
  })

  it('tab completes the line to the chosen command', async () => {
    mountPalette()
    await openPalette()
    await type('cons')
    const event = await press('Tab')
    expect(event.defaultPrevented).toBe(true)
    expect(input().element.value).toBe('console')
    expect(isOpen()).toBe(true)
  })

  it('tab on a command that takes a view completes to "go "', async () => {
    mountPalette()
    await openPalette()
    await type('got')
    await press('Tab')
    expect(input().element.value).toBe('go ')
    await press('ArrowDown')
    await press('Tab')
    expect(input().element.value).toBe('go task')
  })

  it('tab with nothing chosen completes to the first row, and does nothing with no rows', async () => {
    mountPalette()
    await openPalette()
    await press('Tab')
    expect(input().element.value).toBe(commandsFor('dev')[0].name)
    await type('zzzz')
    await press('Tab')
    expect(input().element.value).toBe('zzzz')
  })

  it('ctrl-u clears the line', async () => {
    mountPalette()
    await openPalette()
    await type('side steps')
    await press('u', { ctrlKey: true })
    expect(input().element.value).toBe('')
  })

  it('ctrl-w deletes the word before the cursor', async () => {
    mountPalette()
    await openPalette()
    await type('go consent')
    await press('w', { ctrlKey: true })
    expect(input().element.value).toBe('go ')
    await press('w', { ctrlKey: true })
    expect(input().element.value).toBe('')
  })

  it('ctrl-w in the middle of the line keeps what follows the cursor', async () => {
    mountPalette()
    await openPalette()
    await type('side steps')
    input().element.setSelectionRange(4, 4)
    await press('w', { ctrlKey: true })
    expect(input().element.value).toBe(' steps')
    expect(input().element.selectionStart).toBe(0)
  })

  it('the same letters with cmd are left to the browser', async () => {
    mountPalette()
    await openPalette()
    await type('side')
    const event = await press('u', { ctrlKey: true, metaKey: true })
    expect(event.defaultPrevented).toBe(false)
    expect(input().element.value).toBe('side')
  })
})

describe('normal mode', () => {
  /**
   * Opens the palette, types a line and presses escape.
   * @param {string} [text] - The line
   */
  async function normal(text = 'side') {
    await openPalette()
    await type(text)
    await press('Escape')
  }

  it('escape with something typed goes to normal mode and says so', async () => {
    mountPalette()
    await normal()
    expect(isOpen()).toBe(true)
    expect(isNormal()).toBe(true)
    expect(input().classes()).toContain('is-normal')
    expect(wrapper.find('.sd-palette-foot').text()).toContain('q close')
  })

  it('j and k, the arrows and ctrl-n / ctrl-p move in the list', async () => {
    mountPalette()
    await normal()
    await press('j')
    expect(selected()).toBe('side steps')
    await press('ArrowDown')
    expect(selected()).toBe('side random')
    await press('n', { ctrlKey: true })
    expect(selected()).toBe('side info')
    await press('k')
    await press('ArrowUp')
    await press('p', { ctrlKey: true })
    expect(selected()).toBe('side')
    expect(input().element.value).toBe('side')
  })

  it('G goes to the last row and gg to the first', async () => {
    mountPalette()
    await normal()
    await press('G')
    expect(selected()).toBe('side info')
    await press('g')
    expect(selected()).toBe('side info')
    await press('g')
    expect(selected()).toBe('side')
  })

  it('gg with nothing listed chooses nothing', async () => {
    mountPalette()
    await normal('zzzz')
    await press('g')
    await press('g')
    expect(selected()).toBeNull()
  })

  it('a g followed by another key is not gg', async () => {
    mountPalette()
    await normal()
    await press('G')
    await press('g')
    await press('x')
    await press('g')
    expect(selected()).toBe('side info')
  })

  it.each(['Enter', 'l'])('%s runs the chosen row', async (k) => {
    const { store } = mountPalette()
    await normal()
    await press('j')
    await press(k)
    expect(store.dev.showSideBar).toBe(true)
    expect(store.dev.sideBarTab).toBe('steps')
    expect(isOpen()).toBe(false)
  })

  it.each(['Escape', 'q'])('%s closes the palette', async (k) => {
    mountPalette()
    await normal()
    await press(k)
    expect(isOpen()).toBe(false)
  })

  it('tab completes the line to the chosen row', async () => {
    mountPalette()
    await normal()
    await press('j')
    await press('Tab')
    expect(input().element.value).toBe('side steps')
  })

  it.each([
    ['i', 'where it was', 2],
    ['a', 'at the end', 4],
    ['A', 'at the end', 4],
    ['I', 'at the start', 0],
  ])('%s goes back to typing, with the cursor %s', async (k, _where, at) => {
    mountPalette()
    await normal()
    input().element.setSelectionRange(2, 2)
    await press(k)
    await nextTick()
    expect(isNormal()).toBe(false)
    expect(input().element.value).toBe('side')
    expect(input().element.selectionStart).toBe(at)
  })

  it.each([['dd', ['d', 'd']], ['cc', ['c', 'c']], ['S', ['S']]])('%s clears the line and goes back to typing', async (_name, keys) => {
    mountPalette()
    await normal()
    for (const k of keys) await press(k)
    expect(input().element.value).toBe('')
    expect(isNormal()).toBe(false)
    expect(isOpen()).toBe(true)
  })

  it('a single d does not clear the line', async () => {
    mountPalette()
    await normal()
    await press('d')
    await press('j')
    await press('d')
    expect(input().element.value).toBe('side')
  })

  it('letters do not type into the line, and keys with cmd are left to the browser', async () => {
    mountPalette()
    await normal()
    const letter = await press('x')
    expect(letter.defaultPrevented).toBe(true)
    const browser = await press('r', { metaKey: true })
    expect(browser.defaultPrevented).toBe(false)
    expect(isOpen()).toBe(true)
    expect(input().element.value).toBe('side')
  })

  it('opens in insert mode the next time', async () => {
    mountPalette()
    await normal()
    await press('q')
    await openPalette()
    expect(isNormal()).toBe(false)
  })
})

describe('help', () => {
  it('lists every command with its aliases, stays open, and is not remembered', async () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(['zap']))
    mountPalette()
    await openPalette()
    await type('help')
    await press('Enter')
    await nextTick()
    expect(isOpen()).toBe(true)
    expect(input().element.value).toBe('')
    expect(input().attributes('placeholder')).toBe('Every command. Type to filter')
    expect(selected()).toBeNull()
    // no Recent group in the help list
    expect(wrapper.findAll('.sd-palette-group')[0].text()).toBe(GROUPS[0])
    expect(wrapper.find('[data-command="zap"]').findAll('.sd-palette-alias').map(a => a.text())).toEqual(['reset'])
    expect(saved()).toEqual(['zap'])
  })

  it('typing leaves the help list', async () => {
    mountPalette()
    await openPalette()
    await type('?')
    await press('Enter')
    await nextTick()
    await type('z')
    await type('')
    expect(input().attributes('placeholder')).toBe('Type a command (help lists them)')
    expect(wrapper.find('[data-command="zap"]').find('.sd-palette-alias').exists()).toBe(false)
  })
})

describe('docs search', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  /**
   * Types a line and waits for the docs search to answer.
   * @param {string} text - The line
   */
  async function search(text) {
    await type(text)
    await vi.advanceTimersByTimeAsync(150)
    await nextTick()
  }

  it('"/" alone asks for words', async () => {
    mountPalette()
    await openPalette()
    await type('/')
    expect(wrapper.find('.sd-palette-empty').text()).toBe('Search the docs: type words after /')
    await vi.advanceTimersByTimeAsync(150)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('searches a little after the typing stops, and says "Searching…" until the answer', async () => {
    mountPalette()
    await openPalette()
    await type('/au')
    await type('/auto fill')
    expect(wrapper.find('.sd-palette-empty').text()).toBe('Searching…')
    await vi.advanceTimersByTimeAsync(100)
    expect(fetch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(50)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/__smile/docs/search?q=auto%20fill')
  })

  it('lists the results with their heading and section', async () => {
    mountPalette()
    await openPalette()
    await search('/auto')
    expect(rows()).toHaveLength(2)
    expect(rows()[0].find('.sd-palette-name').text()).toBe('Autofill')
    expect(rows()[0].find('.sd-palette-sub').text()).toBe('› Fake data')
    expect(rows()[0].find('.sd-palette-desc').text()).toBe('Coding')
    expect(rows()[0].classes()).toContain('is-doc')
    // a heading that is the page's title is not repeated
    expect(rows()[1].find('.sd-palette-sub').exists()).toBe(false)
    expect(selected()).toBe('search auto')
  })

  it('enter opens the chosen result in Docs mode', async () => {
    const { store } = mountPalette()
    await openPalette()
    await search('/auto')
    await press('ArrowDown')
    await press('Enter')
    expect(store.dev.mainView).toBe('docs')
    expect(store.dev.docsPage).toBe('coding/steps.md')
    expect(isOpen()).toBe(false)
    expect(saved()).toEqual(['search auto'])
  })

  it('tab on a result does nothing', async () => {
    mountPalette()
    await openPalette()
    await search('/auto')
    await press('Tab')
    expect(input().element.value).toBe('/auto')
  })

  it('tab on the search command completes to "/"', async () => {
    mountPalette()
    await openPalette()
    await type('sear')
    await press('Tab')
    expect(input().element.value).toBe('/')
  })

  it('says so when no page matches, and enter then is an error', async () => {
    vi.mocked(fetch).mockResolvedValue({ json: async () => [] })
    mountPalette()
    await openPalette()
    await search('/qqq')
    expect(wrapper.find('.sd-palette-empty').text()).toBe('No docs match "qqq"')
    await press('Enter')
    expect(error().text()).toBe('No docs match "qqq"')
  })

  it.each([
    ['the request fails', async () => {
      throw new Error('offline')
    }],
    ['the answer is not a list', async () => ({ json: async () => ({ error: 'no docs' }) })],
  ])('has no results when %s', async (_name, answer) => {
    vi.mocked(fetch).mockImplementation(answer)
    mountPalette()
    await openPalette()
    await search('/auto')
    expect(rows()).toHaveLength(0)
    expect(wrapper.find('.sd-palette-empty').text()).toBe('No docs match "auto"')
  })

  it('drops an answer that comes back after the words changed', async () => {
    let answer
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => {
      answer = resolve
    }))
    mountPalette()
    await openPalette()
    await type('/auto')
    await vi.advanceTimersByTimeAsync(150)
    await type('/steps now')
    answer({ json: async () => DOCS })
    await vi.advanceTimersByTimeAsync(0)
    expect(rows()).toHaveLength(0)
    expect(wrapper.find('.sd-palette-empty').text()).toBe('Searching…')
  })

  it('clears the results when the line is no longer a search', async () => {
    mountPalette()
    await openPalette()
    await search('/auto')
    await type('side')
    expect(entries()).toEqual(['side', 'side steps', 'side random', 'side info'])
    await type('/')
    expect(rows()).toHaveLength(0)
  })

  it('a search still waiting when the palette is removed is not sent', async () => {
    mountPalette()
    await openPalette()
    await type('/auto')
    wrapper.unmount()
    wrapper = null
    await vi.advanceTimersByTimeAsync(500)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('in the participant view', () => {
  it('a mode command sets the mode and loads the dev tools', async () => {
    const { store } = mountPalette({ context: 'participant' })
    await openPalette()
    await type('pres')
    await press('Enter')
    expect(store.dev.mainView).toBe('presentation')
    expect(location.href).toBe('/dev/')
    expect(isOpen()).toBe(false)
  })

  it('a dev tools command typed in full is unknown', async () => {
    const { store } = mountPalette({ context: 'participant' })
    await openPalette()
    await type('side')
    expect(rows()).toHaveLength(0)
    await press('Enter')
    expect(error().text()).toBe('Unknown command: side')
    expect(store.dev.showSideBar).toBe(false)
  })
})

describe('in the dev tools', () => {
  it('the participant view command leaves for the study\'s root', async () => {
    mountPalette()
    await openPalette()
    await type('part')
    await press('Enter')
    expect(location.href).toBe('/')
  })
})

describe('the other commands, run from the palette', () => {
  /**
   * Opens the palette, types a line and presses enter.
   * @param {string} line - The line
   */
  async function run(line) {
    await openPalette()
    await type(line)
    await press('Enter')
  }

  it('next and prev go to the neighbouring views', async () => {
    const { api } = mountPalette({ api: {
      nextView: vi.fn(() => ({ name: 'thanks' })),
      prevView: vi.fn(() => ({ name: 'consent' })),
    } })
    await run('next')
    expect(api.goToView).toHaveBeenLastCalledWith('thanks', true)
    await run('prev')
    expect(api.goToView).toHaveBeenLastCalledWith('consent', true)
  })

  it('next at the end of the timeline is an error', async () => {
    mountPalette()
    await run('next')
    expect(error().text()).toBe('No Next View')
  })

  it('pin pins the current route and db connects to the database', async () => {
    const { store, api } = mountPalette()
    await run('pin')
    expect(store.dev.pinnedRoute).toBe('task')
    await run('db')
    expect(api.setKnown).toHaveBeenCalledTimes(1)
    expect(api.setConsented).toHaveBeenCalledTimes(1)
  })

  it('full turns full screen on, and a mode command opens that mode', async () => {
    const { store } = mountPalette()
    await run('full')
    expect(store.dev.isFullscreen).toBe(true)
    await run('config')
    expect(store.dev.mainView).toBe('config')
    expect(isOpen()).toBe(false)
  })
})
