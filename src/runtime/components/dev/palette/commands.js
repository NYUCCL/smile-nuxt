/**
 * The `:` command palette's commands: one list, read by the palette and by
 * `:help`. The modes come from the rail's list (../menu/devModes.js); where a
 * command does what a navbar shortcut does, it runs the same function
 * (../devActions.js).
 *
 * A command:
 * - name: what you type; aliases: other names that work
 * - group: Modes | Navigate | Actions | Panels | Help
 * - description, icon (lucide), shortcut (the existing key, if any)
 * - contexts: where it's offered: 'dev' (the dev tools, /dev/) and/or
 *   'participant' (the participant view on the local dev server)
 * - arg: 'view' when it takes a view name (`go welcome`), 'docs' for words to
 *   search the docs with (`/autofill`); argPrefix: what Tab completes it to
 * - run(env, arg, pick): does it (pick: the docs search result chosen); returns { action, type } (type 'error': the palette
 *   says action under its prompt and stays open), or null for
 *   none. env: { api, context, navigate(url), nextTick, setDevColorMode(mode),
 *   openHelp(), searchDocs(words) }
 */
import {
  ArrowDown, ArrowUp, CircleHelp, Database, Dices, Info, ListTree, Maximize, Moon,
  PanelBottom, PanelRight, Pin, RotateCcw, Route, Search, Settings, Sun, Terminal,
  UserRound, WandSparkles, Zap,
} from 'lucide-vue-next'
import { DEV_MODES } from '../menu/devModes'
import * as actions from '../devActions'
import { docsJump } from './bus'

export const GROUPS = ['Modes', 'Navigate', 'Actions', 'Panels', 'Docs', 'Help']

const BOTH = ['dev', 'participant']
const DEV = ['dev']

/** Leave config/docs for developer mode, where the experiment shows */
function showExperiment(api) {
  if (api.store.dev.mainView === 'config' || api.store.dev.mainView === 'docs') {
    api.store.dev.mainView = 'devmode'
  }
}

/**
 * The timeline's views, as the route jumper lists them: the sequence first,
 * then the other routes, without redirect-only ones (e.g. landing).
 * @returns {string[]} the view names
 */
export function timelineViews(api) {
  const seq = api.store.localState.seqtimeline || []
  const routes = api.store.localState.routes || []
  const inSeq = new Set(seq.map(r => r.name))
  return seq.filter(r => !r.redirect)
    .concat(routes.filter(r => !inSeq.has(r.name) && !r.redirect))
    .map(r => r.name)
}

const modeCommands = DEV_MODES.map(mode => ({
  name: mode.command,
  aliases: mode.aliases,
  group: 'Modes',
  description: mode.label,
  icon: mode.icon,
  contexts: BOTH,
  view: mode.view,
  async run({ api, context, navigate, nextTick }) {
    api.store.dev.mainView = mode.view
    if (context === 'participant') {
      // A page load into the dev tools: like LocalDevBanner's openDevMode,
      // let the dev-sync watcher write the cookie first
      await nextTick()
      navigate('/dev/')
      return null
    }
    return { action: `Opened ${mode.label}` }
  },
}))

/** Every command, in display order */
export const COMMANDS = [
  ...modeCommands,
  {
    name: 'part',
    aliases: ['participant'],
    group: 'Modes',
    description: 'Participant view (leaves the dev tools)',
    icon: UserRound,
    contexts: DEV,
    run({ navigate }) {
      navigate('/') // as the rail's participant view link
      return null
    },
  },

  {
    name: 'go',
    aliases: ['goto'],
    group: 'Navigate',
    description: 'Go to a view',
    icon: Route,
    contexts: BOTH,
    arg: 'view',
    argPrefix: 'go ',
    run({ api }, view) {
      if (!view) return { action: 'Which view? :go <view>', type: 'error' }
      if (!timelineViews(api).includes(view)) return { action: `No view "${view}"`, type: 'error' }
      showExperiment(api)
      api.goToView(view, true)
      return { action: `Went to ${view}` }
    },
  },
  {
    name: 'next',
    aliases: ['n'],
    group: 'Navigate',
    description: 'Next view in the timeline',
    icon: ArrowDown,
    shortcut: '↓',
    contexts: BOTH,
    run({ api }) {
      showExperiment(api)
      return actions.goNextView(api)
    },
  },
  {
    name: 'prev',
    aliases: ['previous', 'back'],
    group: 'Navigate',
    description: 'Previous view in the timeline',
    icon: ArrowUp,
    shortcut: '↑',
    contexts: BOTH,
    run({ api }) {
      showExperiment(api)
      return actions.goPrevView(api)
    },
  },

  {
    name: 'zap',
    aliases: ['reset'],
    group: 'Actions',
    description: 'Zap the local state and reload',
    icon: Zap,
    shortcut: 'Ctrl R',
    contexts: BOTH,
    run: ({ api }) => actions.resetLocalState(api),
  },
  {
    name: 'fill',
    aliases: ['autofill'],
    group: 'Actions',
    description: 'Autofill the current view',
    icon: WandSparkles,
    shortcut: 'Ctrl A',
    contexts: BOTH,
    run: ({ api }) => actions.autofillView(api),
  },
  {
    name: 'pin',
    aliases: ['unpin'],
    group: 'Actions',
    description: 'Pin or unpin the current route',
    icon: Pin,
    shortcut: 'Ctrl P',
    contexts: DEV,
    run: ({ api }) => actions.togglePinnedRoute(api),
  },
  {
    name: 'db',
    aliases: ['connect', 'database'],
    group: 'Actions',
    description: 'Connect to the database',
    icon: Database,
    shortcut: 'Ctrl D',
    contexts: DEV,
    run: ({ api }) => actions.connectDatabase(api),
  },
  {
    name: 'dark',
    aliases: [],
    group: 'Actions',
    description: 'Dev tools theme: dark',
    icon: Moon,
    contexts: DEV,
    run({ setDevColorMode }) {
      setDevColorMode('dark')
      return { action: 'Dev Tools: Dark' }
    },
  },
  {
    name: 'light',
    aliases: [],
    group: 'Actions',
    description: 'Dev tools theme: light',
    icon: Sun,
    contexts: DEV,
    run({ setDevColorMode }) {
      setDevColorMode('light')
      return { action: 'Dev Tools: Light' }
    },
  },

  {
    name: 'reload',
    aliases: ['refresh'],
    group: 'Actions',
    description: 'Reload the page',
    icon: RotateCcw,
    shortcut: '⌘ R',
    contexts: BOTH,
    run: ({ api }) => actions.reloadPage(api),
  },
  {
    name: 'full',
    aliases: ['fullscreen', 'responsive'],
    group: 'Actions',
    description: 'Full screen or the responsive device preview',
    icon: Maximize,
    contexts: DEV,
    run({ api }) {
      showExperiment(api)
      return actions.toggleFullscreen(api)
    },
  },
  {
    name: 'side',
    aliases: ['sidebar'],
    group: 'Panels',
    description: 'Show or hide the sidebar',
    icon: PanelRight,
    shortcut: 'Ctrl 1',
    contexts: DEV,
    run({ api }) {
      showExperiment(api)
      return actions.toggleSideBar(api)
    },
  },
  {
    name: 'console',
    aliases: [],
    group: 'Panels',
    description: 'Show or hide the console',
    icon: PanelBottom,
    shortcut: 'Ctrl `',
    contexts: DEV,
    run({ api }) {
      showExperiment(api)
      return actions.toggleConsole(api)
    },
  },

  ...[
    ['steps', [], ListTree, 'steps'],
    ['random', ['randomization'], Dices, 'randomization'],
    ['info', ['dbinfo'], Info, 'db'],
  ].map(([name, aliases, icon, tab]) => ({
    name,
    aliases,
    group: 'Panels',
    description: `Sidebar: ${actions.SIDEBAR_TABS[tab]} tab`,
    icon,
    contexts: DEV,
    run({ api }) {
      showExperiment(api)
      return actions.showSideBarTab(api, tab)
    },
  })),
  ...[
    ['data', ['browse', 'explorer'], Database, 'browse'],
    ['log', ['narrative'], Terminal, 'log'],
    ['vars', ['configuration', 'env'], Settings, 'config'],
  ].map(([name, aliases, icon, tab]) => ({
    name,
    aliases,
    group: 'Panels',
    description: `Console: ${actions.CONSOLE_TABS[tab]} tab`,
    icon,
    contexts: DEV,
    run({ api }) {
      showExperiment(api)
      return actions.showConsoleTab(api, tab)
    },
  })),

  {
    name: 'search',
    aliases: ['/', 's', 'find'],
    group: 'Docs',
    description: 'Search the docs: /words',
    icon: Search,
    contexts: BOTH,
    arg: 'docs',
    argPrefix: '/',
    async run({ api, context, navigate, nextTick, searchDocs }, words, pick) {
      if (!words && !pick) return { action: 'Search the docs: type words after /', type: 'error' }
      const hit = pick ?? (await searchDocs(words))[0]
      if (!hit) return { action: `No docs match "${words}"`, type: 'error' }
      docsJump.value = { path: hit.path, hash: hit.hash || '' }
      api.store.dev.docsPage = hit.path
      api.store.dev.mainView = 'docs'
      if (context === 'participant') {
        await nextTick() // let the dev cookie be written, as for the modes
        navigate('/dev/')
        return null
      }
      return { action: `Docs: ${hit.title}` }
    },
  },

  {
    name: 'help',
    aliases: ['?'],
    group: 'Help',
    description: 'List every command',
    icon: CircleHelp,
    contexts: BOTH,
    keepOpen: true,
    run({ openHelp }) {
      openHelp()
      return null
    },
  },
]

/** The commands offered in a context ('dev' or 'participant') */
export function commandsFor(context) {
  return COMMANDS.filter(c => c.contexts.includes(context))
}

/** A command by its name or an alias, among those given */
export function findCommand(word, commands = COMMANDS) {
  const w = word.toLowerCase()
  return commands.find(c => c.name === w || c.aliases.includes(w)) ?? null
}
