/**
 * @fileoverview Global navigation middleware for SMILE experiments.
 * Ported from src/core/router.js beforeEach + beforeResolve guards.
 *
 * In Nuxt with a catch-all route, all experiment URLs hit the same Vue Router
 * route (`/:slug(.*)*`). So we look up route metadata from $timeline.routes
 * instead of Vue Router's to.meta / from.meta.
 */
import seedrandom from 'seedrandom'
import { v4 as uuidv4 } from 'uuid'
import { defineNuxtRouteMiddleware, useNuxtApp, navigateTo, abortNavigation } from '#imports'
import useSmileStore from '../stores/smilestore'
import useLog from '../stores/log'
import { getQueryParams } from '../utils/utils'

/**
 * Core guard logic extracted for testability.
 * Returns the guard decision, then runs post-guard logic if navigation is allowed.
 *
 * @param {Object} to - Nuxt route location (to)
 * @param {Object} from - Nuxt route location (from)
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.timeline - Timeline instance ($timeline)
 * @param {Object} deps.store - SmileStore (Pinia)
 * @param {Object} deps.log - Log store
 * @param {Object} deps.api - API-like object with methods guards need
 * @returns {undefined|Object} undefined = allow, navigateTo() result = redirect
 */
export async function executeGuards(to, from, { timeline, store, log, api }) {
  const result = await _runGuards(to, from, { timeline, store, log, api })

  // If navigation is allowed (result is undefined), run post-guard logic
  if (result === undefined) {
    const toConfig = timeline.getViewForPath(to.path)
    const toName = toConfig?.name || to.name
    _postGuard({ timeline, store, log, api, toName })
  }

  return result
}

/**
 * Runs all 22 guards in order. Returns undefined to allow, or a navigateTo result to redirect.
 */
async function _runGuards(to, from, { timeline, store, log, api }) {
  // --- Helper: resolve a route name to its path for navigateTo ---
  // Falls back to welcome_anonymous if the name isn't a valid timeline route
  // (prevents infinite redirect when lastRoute is e.g. 'recruit' which isn't in the timeline)
  const welcomePath = timeline.getRouteByName('welcome_anonymous')?.path || '/welcome'
  function resolveNameToPath(name) {
    const r = timeline.getRouteByName(name)
    return r ? r.path : welcomePath
  }

  // Look up experiment route meta from timeline (not Vue Router meta)
  const toConfig = timeline.getViewForPath(to.path)
  const fromConfig = timeline.getViewForPath(from.path)
  const toMeta = toConfig?.meta || {}
  const fromMeta = fromConfig?.meta || {}
  const toName = toConfig?.name || to.name
  const fromName = fromConfig?.name || from.name

  // --- Guard 0: Unknown path (not in timeline at all) ---
  // Paths not registered in the timeline (e.g. /foo, /recruit) should redirect
  // to welcome for unknown users or lastRoute for known users.
  if (!toConfig) {
    log.warn('ROUTER GUARD: Path ' + to.path + ' is not in the timeline')
    if (store.isKnownUser) {
      const target = resolveNameToPath(store.lastRoute)
      if (target !== to.path) {
        return navigateTo(target, { replace: true })
      }
    }
    // Unknown user at unknown path → send to welcome
    if (to.path !== welcomePath) {
      return navigateTo(welcomePath, { replace: true })
    }
    return // allow (we're already at welcome)
  }

  // --- Guard 1: App reset check ---
  if (api.isResetApp()) {
    log.warn('ROUTER GUARD: Resetting app')
    api.resetLocalState()
  }

  // --- Guard 2: Set consented on leaving ---
  if (fromMeta.setConsented) {
    await api.completeConsent()
  }

  // --- Guard 3: Set done on leaving ---
  if (fromMeta.setDone) {
    api.setDone()
  }

  // --- Guard 4: Reset app flag on target ---
  if (toMeta.resetApp) {
    api.resetApp()
  }

  // --- Guard 5: Dev mode pinned route ---
  if (store.config.mode === 'development' && store.dev.pinnedRoute) {
    // If pinned route doesn't exist in timeline, clear it
    if (!timeline.getRouteByName(store.dev.pinnedRoute)) {
      store.dev.pinnedRoute = null
    } else {
      await api.connectDB()
      if (toName === store.dev.pinnedRoute) {
        return // allow
      } else {
        log.error('ROUTER GUARD: Pinned route, redirecting to ' + store.dev.pinnedRoute)
        return navigateTo(resolveNameToPath(store.dev.pinnedRoute), { replace: true })
      }
    }
  }

  // --- Guard 6: Query parameter merge ---
  const newQueries = {
    ...from.query,
    ...to.query,
    ...getQueryParams(),
  }
  to.query = newQueries

  // --- Guard 7: Load data for known user ---
  if (store.isKnownUser && !store.isDBConnected) {
    await store.loadData()
  }

  // --- Guard 8: Allow-always routes ---
  if (toMeta.allowAlways) {
    log.log(`ROUTER GUARD: Requested navigation (${toName}) is always allowed, so allowing it.`)
    store.setLastRoute(toName)
    store.recordRoute(toName)
    return // allow
  }

  // --- Guard 9: Withdraw route access ---
  if (toMeta.requiresWithdraw && store.isWithdrawn) {
    log.warn('ROUTER GUARD: Requested withdraw route and is withdrawn so allowing it')
    store.setLastRoute(toName)
    store.recordRoute(toName)
    return // allow
  }

  // --- Guard 10: User withdrawn block ---
  if (store.isWithdrawn) {
    log.warn('ROUTER GUARD: User has withdrawn, redirecting to withdraw page')
    return navigateTo(resolveNameToPath('withdraw'), { replace: true })
  }

  // --- Guard 11: Dev/presentation mode force navigate ---
  if (
    (store.config.mode === 'development' && store.browserEphemeral.forceNavigate) ||
    store.config.mode === 'presentation'
  ) {
    log.warn(
      'ROUTER GUARD: Allowing direct, out-of-order navigation to /' +
        toName +
        '.  This is allowed in development/presentation mode but not in production.'
    )
    store.setLastRoute(toName)
    store.recordRoute(toName)
    return // allow
  }

  // --- Guard 12: Force navigate flag ---
  if (store.browserEphemeral.forceNavigate) {
    log.warn(
      'ROUTER GUARD: Allowing direct, out-of-order navigation to /' +
        toName +
        '.  This is being forced by api.goToView().'
    )
    store.setLastRoute(toName)
    store.recordRoute(toName)
    return // allow
  }

  // --- Guard 13: Consent required ---
  if (toMeta.requiresConsent && !store.isConsented) {
    log.error(
      `ROUTER GUARD: This route (${toName}) requires consent, but the user has not consented (${store.isConsented}).` +
        ` Redirecting to the last route visited. (${store.lastRoute})`
    )
    return navigateTo(resolveNameToPath(store.lastRoute), { replace: true })
  }

  // --- Guard 14: Done required ---
  if (toMeta.requiresDone && !store.isDone) {
    log.error(
      `ROUTER GUARD: This route (${toName}) requires being marked as done, but the user is not done.` +
        ` Redirecting to the last route visited. (${store.lastRoute})`
    )
    return navigateTo(resolveNameToPath(store.lastRoute), { replace: true })
  }

  // --- Guard 15: Next route with currentViewDone=true ---
  if (fromMeta.next === toName && store.browserEphemeral.currentViewDone) {
    log.log(
      'ROUTER GUARD: You are trying to go to the next route from ' +
        fromName +
        ' to ' +
        toName +
        ' and the current page is done so allowing it.'
    )
    store.setLastRoute(toName)
    store.recordRoute(toName)
    return // allow
  }

  // --- Guard 16: Next route with currentViewDone=false ---
  if (fromMeta.next === toName && !store.browserEphemeral.currentViewDone) {
    log.error(
      'ROUTER GUARD: You are trying to go to the next route from ' +
        fromName +
        ' to ' +
        toName +
        ' but the current page is not marked as done, so returning you to the current page.'
    )
    return navigateTo(resolveNameToPath(store.lastRoute), { replace: true })
  }

  // --- Guard 17: Same route as lastRoute ---
  if (store.lastRoute === toName) {
    log.log(
      "ROUTER GUARD: You're trying to go to the same route as lastRoute (" +
        store.lastRoute +
        '), so allowing it.'
    )
    return // allow
  }

  // --- Guard 18: Known user not going to next route ---
  if (fromMeta.next !== toName && store.isKnownUser) {
    log.error(
      `ROUTER GUARD: You are known and trying to access a route (${toName}) which is not 'next' ` +
        `on the timeline.  Returning you to the last route you were on (${store.lastRoute}).`
    )
    return navigateTo(resolveNameToPath(store.lastRoute), { replace: true })
  }

  // --- Guard 19: Known user fallback ---
  if (store.isKnownUser) {
    log.error(
      "ROUTER GUARD: You are known and trying to access a route you can't see yet.  lastRoute: " +
        store.lastRoute
    )
    return navigateTo(resolveNameToPath(store.lastRoute), { replace: true })
  }

  // --- Guard 20: Unknown user at landing ---
  if (!store.isKnownUser && toName === 'landing') {
    log.error('ROUTER GUARD: Unknown user trying to go to landing page')
    return navigateTo(resolveNameToPath('welcome_anonymous'), { replace: true })
  }

  // --- Guard 21: Unknown user at non-welcome route ---
  if (toName !== 'welcome_anonymous') {
    log.error('ROUTER GUARD: Unknown user blocked trying to go to ' + toName)
    return navigateTo(resolveNameToPath(store.lastRoute), { replace: true })
  }

  // --- Guard 22: Default allow ---
  return // allow (fall through)
}

/**
 * Post-guard logic ported from router.beforeResolve.
 * Handles seed setup and view state reset.
 * Runs only when navigation is allowed (guard returned undefined).
 */
function _postGuard({ timeline, store, log, api, toName }) {
  api.removeAutofill()

  if (store.browserPersisted.useSeed) {
    const seedID = store.getSeedID
    const seed = `${seedID}-${toName}`
    seedrandom(seed, { global: true })
    log.log('ROUTER GUARD: Seed set to ' + seed)
  } else {
    api.randomSeed()
    log.log('ROUTER GUARD: Not using participant-specific seed; seed set randomly')
  }
  log.clearPageHistory()
  store.dev.viewProvidesStepper = false
  store.browserEphemeral.currentViewDone = false
  log.log('ROUTER GUARD: Router navigated to /' + toName)
}

export default defineNuxtRouteMiddleware(async (to, from) => {
  // Skip on server — timeline plugin is client-only
  if (import.meta.server) return

  const nuxtApp = useNuxtApp()
  const timeline = nuxtApp.$timeline
  if (!timeline) {
    console.warn('[SMILE middleware] $timeline not available yet, skipping guards')
    return
  }
  console.log(`[SMILE middleware] ${from.path} → ${to.path}`)

  // --- Dev/Presentation mode: prefix preservation + guard bypass ---
  // If FROM a prefixed route TO a non-prefixed route, redirect to preserve prefix.
  // This catches goNextView() navigations that use unprefixed paths like '/consent'.
  if (from.path.startsWith('/dev') && !to.path.startsWith('/dev')) {
    return navigateTo('/dev' + to.path, { replace: true })
  }
  if (from.path.startsWith('/presentation') && !to.path.startsWith('/presentation')) {
    return navigateTo('/presentation' + to.path, { replace: true })
  }
  // If TO a prefixed route, skip all experiment guards (free navigation in dev/presentation)
  if (to.path.startsWith('/dev') || to.path.startsWith('/presentation')) {
    return
  }

  const store = useSmileStore()
  const log = useLog()

  // Build a lightweight api-like object with the methods guards need.
  // We avoid calling useAPI() here because it pulls in useRoute()/useRouter()
  // which can cause issues in middleware context. Instead, proxy only the
  // methods actually used by the guards.
  const api = {
    isResetApp: () => store.browserPersisted.reset,
    resetLocalState: () => {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(store.config.localStorageKey)
      }
      store.resetLocal()
      if (typeof window !== 'undefined') {
        const url = window.location.href
        window.location.href = url.substring(0, url.lastIndexOf('#/'))
      }
    },
    completeConsent: async () => {
      store.setConsented()
      if (!store.browserPersisted.knownUser) {
        await store.setKnown()
      }
    },
    setDone: () => store.setDone(),
    resetApp: () => store.resetApp(),
    connectDB: async () => {
      if (!store.browserPersisted.knownUser) {
        await store.setKnown()
        store.setConsented()
      }
    },
    removeAutofill: () => {
      if (store.config.mode === 'development' || store.config.mode === 'presentation') {
        store.removeAutofill()
      }
    },
    randomSeed: () => {
      seedrandom(uuidv4(), { global: true })
    },
  }

  return executeGuards(to, from, { timeline, store, log, api })
})
