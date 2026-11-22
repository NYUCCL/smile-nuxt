/**
 * @module smilestore
 * @description Pinia store for managing global application state. Handles:
 * - User data and consent management
 * - Server-side data persistence via API routes
 * - Experiment condition randomization and routing
 * - Trial/step data recording and management
 * - Global UI state and dev tools
 * The store serves as the central state management system for the SMILE framework,
 * coordinating data flow between components, views, and external services.
 *
 * State is kept in the browser in two places (the app is client-rendered;
 * the server reads neither):
 * - cookieState: small flags (knownUser, consented, etc.) in cookies, written
 *   by the store-sync plugin.
 * - localState: larger values (viewSteppers, conditions, etc.), part of the
 *   one local snapshot in localStorage, together with the record (`data`) and
 *   the private data. restoreLocal() reads it when the page starts and
 *   captureSnapshot() writes it (core/sync/snapshot.js).
 *
 * The code that saves and loads the record is in core/sync/engine.js. The
 * actions that belong to it (loadData, sync, captureSnapshot, ...) each call
 * the engine function of the same name with the store. The initial values of
 * the state are in stores/initial-state.js.
 */
import { defineStore } from 'pinia'
import { useCookie } from '#imports'
import appconfig from '../core/config.js'
import useLog from './log.js'
import { toPlainJSON, addWarnings } from '../utils/plainJSON.js'
import * as engine from '../core/sync/engine.js'
import {
  COOKIE_MAX_AGE, snapshotKey, initDev, initCookieState, initLocalState, initBrowserEphemeral,
  freshLocalState, freshData, freshPrivate,
} from './initial-state.js'

/**
 * Returns the current local time as an ISO-like string in the user's timezone
 * @returns {string} Local time string (e.g., "2024-12-03T16:04:00.000-05:00")
 */
function getLocalTimeString() {
  const now = new Date()
  const offset = -now.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const pad = n => String(Math.abs(n)).padStart(2, '0')
  const offsetHours = pad(Math.floor(Math.abs(offset) / 60))
  const offsetMins = pad(Math.abs(offset) % 60)

  const year = now.getFullYear()
  const month = pad(now.getMonth() + 1)
  const day = pad(now.getDate())
  const hours = pad(now.getHours())
  const minutes = pad(now.getMinutes())
  const seconds = pad(now.getSeconds())
  const ms = String(now.getMilliseconds()).padStart(3, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}${sign}${offsetHours}:${offsetMins}`
}

// The initial values and the snapshot's key are defined in initial-state.js,
// and LOAD_RETRY_DELAYS in the sync engine; they are exported from here too
export { initCookieState, initLocalState, initDev, COOKIE_MAX_AGE, snapshotKey }
export { LOAD_RETRY_DELAYS } from '../core/sync/engine.js'

/**
 * @module smilestore
 * @description Main Pinia store for managing SMILE application state.
 *
 * The store is divided into several namespaces:
 * - cookieState: Tier 1 persisted state (cookies, SSR-accessible)
 * - localState: Tier 2 persisted state (localStorage, client-only)
 * - browserPersisted: Compatibility getter merging both tiers (read-only)
 * - browserEphemeral: Ephemeral state that resets on refresh
 * - dev: Development-only state and configuration
 * - private: Sensitive data (recruitment ids, the withdraw form), saved to the private_data table
 * - data: The participant's record, saved to the participants table
 * - config: Application configuration settings
 */
export default defineStore('smilestore', {
  state: () => {
    const prefix = `smile_${appconfig.codeName}_`

    // Tier 1: useCookie() for server-side read; client sync plugin handles writes
    const cookieState = {
      knownUser: useCookie(`${prefix}knownUser`, { default: () => false, maxAge: COOKIE_MAX_AGE }).value ?? false,
      lastRoute: useCookie(`${prefix}lastRoute`, { default: () => 'landing', maxAge: COOKIE_MAX_AGE }).value ?? 'landing',
      participantId: useCookie(`${prefix}participantId`, { default: () => null, maxAge: COOKIE_MAX_AGE }).value ?? null,
      completionCode: useCookie(`${prefix}completionCode`, { default: () => null, maxAge: COOKIE_MAX_AGE }).value ?? null,
      consented: useCookie(`${prefix}consented`, { default: () => false, maxAge: COOKIE_MAX_AGE }).value ?? false,
      withdrawn: useCookie(`${prefix}withdrawn`, { default: () => false, maxAge: COOKIE_MAX_AGE }).value ?? false,
      done: useCookie(`${prefix}done`, { default: () => false, maxAge: COOKIE_MAX_AGE }).value ?? false,
      seedID: useCookie(`${prefix}seedID`, { default: () => '', maxAge: COOKIE_MAX_AGE }).value ?? '',
      seedSet: useCookie(`${prefix}seedSet`, { default: () => false, maxAge: COOKIE_MAX_AGE }).value ?? false,
    }

    // Plain defaults; restoreLocal() fills them from the local snapshot
    const localState = freshLocalState()

    return {
      cookieState,
      localState,
      browserEphemeral: structuredClone(initBrowserEphemeral),
      dev: useCookie(`smile_${appconfig.codeName}_dev`, { default: () => ({ ...initDev }), maxAge: 86400 * 365 }).value ?? { ...initDev },
      private: freshPrivate(),
      data: freshData(),
      config: appconfig,
    }
  },

  getters: {
    // Compatibility getter: merges both tiers for read-only access
    browserPersisted: state => ({ ...state.localState, ...state.cookieState }),
    isKnownUser: state => state.cookieState.knownUser,
    isConsented: state => state.cookieState.consented,
    isWithdrawn: state => state.cookieState.withdrawn,
    isDone: state => state.cookieState.done,
    lastRoute: state => state.cookieState.lastRoute,
    isDataLoaded: state => state.browserEphemeral.dataLoaded,
    hasAutofill: state => state.dev?.viewProvidesAutofill,
    searchParams: state => state.dev?.searchParams,
    recruitmentService: state => state.data.recruitmentService,
    getSeedID: state => state.cookieState.seedID,
    getConditions: state => state.localState.conditions,
    getRandomizedRoutes: state => state.localState.randomizedRoutes,
    verifiedVisibility: state => state.data.verifiedVisibility,
    getShortId: (state) => {
      if (!state.cookieState.participantId || typeof state.cookieState.participantId !== 'string') return 'N/A'
      return `${state.cookieState.participantId.substring(0, 10)}`
    },
  },

  actions: {
    manualSyncLocalToData() {
      const log = useLog()
      log.debug('SMILESTORE: syncing conditions, randomized routes to remote')
      this.data.conditions = this.localState.conditions
      this.data.randomizedRoutes = this.localState.randomizedRoutes
      this.data.seedID = this.cookieState.seedID
    },

    setDataLoaded() {
      if (this.browserEphemeral.dataLoaded === false) {
        this.manualSyncLocalToData()
      }
      this.browserEphemeral.dataLoaded = true
    },

    setConsented() {
      this.cookieState.consented = true
      this.data.consented = true
      this.data.starttime = Date.now()
      this.data.starttimeLocal = getLocalTimeString()
      this.data.userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      this.data.userTimezoneOffset = new Date().getTimezoneOffset()
    },

    setWithdrawn(forminfo) {
      this.cookieState.withdrawn = true
      this.data.withdrawn = true
      this.private.withdrawData = forminfo
      this.data.endtime = Date.now()
      this.data.endtimeLocal = getLocalTimeString()
    },

    verifyVisibility(value) {
      this.localState.verifiedVisibility = value
      this.data.verifiedVisibility = value
    },

    setDone() {
      this.cookieState.done = true
      this.data.done = true
      this.data.endtime = Date.now()
      this.data.endtimeLocal = getLocalTimeString()
    },

    setCompletionCode(code) {
      this.cookieState.completionCode = code
    },

    resetApp() {
      this.localState.reset = true
    },

    setSeedID(seed) {
      if (seed === this.cookieState.seedID) {
        console.debug('SMILESTORE: seed already set to', seed)
        return
      }
      this.cookieState.seedID = seed
      this.data.seedID = seed
      this.cookieState.seedSet = true

      // After setting a seed we should clear out randomized settings
      this.localState.conditions = {}
      this.localState.randomizedRoutes = {}
      this.data.conditions = {}
      this.data.randomizedRoutes = {}
    },

    registerStepper(view, stepper = null) {
      this.localState.viewSteppers[view] = {}

      if (stepper) {
        if (!this.browserEphemeral.steppers) {
          this.browserEphemeral.steppers = {}
        }
        this.browserEphemeral.steppers[view] = stepper
        stepper.save(view)
      }
      return this.browserEphemeral.steppers?.[view]
    },

    getStepper(view) {
      return this.localState.viewSteppers[view]
    },

    resetStepper(view) {
      if (this.localState.viewSteppers[view]) {
        this.localState.viewSteppers[view] = {}
      }
    },

    /**
     * A plain-JSON copy of `value` for the record (plans/sync_engine.md). Never
     * throws. Anything changed on the way (a BigInt, a cycle, a DOM node...)
     * is logged and counted in `data.smileWarnings`.
     * @param {*} value - Anything experiment code passes in
     * @param {string} path - Where it will be stored, for the warnings
     * @returns {*} Plain JSON (undefined only for undefined, a function or a symbol)
     */
    cleanValue(value, path) {
      const warnings = []
      const cleaned = toPlainJSON(value, { path, warn: w => warnings.push(w) })
      if (warnings.length) {
        addWarnings(this.data, warnings)
        const log = useLog()
        for (const w of warnings.slice(0, 5)) log.warn(`SMILE: recorded value cleaned at ${w.path}: ${w.issue}`)
        if (warnings.length > 5) log.warn(`SMILE: ...and ${warnings.length - 5} more (see data.smileWarnings)`)
      }
      return cleaned
    },

    recordWindowEvent(type, event_data = null) {
      if (event_data) {
        const index = Array.isArray(this.data.browserData) ? this.data.browserData.length : 0
        this.data.browserData.push({
          event_type: type,
          timestamp: Date.now(),
          event_data: this.cleanValue(event_data, `browserData[${index}].event_data`) ?? null,
        })
      }
      else {
        this.data.browserData.push({
          event_type: type,
          timestamp: Date.now(),
        })
      }
    },

    getBrowserFingerprint() {
      let ip = 'unknown'
      const log = useLog()
      fetch('https://api.ipify.org/?format=json')
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.json()
        })
        .then((data) => {
          if (data.ip) {
            ip = data.ip
            log.success('SMILESTORE: User IP address detected (using api.ipify.org): ' + ip)
          }
        })
        .catch((error) => {
          log.log(error)
        })
        .finally(() => {
          if (typeof window !== 'undefined') {
            const { language } = window.navigator
            const { webdriver } = window.navigator
            const { userAgent } = window.navigator
            this.setFingerPrint(ip, userAgent, language, webdriver)
          }
        })
    },

    setFingerPrint(ip, userAgent, language, webdriver) {
      const log = useLog()
      this.private.browserFingerprint = {
        ip,
        userAgent,
        language,
        webdriver,
      }
      log.log('Browser fingerprint: ' + JSON.stringify(this.private.browserFingerprint))
    },

    setAutofill(fn) {
      if (this.dev) this.dev.viewProvidesAutofill = fn
    },

    removeAutofill() {
      if (this.dev) this.dev.viewProvidesAutofill = null
    },

    setRecruitmentService(service, info) {
      this.data.recruitmentService = service
      this.private.recruitmentInfo = info
      this.browserEphemeral.unsavedChanges = true
    },

    autofill() {
      if (this.dev?.viewProvidesAutofill) {
        this.dev.viewProvidesAutofill()
        const log = useLog()
        log.warn('DEV MODE: View was autofilled by a user-provided component function')
      }
    },

    recordData(data) {
      const index = this.data.studyData.length
      this.data.studyData.push(this.cleanValue(data, `studyData[${index}]`) ?? null)
      this.browserEphemeral.unsavedChanges = true
    },

    recordProperty(name, data) {
      this.data[name] = this.cleanValue(data, String(name)) ?? null
      this.browserEphemeral.unsavedChanges = true
    },

    setCondition(name, cond) {
      this.localState.conditions[name] = cond
      this.data.conditions[name] = cond
      this.browserEphemeral.unsavedChanges = true
    },

    setRandomizedRoute(name, route) {
      this.localState.randomizedRoutes[name] = route
      this.data.randomizedRoutes[name] = route
      this.browserEphemeral.unsavedChanges = true
    },

    async setKnown() {
      this.cookieState.knownUser = true
      this.data.seedID = this.cookieState.seedID
      const created = await this.createParticipant()
      if (created.status !== 200) {
        useLog().error('SMILESTORE: could not create participant record (it will be tried again): ' + created.message)
      }
      // The record in memory is this participant's from here on. If the
      // request failed, the sync loop creates the row with its first save.
      this.setDataLoaded()
      this.captureSnapshot()
      // The first save, with the private data (recruitment ids), goes now
      // rather than a second from now. Not waited for.
      this.sync()
    },

    /** See createParticipant() in core/sync/engine.js. */
    createParticipant() {
      return engine.createParticipant(this)
    },

    /** See sendSnapshot() in core/sync/engine.js. */
    sendSnapshot(body, options) {
      return engine.sendSnapshot(this, body, options)
    },

    /** See applyResume() in core/sync/engine.js. */
    applyResume(resume) {
      return engine.applyResume(this, resume)
    },

    /** See restoreLocal() in core/sync/engine.js. */
    restoreLocal() {
      return engine.restoreLocal(this)
    },

    /** See loadData() in core/sync/engine.js. */
    loadData() {
      return engine.loadData(this)
    },

    /** See continueAsNewRow() in core/sync/engine.js. */
    continueAsNewRow() {
      return engine.continueAsNewRow(this)
    },

    /** See resetOrphanedUser() in core/sync/engine.js. */
    resetOrphanedUser() {
      return engine.resetOrphanedUser(this)
    },

    setLastRoute(route) {
      this.cookieState.lastRoute = route
    },

    recordRoute(route) {
      const currentTime = Date.now()

      if (this.data.routeOrder.length > 0) {
        const lastIndex = this.data.routeOrder.length - 1
        const lastRoute = this.data.routeOrder[lastIndex]

        this.data.routeOrder[lastIndex] = {
          ...lastRoute,
          timeDelta: currentTime - lastRoute.timestamp,
        }
      }

      this.data.routeOrder.push({
        route,
        timestamp: currentTime,
        timeDelta: null,
      })
      this.browserEphemeral.unsavedChanges = true
    },

    /** See sync() in core/sync/engine.js. */
    sync() {
      return engine.sync(this)
    },

    /**
     * The older name for sync(). Saving no longer needs to be asked for.
     * @returns {Promise<{ ok: boolean, rev: number, error: string|null }>} As sync()
     */
    saveData() {
      return this.sync()
    },

    /** See captureSnapshot() in core/sync/engine.js. */
    captureSnapshot() {
      return engine.captureSnapshot(this)
    },

    /** See requestSnapshot() in core/sync/engine.js. */
    requestSnapshot() {
      return engine.requestSnapshot(this)
    },

    /** See pauseForOtherTab() in core/sync/engine.js. */
    pauseForOtherTab(reason) {
      return engine.pauseForOtherTab(this, reason)
    },

    /** See stopSnapshots() in core/sync/engine.js. */
    stopSnapshots() {
      return engine.stopSnapshots(this)
    },

    /** See clearLocalSnapshot() in core/sync/engine.js. */
    clearLocalSnapshot() {
      return engine.clearLocalSnapshot(this)
    },

    /** See saveOnClose() in core/sync/engine.js. */
    saveOnClose() {
      return engine.saveOnClose(this)
    },

    /** See networkChanged() in core/sync/engine.js. */
    networkChanged(online) {
      return engine.networkChanged(this, online)
    },

    /**
     * Clears all smile cookies by resetting cookieState to defaults
     */
    clearSmileCookies() {
      const defaults = { ...initCookieState }
      Object.keys(defaults).forEach((key) => {
        this.cookieState[key] = defaults[key]
      })
    },

    /**
     * Resets the local state to initial values and clears cookies
     */
    resetLocal() {
      this.clearSmileCookies()
      this.clearLocalSnapshot()
      this.$reset()
    },

    getConditionByName(name) {
      return this.localState.conditions[name]
    },

    getRandomizedRouteByName(name) {
      return this.localState.randomizedRoutes[name]
    },
  },
})
