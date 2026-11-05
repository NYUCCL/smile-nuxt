import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { scoreText, matchItems, parseInput, highlight } from '../../src/runtime/components/dev/palette/match'
import { COMMANDS, GROUPS, commandNames, commandsFor, findCommand, fullName, timelineViews } from '../../src/runtime/components/dev/palette/commands'
import { loadHistory, pushHistory, HISTORY_KEY, HISTORY_MAX } from '../../src/runtime/components/dev/palette/history'
import { isOpenKey, isTypingTarget } from '../../src/runtime/components/dev/palette/keys'
import { DEV_MODES } from '../../src/runtime/components/dev/menu/devModes'

const names = c => [c.name, ...c.aliases]

describe('palette matcher', () => {
  it('ranks exact > prefix > substring > fuzzy', () => {
    const exact = scoreText('dev', 'dev').score
    const prefix = scoreText('de', 'dev').score
    const sub = scoreText('ev', 'dev').score
    const fuzzy = scoreText('dv', 'dev').score
    expect(exact).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(sub)
    expect(sub).toBeGreaterThan(fuzzy)
  })

  it('returns the matched letters for bolding', () => {
    expect(scoreText('co', 'console').indices).toEqual([0, 1])
    expect(scoreText('sol', 'console').indices).toEqual([3, 4, 5])
    expect(scoreText('cnl', 'console').indices).toEqual([0, 2, 5])
  })

  it('returns null when the letters are not there in order', () => {
    expect(scoreText('xyz', 'dev')).toBeNull()
    expect(scoreText('vd', 'dev')).toBeNull()
  })

  it('ignores case', () => {
    expect(scoreText('DEV', 'dev').score).toBe(scoreText('dev', 'dev').score)
  })

  it(':d picks dev (ties keep list order: modes first)', () => {
    const [first] = matchItems('d', commandsFor('dev'), names)
    expect(first.item.name).toBe('dev')
  })

  it('longer prefixes pick the one they name', () => {
    const top = q => matchItems(q, commandsFor('dev'), names)[0]?.item.name
    expect(top('da')).toBe('dark')
    expect(top('db')).toBe('db')
    expect(top('con')).toBe('config')
    expect(top('cons')).toBe('console')
    expect(top('p')).toBe('pres')
    expect(top('pa')).toBe('part')
    expect(top('fi')).toBe('fill')
    expect(top('f')).toBe('fill')
    expect(top('fu')).toBe('full')
    expect(top('s')).toBe('search')
    expect(top('l')).toBe('light')
    expect(top('lo')).toBe('log')
  })

  it('fuzzy matches: letters in order with gaps', () => {
    const top = matchItems('cnsl', commandsFor('dev'), names)[0]
    expect(top.item.name).toBe('console')
  })

  it('an alias match is reported, and loses ties to a name', () => {
    const [m] = matchItems('autofill', commandsFor('dev'), names)
    expect(m.item.name).toBe('fill')
    expect(m.alias).toBe('autofill')
    expect(m.indices).toEqual([])
  })

  it('nothing matches: an empty list', () => {
    expect(matchItems('zzzz', commandsFor('dev'), names)).toEqual([])
  })

  it('parses a command word and its argument', () => {
    expect(parseInput('go welcome')).toEqual({ head: 'go', arg: 'welcome', spaced: true })
    expect(parseInput('go ')).toEqual({ head: 'go', arg: '', spaced: true })
    expect(parseInput('go')).toEqual({ head: 'go', arg: '', spaced: false })
    expect(parseInput('  dev')).toEqual({ head: 'dev', arg: '', spaced: false })
    expect(parseInput('')).toEqual({ head: '', arg: '', spaced: false })
    expect(parseInput('/auto fill')).toEqual({ head: '/', arg: 'auto fill', spaced: true })
    expect(parseInput('/')).toEqual({ head: '/', arg: '', spaced: true })
  })

  it('splits a name into bold and plain runs', () => {
    expect(highlight('dev', [0])).toEqual([{ text: 'd', hit: true }, { text: 'ev', hit: false }])
    expect(highlight('console', [0, 2, 5])).toEqual([
      { text: 'c', hit: true }, { text: 'o', hit: false }, { text: 'n', hit: true },
      { text: 'so', hit: false }, { text: 'l', hit: true }, { text: 'e', hit: false },
    ])
    expect(highlight('dev')).toEqual([{ text: 'dev', hit: false }])
  })
})

function fakeApi(overrides = {}) {
  return {
    store: {
      dev: { mainView: 'devmode', showSideBar: false, showConsoleBar: false, pinnedRoute: null },
      cookieState: { knownUser: false },
      localState: {
        seqtimeline: [{ name: 'landing', redirect: '/welcome' }, { name: 'welcome' }, { name: 'consent' }],
        routes: [{ name: 'welcome' }, { name: 'consent' }, { name: 'withdraw' }, { name: 'landing', redirect: '/welcome' }],
      },
    },
    goToView: vi.fn(),
    nextView: vi.fn(() => ({ name: 'consent' })),
    prevView: vi.fn(() => null),
    hasAutofill: vi.fn(() => true),
    autofill: vi.fn(),
    setKnown: vi.fn(),
    setConsented: vi.fn(),
    resetLocalState: vi.fn(),
    currentRouteName: vi.fn(() => 'welcome'),
    ...overrides,
  }
}

function env(api, context = 'dev') {
  return {
    api,
    context,
    navigate: vi.fn(),
    nextTick: vi.fn(() => Promise.resolve()),
    setDevColorMode: vi.fn(),
    openHelp: vi.fn(),
  }
}

describe('palette commands', () => {
  it('names and aliases are unique, lower case, without spaces', () => {
    const all = COMMANDS.flatMap(names)
    expect(new Set(all).size).toBe(all.length)
    for (const n of all) expect(n).toMatch(/^([a-z]+|[?/])$/)
  })

  it('every command has a known group, a description, an icon and a run', () => {
    for (const c of COMMANDS) {
      expect(GROUPS).toContain(c.group)
      expect(c.description).toBeTruthy()
      expect(c.icon).toBeTruthy()
      expect(typeof c.run).toBe('function')
      expect(c.contexts.length).toBeGreaterThan(0)
    }
  })

  it('has the commands the brief names', () => {
    const dev = commandsFor('dev').map(c => c.name)
    for (const n of ['dev', 'pres', 'config', 'part', 'go', 'next', 'prev', 'zap', 'reload', 'full', 'fill', 'pin', 'db', 'dark', 'light', 'side', 'console', 'steps', 'random', 'info', 'data', 'log', 'vars', 'search', 'help']) {
      expect(dev).toContain(n)
    }
  })

  it('modes come from the rail\'s list', () => {
    const modes = COMMANDS.filter(c => c.group === 'Modes' && c.view)
    expect(modes.map(c => c.view)).toEqual(DEV_MODES.map(m => m.view))
  })

  it('the participant view offers only what works there', () => {
    const part = commandsFor('participant').map(c => c.name)
    expect(part).toEqual(expect.arrayContaining(['dev', 'pres', 'config', 'go', 'next', 'prev', 'zap', 'reload', 'fill', 'search', 'help']))
    for (const n of ['part', 'pin', 'db', 'dark', 'light', 'side', 'console', 'full', 'steps', 'random', 'log', 'vars']) expect(part).not.toContain(n)
  })

  it('finds a command by name or alias', () => {
    expect(findCommand('presentation').name).toBe('pres')
    expect(findCommand('SIDEBAR').name).toBe('side')
    expect(findCommand('nope')).toBeNull()
    expect(findCommand('pin', commandsFor('participant'))).toBeNull()
  })

  it('panel tabs are named under their panel, and answer to both names', () => {
    const steps = findCommand('steps')
    expect(fullName(steps)).toBe('side steps')
    expect(findCommand('side steps')).toBe(steps)
    expect(findCommand('side  randomization').name).toBe('random')
    expect(fullName(findCommand('log'))).toBe('console log')
    expect(findCommand('console data').name).toBe('data')
    expect(findCommand('side')).toBe(findCommand('sidebar')) // the panel itself
  })

  it('typing a panel lists its tabs after it; more words narrow them', () => {
    const dev = commandsFor('dev')
    const shown = q => matchItems(q, dev, commandNames).map(m => fullName(m.item))
    expect(shown('side').slice(0, 4)).toEqual(['side', 'side steps', 'side random', 'side info'])
    expect(shown('side st')).toEqual(['side steps'])
    expect(shown('console').slice(0, 4)).toEqual(['console', 'console data', 'console log', 'console vars'])
    expect(shown('steps')[0]).toBe('side steps')
  })

  it('lists the timeline views as the route jumper does', () => {
    expect(timelineViews(fakeApi())).toEqual(['welcome', 'consent', 'withdraw'])
  })

  it('a mode command sets the mode in the dev tools', async () => {
    const api = fakeApi()
    const e = env(api)
    const result = await findCommand('pres').run(e)
    expect(api.store.dev.mainView).toBe('presentation')
    expect(result.action).toMatch(/Presentation/)
    expect(e.navigate).not.toHaveBeenCalled()
  })

  it('from the participant view, a mode command sets the mode, then loads /dev/', async () => {
    const api = fakeApi()
    const e = env(api, 'participant')
    api.store.dev.mainView = 'presentation'
    await findCommand('dev').run(e)
    expect(api.store.dev.mainView).toBe('devmode')
    expect(e.nextTick).toHaveBeenCalled()
    expect(e.navigate).toHaveBeenCalledWith('/dev/')
  })

  it('part leaves for the participant view', () => {
    const e = env(fakeApi())
    findCommand('part').run(e)
    expect(e.navigate).toHaveBeenCalledWith('/')
  })

  it('go goes to a view, and refuses one that is not in the timeline', () => {
    const api = fakeApi()
    api.store.dev.mainView = 'config'
    expect(findCommand('go').run(env(api), 'consent').type).toBeUndefined()
    expect(api.goToView).toHaveBeenCalledWith('consent', true)
    expect(api.store.dev.mainView).toBe('devmode') // back where the experiment shows
    expect(findCommand('go').run(env(api), 'nowhere').type).toBe('error')
    expect(findCommand('go').run(env(api), '').type).toBe('error')
  })

  it('next / prev use the navbar\'s functions', () => {
    const api = fakeApi()
    expect(findCommand('next').run(env(api)).action).toBe('Next: consent')
    expect(api.goToView).toHaveBeenCalledWith('consent', true)
    expect(findCommand('prev').run(env(api)).type).toBe('error')
  })

  it('panels and actions do what the Ctrl shortcuts do', () => {
    const api = fakeApi()
    expect(findCommand('side').run(env(api)).action).toBe('Showing Sidebar')
    expect(api.store.dev.showSideBar).toBe(true)
    expect(findCommand('console').run(env(api)).action).toBe('Showing Console')
    expect(findCommand('pin').run(env(api)).action).toBe('Pinned Current Route')
    expect(api.store.dev.pinnedRoute).toBe('welcome')
    expect(findCommand('pin').run(env(api)).action).toBe('Unpinned Route')
    expect(findCommand('fill').run(env(api)).action).toBe('Autofilled Current View')
    expect(api.autofill).toHaveBeenCalled()
    expect(findCommand('db').run(env(api)).action).toBe('Connected to Database')
    expect(api.setKnown).toHaveBeenCalled()
    expect(api.setConsented).toHaveBeenCalled()
  })

  it('fill without an autofill is an error', () => {
    const api = fakeApi({ hasAutofill: vi.fn(() => false) })
    expect(findCommand('fill').run(env(api)).type).toBe('error')
    expect(api.autofill).not.toHaveBeenCalled()
  })

  it('zap (alias reset) zaps the local state', () => {
    const api = fakeApi()
    findCommand('reset').run(env(api))
    expect(findCommand('reset').name).toBe('zap')
    expect(api.resetLocalState).toHaveBeenCalled()
  })

  it('reload and full do what the toolbar buttons do', () => {
    const api = fakeApi({ reloadBrowser: vi.fn() })
    findCommand('reload').run(env(api))
    expect(api.reloadBrowser).toHaveBeenCalled()
    api.store.dev.isFullscreen = false
    expect(findCommand('full').run(env(api)).action).toBe('Full Screen')
    expect(api.store.dev.isFullscreen).toBe(true)
  })

  it('tab commands open their panel on that tab', () => {
    const api = fakeApi()
    findCommand('random').run(env(api))
    expect(api.store.dev.showSideBar).toBe(true)
    expect(api.store.dev.sideBarTab).toBe('randomization')
    findCommand('log').run(env(api))
    expect(api.store.dev.showConsoleBar).toBe(true)
    expect(api.store.dev.consoleBarTab).toBe('log')
    findCommand('vars').run(env(api))
    expect(api.store.dev.consoleBarTab).toBe('config')
    expect(findCommand('dbinfo').name).toBe('info')
  })

  it('search opens Docs mode at the chosen result, or the top one', async () => {
    const { docsJump } = await import('../../src/runtime/components/dev/palette/bus')
    const api = fakeApi()
    const e = { ...env(api), searchDocs: vi.fn(async () => [{ path: 'coding/autofill.md', hash: 'autofill-forms', title: 'Autofill' }]) }
    expect((await findCommand('/').run(e, 'autofill')).action).toBe('Docs: Autofill')
    expect(api.store.dev.mainView).toBe('docs')
    expect(api.store.dev.docsPage).toBe('coding/autofill.md')
    expect(docsJump.value).toEqual({ path: 'coding/autofill.md', hash: 'autofill-forms' })
    await findCommand('s').run(e, 'x', { path: 'a.md', hash: '', title: 'A' })
    expect(api.store.dev.docsPage).toBe('a.md')
    e.searchDocs = vi.fn(async () => [])
    expect((await findCommand('find').run(e, 'zzz')).type).toBe('error')
    expect((await findCommand('search').run(e, '')).type).toBe('error')
  })

  it('dark / light set the dev tools\' theme', () => {
    const e = env(fakeApi())
    findCommand('dark').run(e)
    expect(e.setDevColorMode).toHaveBeenCalledWith('dark')
    findCommand('light').run(e)
    expect(e.setDevColorMode).toHaveBeenCalledWith('light')
  })

  it('help opens the list and stays open', () => {
    const e = env(fakeApi())
    expect(findCommand('help').keepOpen).toBe(true)
    findCommand('help').run(e)
    expect(e.openHelp).toHaveBeenCalled()
  })
})

describe('palette history', () => {
  let store
  const storage = {
    getItem: k => store[k] ?? null,
    setItem: (k, v) => {
      store[k] = v
    },
  }
  beforeEach(() => {
    store = {}
  })
  afterEach(() => vi.restoreAllMocks())

  it('keeps commands newest first, once each, up to the limit', () => {
    pushHistory('dev', storage)
    pushHistory('go welcome', storage)
    pushHistory('dev', storage)
    expect(loadHistory(storage)).toEqual(['dev', 'go welcome'])
    for (let i = 0; i < 30; i++) pushHistory(`go v${i}`, storage)
    expect(loadHistory(storage)).toHaveLength(HISTORY_MAX)
  })

  it('survives bad data and storage that throws', () => {
    store[HISTORY_KEY] = '{not json'
    expect(loadHistory(storage)).toEqual([])
    store[HISTORY_KEY] = '{"a":1}'
    expect(loadHistory(storage)).toEqual([])
    const blocked = () => {
      throw new Error('blocked')
    }
    const broken = { getItem: blocked, setItem: blocked }
    expect(loadHistory(broken)).toEqual([])
    expect(pushHistory('dev', broken)).toEqual(['dev'])
    expect(loadHistory(undefined)).toEqual([])
  })
})

describe('palette keys', () => {
  const key = (k, mods = {}) => new KeyboardEvent('keydown', { key: k, ...mods })

  it('opens on a plain :', () => {
    expect(isOpenKey(key(':', { shiftKey: true }))).toBe(true)
    expect(isOpenKey(key(':', { ctrlKey: true }))).toBe(false)
    expect(isOpenKey(key(':', { metaKey: true }))).toBe(false)
    expect(isOpenKey(key(';'))).toBe(false)
  })

  it('knows where you type', () => {
    const on = (el) => {
      document.body.appendChild(el)
      const event = key(':')
      let typing
      el.addEventListener('keydown', e => (typing = isTypingTarget(e)))
      el.dispatchEvent(event)
      el.remove()
      return typing
    }
    expect(on(document.createElement('input'))).toBe(true)
    expect(on(document.createElement('textarea'))).toBe(true)
    expect(on(document.createElement('select'))).toBe(true)
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    expect(on(editable)).toBe(true)
    const plain = document.createElement('div')
    plain.tabIndex = 0
    expect(on(plain)).toBe(false)
  })
})
