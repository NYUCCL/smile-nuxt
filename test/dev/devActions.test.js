/**
 * @fileoverview The dev tools' actions (components/dev/devActions.js): what
 * each one changes and the message it returns.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as actions from '../../src/runtime/components/dev/devActions.js'

function createApi(dev = {}, cookieState = {}) {
  return {
    store: {
      dev: {
        showSideBar: false,
        showConsoleBar: false,
        sideBarTab: 'steps',
        consoleBarTab: 'browse',
        isFullscreen: false,
        pinnedRoute: null,
        ...dev,
      },
      cookieState: { knownUser: false, ...cookieState },
    },
    resetLocalState: vi.fn(),
    reloadBrowser: vi.fn(),
    setKnown: vi.fn(),
    setConsented: vi.fn(),
    hasAutofill: vi.fn(() => false),
    autofill: vi.fn(),
    currentRouteName: vi.fn(() => 'task'),
    nextView: vi.fn(() => null),
    prevView: vi.fn(() => null),
    goToView: vi.fn(),
  }
}

describe('dev actions', () => {
  let api
  beforeEach(() => {
    api = createApi()
  })

  it('toggleSideBar shows, then hides', () => {
    expect(actions.toggleSideBar(api)).toEqual({ action: 'Showing Sidebar' })
    expect(api.store.dev.showSideBar).toBe(true)
    expect(actions.toggleSideBar(api)).toEqual({ action: 'Hiding Sidebar' })
    expect(api.store.dev.showSideBar).toBe(false)
  })

  it('toggleConsole shows, then hides', () => {
    expect(actions.toggleConsole(api)).toEqual({ action: 'Showing Console' })
    expect(api.store.dev.showConsoleBar).toBe(true)
    expect(actions.toggleConsole(api)).toEqual({ action: 'Hiding Console' })
    expect(api.store.dev.showConsoleBar).toBe(false)
  })

  describe('cycleSideBarTab', () => {
    it('is an error while the sidebar is hidden, and changes nothing', () => {
      expect(actions.cycleSideBarTab(api)).toEqual({ action: 'Sidebar is hidden', type: 'error' })
      expect(api.store.dev.sideBarTab).toBe('steps')
    })

    it('goes steps → randomization → db → steps', () => {
      api.store.dev.showSideBar = true
      expect(actions.cycleSideBarTab(api)).toEqual({ action: 'Switched to Random Tab' })
      expect(api.store.dev.sideBarTab).toBe('randomization')
      expect(actions.cycleSideBarTab(api)).toEqual({ action: 'Switched to DB Info Tab' })
      expect(api.store.dev.sideBarTab).toBe('db')
      expect(actions.cycleSideBarTab(api)).toEqual({ action: 'Switched to Steps Tab' })
      expect(api.store.dev.sideBarTab).toBe('steps')
    })

    it('goes to steps from a tab it does not know', () => {
      api = createApi({ showSideBar: true, sideBarTab: 'removed-tab' })
      actions.cycleSideBarTab(api)
      expect(api.store.dev.sideBarTab).toBe('steps')
    })
  })

  describe('cycleConsoleTab', () => {
    it('is an error while the console is hidden, and changes nothing', () => {
      expect(actions.cycleConsoleTab(api)).toEqual({ action: 'Console is hidden', type: 'error' })
      expect(api.store.dev.consoleBarTab).toBe('browse')
    })

    it('goes browse → log → config → browse', () => {
      api.store.dev.showConsoleBar = true
      expect(actions.cycleConsoleTab(api)).toEqual({ action: 'Switched to Log Tab' })
      expect(api.store.dev.consoleBarTab).toBe('log')
      expect(actions.cycleConsoleTab(api)).toEqual({ action: 'Switched to Config Tab' })
      expect(api.store.dev.consoleBarTab).toBe('config')
      expect(actions.cycleConsoleTab(api)).toEqual({ action: 'Switched to Browse Tab' })
      expect(api.store.dev.consoleBarTab).toBe('browse')
    })
  })

  it('every tab the cycles reach has a label', () => {
    expect(Object.keys(actions.SIDEBAR_TABS)).toEqual(['steps', 'randomization', 'db'])
    expect(Object.keys(actions.CONSOLE_TABS)).toEqual(['browse', 'log', 'config'])
  })

  it('showSideBarTab opens the sidebar on the tab and names it', () => {
    expect(actions.showSideBarTab(api, 'db')).toEqual({ action: 'Sidebar: Info' })
    expect(api.store.dev.showSideBar).toBe(true)
    expect(api.store.dev.sideBarTab).toBe('db')
  })

  it('showConsoleTab opens the console on the tab and names it', () => {
    expect(actions.showConsoleTab(api, 'log')).toEqual({ action: 'Console: Narrative Log' })
    expect(api.store.dev.showConsoleBar).toBe(true)
    expect(api.store.dev.consoleBarTab).toBe('log')
  })

  it('resetLocalState and reloadPage call the API', () => {
    expect(actions.resetLocalState(api)).toEqual({ action: 'Zapping Local State' })
    expect(api.resetLocalState).toHaveBeenCalledTimes(1)
    expect(actions.reloadPage(api)).toEqual({ action: 'Reloading' })
    expect(api.reloadBrowser).toHaveBeenCalledTimes(1)
  })

  it('toggleFullscreen switches between full screen and the device preview', () => {
    expect(actions.toggleFullscreen(api)).toEqual({ action: 'Full Screen' })
    expect(api.store.dev.isFullscreen).toBe(true)
    expect(actions.toggleFullscreen(api)).toEqual({ action: 'Responsive Mode' })
    expect(api.store.dev.isFullscreen).toBe(false)
  })

  describe('connectDatabase', () => {
    it('makes an unknown user known and consented', () => {
      expect(actions.connectDatabase(api)).toEqual({ action: 'Connected to Database' })
      expect(api.setKnown).toHaveBeenCalledTimes(1)
      expect(api.setConsented).toHaveBeenCalledTimes(1)
    })

    it('does nothing for a known user', () => {
      api = createApi({}, { knownUser: true })
      expect(actions.connectDatabase(api)).toEqual({ action: 'Already Connected to Database' })
      expect(api.setKnown).not.toHaveBeenCalled()
      expect(api.setConsented).not.toHaveBeenCalled()
    })
  })

  describe('autofillView', () => {
    it('is an error when the view has no autofill', () => {
      expect(actions.autofillView(api)).toEqual({ action: 'No Autofill Available', type: 'error' })
      expect(api.autofill).not.toHaveBeenCalled()
    })

    it('runs the view\'s autofill', () => {
      api.hasAutofill.mockReturnValue(true)
      expect(actions.autofillView(api)).toEqual({ action: 'Autofilled Current View' })
      expect(api.autofill).toHaveBeenCalledTimes(1)
    })
  })

  describe('togglePinnedRoute', () => {
    it('pins the current route', () => {
      expect(actions.togglePinnedRoute(api)).toEqual({ action: 'Pinned Current Route' })
      expect(api.store.dev.pinnedRoute).toBe('task')
    })

    it('unpins it when it is the pinned one', () => {
      api.store.dev.pinnedRoute = 'task'
      expect(actions.togglePinnedRoute(api)).toEqual({ action: 'Unpinned Route' })
      expect(api.store.dev.pinnedRoute).toBeNull()
    })

    it('moves the pin when another route is pinned', () => {
      api.store.dev.pinnedRoute = 'consent'
      expect(actions.togglePinnedRoute(api)).toEqual({ action: 'Pinned Current Route' })
      expect(api.store.dev.pinnedRoute).toBe('task')
    })
  })

  describe('goNextView and goPrevView', () => {
    it('are errors at the ends of the timeline', () => {
      expect(actions.goNextView(api)).toEqual({ action: 'No Next View', type: 'error' })
      expect(actions.goPrevView(api)).toEqual({ action: 'No Previous View', type: 'error' })
      expect(api.goToView).not.toHaveBeenCalled()
    })

    it('go to the neighbouring view, forcing the navigation', () => {
      api.nextView.mockReturnValue({ name: 'feedback' })
      api.prevView.mockReturnValue({ name: 'consent' })
      expect(actions.goNextView(api)).toEqual({ action: 'Next: feedback' })
      expect(api.goToView).toHaveBeenLastCalledWith('feedback', true)
      expect(actions.goPrevView(api)).toEqual({ action: 'Back: consent' })
      expect(api.goToView).toHaveBeenLastCalledWith('consent', true)
    })
  })
})
