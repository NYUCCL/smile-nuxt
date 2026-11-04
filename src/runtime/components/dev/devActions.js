/**
 * What the dev tools' keyboard shortcuts (navbar/SmileDevNavBar.vue) and the
 * `:` command palette (palette/) do, in one place so both call the same code.
 *
 * Each action takes the API (useAPI()) and returns what the toast
 * (navbar/KeyCommandNotification.vue) should say: { action, type }, where type
 * is 'default' or 'error'.
 */

/** Show or hide the dev tools' sidebar (Ctrl + 1) */
export function toggleSideBar(api) {
  api.store.dev.showSideBar = !api.store.dev.showSideBar
  return { action: api.store.dev.showSideBar ? 'Showing Sidebar' : 'Hiding Sidebar' }
}

/** Show or hide the dev tools' console (Ctrl + `) */
export function toggleConsole(api) {
  api.store.dev.showConsoleBar = !api.store.dev.showConsoleBar
  return { action: api.store.dev.showConsoleBar ? 'Showing Console' : 'Hiding Console' }
}

/** The sidebar's next tab: Steps -> Random -> DB Info (Ctrl + 2) */
export function cycleSideBarTab(api) {
  if (!api.store.dev.showSideBar) return { action: 'Sidebar is hidden', type: 'error' }
  const tab = api.store.dev.sideBarTab
  if (tab === 'steps') {
    api.store.dev.sideBarTab = 'randomization'
    return { action: 'Switched to Random Tab' }
  }
  if (tab === 'randomization') {
    api.store.dev.sideBarTab = 'db'
    return { action: 'Switched to DB Info Tab' }
  }
  api.store.dev.sideBarTab = 'steps'
  return { action: 'Switched to Steps Tab' }
}

/** The console's next tab: Browse -> Log -> Config (Ctrl + 3) */
export function cycleConsoleTab(api) {
  if (!api.store.dev.showConsoleBar) return { action: 'Console is hidden', type: 'error' }
  const tab = api.store.dev.consoleBarTab
  if (tab === 'browse') {
    api.store.dev.consoleBarTab = 'log'
    return { action: 'Switched to Log Tab' }
  }
  if (tab === 'log') {
    api.store.dev.consoleBarTab = 'config'
    return { action: 'Switched to Config Tab' }
  }
  api.store.dev.consoleBarTab = 'browse'
  return { action: 'Switched to Browse Tab' }
}

/** Reset the local state and reload, after a moment for the toast (Ctrl + R) */
export function resetLocalState(api, delay = 200) {
  setTimeout(() => api.resetLocalState(), delay)
  return { action: 'Resetting Local State' }
}

/** Connect to the database: known and consented (Ctrl + D) */
export function connectDatabase(api) {
  if (api.store.cookieState.knownUser) return { action: 'Already Connected to Database' }
  api.setKnown()
  api.setConsented()
  return { action: 'Connected to Database' }
}

/** Run the current view's autofill, if it has one (Ctrl + A) */
export function autofillView(api) {
  if (!api.hasAutofill()) return { action: 'No Autofill Available', type: 'error' }
  api.autofill()
  return { action: 'Autofilled Current View' }
}

/** Pin or unpin the current route (Ctrl + P) */
export function togglePinnedRoute(api) {
  const current = api.currentRouteName()
  if (api.store.dev.pinnedRoute === current) {
    api.store.dev.pinnedRoute = null
    return { action: 'Unpinned Route' }
  }
  api.store.dev.pinnedRoute = current
  return { action: 'Pinned Current Route' }
}

/** The next view in the timeline (↓) */
export function goNextView(api) {
  const next = api.nextView()
  if (!next) return { action: 'No Next View', type: 'error' }
  api.goToView(next.name, true)
  return { action: `Next: ${next.name}` }
}

/** The previous view in the timeline (↑) */
export function goPrevView(api) {
  const prev = api.prevView()
  if (!prev) return { action: 'No Previous View', type: 'error' }
  api.goToView(prev.name, true)
  return { action: `Back: ${prev.name}` }
}
