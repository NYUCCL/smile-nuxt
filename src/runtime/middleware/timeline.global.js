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
import { defineNuxtRouteMiddleware, useNuxtApp, navigateTo } from '#imports'
import useSmileStore from '../stores/smilestore'
import useLog from '../stores/log'
import { getQueryParams, processQuery, initService } from '../utils/utils'

/**
 * Core guard logic extracted for testability.
 * Returns the guard decision, then runs post-guard logic if navigation is allowed.
 *
 * @param {object} to - Nuxt route location (to)
 * @param {object} from - Nuxt route location (from)
 * @param {object} deps - Injected dependencies
 * @param {object} deps.timeline - Timeline instance ($timeline)
 * @param {object} deps.store - SmileStore (Pinia)
 * @param {object} deps.log - Log store
 * @param {object} deps.api - API-like object with methods guards need
 * @returns {undefined | object} undefined = allow, navigateTo() result = redirect
 */
export async function executeGuards(to, from, { timeline, store, log, api, skipBlockingGuards = false }) {
  const result = await _runGuards(to, from, { timeline, store, log, api, skipBlockingGuards })

  // If navigation is allowed (result is undefined), run post-guard logic
  if (result === undefined) {
    const toConfig = timeline.getViewForPath(to.path)
    const toName = toConfig?.name || to.name
    _postGuard({ timeline, store, log, api, toName, toPath: to.path })
  }

  return result
}

/**
 * Runs all 22 guards in order. Returns undefined to allow, or a navigateTo result to redirect.
 */
async function _runGuards(to, from, { timeline, store, log, api, skipBlockingGuards = false }) {
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
  // In dev/presentation mode, allow unknown paths (the dev page handles its own resolution).
  if (!toConfig) {
    if (skipBlockingGuards) {
      return // allow — dev/presentation pages handle their own route resolution
    }
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
  // Runs before skipBlockingGuards so pinning works in dev mode
  if (store.dev?.pinnedRoute) {
    // If pinned route doesn't exist in timeline, clear it
    if (!timeline.getRouteByName(store.dev.pinnedRoute)) {
      store.dev.pinnedRoute = null
    }
    else {
      await api.connectDB()
      if (toName === store.dev.pinnedRoute) {
        return // allow
      }
      else {
        log.error('ROUTER GUARD: Pinned route, redirecting to ' + store.dev.pinnedRoute)
        return navigateTo(resolveNameToPath(store.dev.pinnedRoute), { replace: true })
      }
    }
  }

  // In dev/presentation mode, skip blocking guards (free navigation)
  // but state-setting guards (1-4), pin guard (5), and _postGuard still run.
  if (skipBlockingGuards) {
    return // allow — postGuard runs via executeGuards
  }

  // --- Guard 6: Query parameter merge ---
  const newQueries = {
    ...from.query,
    ...to.query,
    ...getQueryParams(),
  }
  to.query = newQueries

  // --- Guard 7: Load data for known user ---
  if (store.isKnownUser && !store.isDataLoaded) {
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

  // --- Guard 11: Force navigate flag (dev builds) ---
  // In development builds, forceNavigate allows out-of-order navigation
  // (e.g., api.goToView() calls). Presentation/dev prefix routes already
  // skip blocking guards and never reach here.
  if (store.config.mode === 'development' && store.browserEphemeral.forceNavigate) {
    log.warn(
      'ROUTER GUARD: Allowing direct, out-of-order navigation to /'
      + toName
      + '.  This is allowed in development mode but not in production.',
    )
    store.setLastRoute(toName)
    store.recordRoute(toName)
    return // allow
  }

  // --- Guard 12: Force navigate flag ---
  if (store.browserEphemeral.forceNavigate) {
    log.warn(
      'ROUTER GUARD: Allowing direct, out-of-order navigation to /'
      + toName
      + '.  This is being forced by api.goToView().',
    )
    store.setLastRoute(toName)
    store.recordRoute(toName)
    return // allow
  }

  // --- Guard 13: Consent required ---
  if (toMeta.requiresConsent && !store.isConsented) {
    log.error(
      `ROUTER GUARD: This route (${toName}) requires consent, but the user has not consented (${store.isConsented}).`
      + ` Redirecting to the last route visited. (${store.lastRoute})`,
    )
    return navigateTo(resolveNameToPath(store.lastRoute), { replace: true })
  }

  // --- Guard 14: Done required ---
  if (toMeta.requiresDone && !store.isDone) {
    log.error(
      `ROUTER GUARD: This route (${toName}) requires being marked as done, but the user is not done.`
      + ` Redirecting to the last route visited. (${store.lastRoute})`,
    )
    return navigateTo(resolveNameToPath(store.lastRoute), { replace: true })
  }

  // --- Guard 15: Next route with currentViewDone=true ---
  if (fromMeta.next === toName && store.browserEphemeral.currentViewDone) {
    log.log(
      'ROUTER GUARD: You are trying to go to the next route from '
      + fromName
      + ' to '
      + toName
      + ' and the current page is done so allowing it.',
    )
    store.setLastRoute(toName)
    store.recordRoute(toName)
    return // allow
  }

  // --- Guard 16: Next route with currentViewDone=false ---
  if (fromMeta.next === toName && !store.browserEphemeral.currentViewDone) {
    log.error(
      'ROUTER GUARD: You are trying to go to the next route from '
      + fromName
      + ' to '
      + toName
      + ' but the current page is not marked as done, so returning you to the current page.',
    )
    return navigateTo(resolveNameToPath(store.lastRoute), { replace: true })
  }

  // --- Guard 17: Same route as lastRoute ---
  if (store.lastRoute === toName) {
    log.log(
      'ROUTER GUARD: You\'re trying to go to the same route as lastRoute ('
      + store.lastRoute
      + '), so allowing it.',
    )
    return // allow
  }

  // --- Guard 18: Known user not going to next route ---
  if (fromMeta.next !== toName && store.isKnownUser) {
    log.error(
      `ROUTER GUARD: You are known and trying to access a route (${toName}) which is not 'next' `
      + `on the timeline.  Returning you to the last route you were on (${store.lastRoute}).`,
    )
    return navigateTo(resolveNameToPath(store.lastRoute), { replace: true })
  }

  // --- Guard 19: Known user fallback ---
  if (store.isKnownUser) {
    log.error(
      'ROUTER GUARD: You are known and trying to access a route you can\'t see yet.  lastRoute: '
      + store.lastRoute,
    )
    return navigateTo(resolveNameToPath(store.lastRoute), { replace: true })
  }

  // --- Guard 20: Unknown user at landing ---
  if (!store.isKnownUser && toName === 'landing') {
    log.error('ROUTER GUARD: Unknown user trying to go to landing page')
    return navigateTo(resolveNameToPath('welcome_anonymous'), { replace: true })
  }

  // --- Guard 21: Unknown user at non-entry route ---
  // Allow unknown users to reach any route that doesn't require consent
  // (e.g., welcome pages). Block everything else.
  if (toMeta.requiresConsent !== false) {
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
// eslint-disable-next-line no-unused-vars
function _postGuard({ timeline: _timeline, store, log, api, toName, toPath }) {
  store.setLastRoute(toName)
  store.recordRoute(toName)

  // --- Recruitment service detection ---
  // Extract service name from /welcome/:service paths and call processQuery
  // to set the recruitment service and store participant info from URL params.
  const serviceMatch = toPath?.match(/\/welcome\/(\w+)/)
  if (serviceMatch) {
    const service = serviceMatch[1]
    if (initService(service)) {
      const query = getQueryParams()
      processQuery(query, service)
    }
  }
  api.removeAutofill()

  if (store.localState.useSeed) {
    const seedID = store.getSeedID
    const seed = `${seedID}-${toName}`
    seedrandom(seed, { global: true })
    log.log('ROUTER GUARD: Seed set to ' + seed)
  }
  else {
    api.randomSeed()
    log.log('ROUTER GUARD: Not using participant-specific seed; seed set randomly')
  }
  log.clearPageHistory()
  if (store.dev) store.dev.viewProvidesStepper = false
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
  // Skip guards for standalone pages that aren't part of the experiment timeline
  if (to.path === '/dev-login') {
    return
  }

  // Debug logging only in development mode
  if (import.meta.dev) {
    console.log(`[SMILE middleware] ${from.path} → ${to.path}`)
  }

  // --- Dev/Presentation mode: prefix preservation ---
  // If FROM a prefixed route TO a non-prefixed route, redirect to preserve prefix.
  // This catches goNextView() navigations that use unprefixed paths like '/consent'.
  const hasDevPrefix = p => p.startsWith('/dev/') || p === '/dev'
  const hasPresentationPrefix = p => p.startsWith('/presentation/') || p === '/presentation'

  if (hasDevPrefix(from.path) && !hasDevPrefix(to.path)) {
    return navigateTo('/dev' + to.path, { replace: true })
  }
  if (hasPresentationPrefix(from.path) && !hasPresentationPrefix(to.path)) {
    return navigateTo('/presentation' + to.path, { replace: true })
  }

  const isDevOrPresentation = hasDevPrefix(to.path) || hasPresentationPrefix(to.path)

  const store = useSmileStore()
  const log = useLog()

  // Build a lightweight api-like object with the methods guards need.
  // We avoid calling useAPI() here because it pulls in useRoute()/useRouter()
  // which can cause issues in middleware context. Instead, proxy only the
  // methods actually used by the guards.
  const api = {
    isResetApp: () => store.localState.reset,
    resetLocalState: () => {
      // Clear persistence then hard-navigate. Don't touch the store —
      // watchers would re-write defaults back to storage before navigation.
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(store.config.localStorageKey)
      }
      if (typeof document !== 'undefined') {
        const prefix = `smile_${store.config.codeName}_`
        const cookieKeys = ['knownUser', 'lastRoute', 'participantId', 'completionCode', 'consented', 'withdrawn', 'done', 'seedID', 'seedSet']
        cookieKeys.forEach((key) => {
          document.cookie = `${prefix}${key}=; path=/; max-age=0; SameSite=Lax`
        })
      }
      if (typeof window !== 'undefined') {
        const path = window.location.pathname
        let targetPath = '/'
        if (path.startsWith('/dev/') || path === '/dev') targetPath = '/dev/'
        else if (path.startsWith('/presentation/') || path === '/presentation') targetPath = '/presentation/'
        window.location.href = window.location.origin + targetPath
      }
    },
    completeConsent: async () => {
      store.setConsented()
      if (!store.cookieState.knownUser) {
        await store.setKnown()
      }
    },
    setDone: () => store.setDone(),
    resetApp: () => store.resetApp(),
    connectDB: async () => {
      if (!store.cookieState.knownUser) {
        await store.setKnown()
        store.setConsented()
      }
    },
    removeAutofill: () => {
      if (import.meta.dev) {
        store.removeAutofill()
      }
    },
    randomSeed: () => {
      seedrandom(uuidv4(), { global: true })
    },
  }

  // For dev/presentation routes: run state-setting guards and post-guard,
  // but skip blocking guards (free navigation in dev/presentation mode).
  // Strip the prefix so timeline route lookup works.
  if (isDevOrPresentation) {
    const stripPrefix = p => p.replace(/^\/(dev|presentation)(\/|$)/, '/') || '/'
    const strippedTo = { ...to, path: stripPrefix(to.path) }
    const strippedFrom = { ...from, path: stripPrefix(from.path) }
    return executeGuards(strippedTo, strippedFrom, { timeline, store, log, api, skipBlockingGuards: true })
  }

  return executeGuards(to, from, { timeline, store, log, api })
})
