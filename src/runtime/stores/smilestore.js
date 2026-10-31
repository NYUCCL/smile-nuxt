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
 * State is split into two persistence tiers:
 * - cookieState: Small gate flags (knownUser, consented, etc.) persisted via cookies
 *   so they're available during SSR for hydration. Client-side sync plugin handles writes.
 * - localState: Larger/complex data (viewSteppers, routes, conditions, etc.) persisted
 *   via localStorage. Client-side sync plugin patches on load and watches for writes.
 */
import { defineStore } from 'pinia'
import { useCookie, navigateTo } from '#imports'
import appconfig from '../core/config.js'
import useLog from './log.js'

// Cookie max age: 30 days in seconds
const COOKIE_MAX_AGE = 86400 * 30

/**
 * localStorage key for the local backup of store.data (#42).
 *
 * store.data only reaches the database when saveData() runs (on navigation
 * between views, or explicitly). Without a local copy, anything recorded since
 * the last save (e.g. stepper trials) was lost on reload: loadData() replaced
 * it with the older DB copy. The backup is { participantId, rev, savedRev, data }:
 * every change to store.data bumps rev, a successful save records the rev it
 * sent as savedRev, and on load a backup with rev > savedRev (unsaved changes)
 * for the same participant wins over the DB copy and is saved immediately.
 */
const dataBackupKey = `${appconfig.localStorageKey}-data`

// Browsers cap the body of keepalive requests (the close-time save) at 64 KiB.
const KEEPALIVE_MAX_BYTES = 60_000

// A save deferred by minWriteInterval (at most one pending at a time).
let deferredSaveTimer = null

function readDataBackup() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(dataBackupKey)
    return raw ? JSON.parse(raw) : null
  }
  catch {
    return null
  }
}

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

const initDev = {
  viewProvidesAutofill: null,
  viewProvidesStepper: false,
  showConsoleBar: false,
  showSideBar: false,
  pinnedRoute: null,
  mainView: 'devmode',
  consoleBarHeight: 300,
  consoleBarTab: 'browse',
  sideBarTab: 'steps',
  searchParams: '',
  logFilter: 'All',
  notificationFilter: 'Errors only',
  lastViewLimit: false,
  dataPath: null,
  configPath: null,
  selectedDevice: 'desktop2',
  deviceWidth: 1024,
  deviceHeight: 768,
  isRotated: false,
  isFullscreen: false,
  routePanelVisible: false,
  globalColorMode: 'auto',
  experimentColorMode: 'auto',
}

/**
 * Tier 1: Cookie-backed state — small gate flags.
 * useCookie() in state() provides server-side read for SSR hydration.
 * Client-side store-sync plugin handles writing changes back to document.cookie.
 */
const initCookieState = {
  knownUser: false,
  lastRoute: 'landing',
  participantId: null,
  completionCode: null,
  consented: false,
  withdrawn: false,
  done: false,
  seedID: '',
  seedSet: false,
}

/**
 * Tier 2: localStorage-backed state — larger/complex data.
 * Plain defaults in state(). Client-side store-sync plugin patches from
 * localStorage on load and watches for changes to write back.
 */
const initLocalState = {
  privateDataId: null,
  verifiedVisibility: false,
  reset: false,
  totalWrites: 0,
  lastWrite: null,
  approxDataSize: 0,
  useSeed: true,
  viewSteppers: {},
  possibleConditions: {},
  seqtimeline: [],
  routes: [],
  conditions: {},
  randomizedRoutes: {},
}

const initBrowserEphemeral = {
  currentViewDone: false,
  forceNavigate: false,
  tooSmall: false,
  steppers: {},
  dataLoaded: false,
  unsavedChanges: true,
  // Revision counters for the local data backup (see dataBackupKey):
  // dataRev counts changes to store.data; savedRev is the last rev saved to the DB.
  dataRev: 0,
  savedRev: 0,
  urls: {
    prolific: '/welcome/prolific?PROLIFIC_PID=XXXX&STUDY_ID=XXXX&SESSION_ID=XXXXX',
    cloudresearch:
      '/welcome/cloudresearch?assignmentId=123RVWYBAZW00EXAMPLE456RVWYBAZW00EXAMPLE&hitId=123RVWYBAZW00EXAMPLE&turkSubmitTo=https://www.mturk.com/&workerId=AZ3456EXAMPLE',
    mturk:
      '/mturk?assignmentId=123RVWYBAZW00EXAMPLE456RVWYBAZW00EXAMPLE&hitId=123RVWYBAZW00EXAMPLE&turkSubmitTo=https://www.mturk.com/&workerId=AZ3456EXAMPLE',
    citizensci:
      '/welcome/citizensci?CITIZEN_ID=XXXXX&CITIZEN_STUDY_ID=123RVWYBAZW00EXAMPLE&CITIZEN_SESSION_ID=AZ3456EXAMPLE',
    sona: '/welcome/sona?survey_code=SONA_TEST_12345',
    sona_paid: '/welcome/sona_paid?survey_code=SONA_PAID_TEST_67890',
    spark: '/welcome/spark?subject_ID=SPARK_TEST_001&participant_ID=SPARK_PID_001&age=14&gender=female',
    panda: '/welcome/panda?ID=PANDA_TEST_001',
    web: '/welcome',
  },
}

// Export initial values so plugins can reference them
export { initCookieState, initLocalState, initDev, COOKIE_MAX_AGE, dataBackupKey }

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
 * - private: Sensitive user data not synced to database
 * - data: Public experiment data synced to database
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

    // Tier 2: plain defaults; client sync plugin patches from localStorage and writes back
    const localState = { ...initLocalState }

    return {
      cookieState,
      localState,
      browserEphemeral: { ...initBrowserEphemeral },
      dev: useCookie(`smile_${appconfig.codeName}_dev`, { default: () => ({ ...initDev }), maxAge: 86400 * 365 }).value ?? { ...initDev },
      private: {
        recruitmentInfo: {},
        withdrawData: {},
        browserFingerprint: {},
      },
      data: {
        appStartTime: Date.now(),
        seedID: '',
        trialNum: 0,
        consented: false,
        verifiedVisibility: false,
        done: false,
        starttime: null,
        endtime: null,
        starttimeLocal: null,
        endtimeLocal: null,
        userTimezone: null,
        userTimezoneOffset: null,
        recruitmentService: 'web',
        browserData: [],
        withdrawn: false,
        routeOrder: [],
        conditions: {},
        randomizedRoutes: {},
        smileConfig: { ...appconfig },
        studyData: [],
      },
      config: appconfig,
    }
  },

  getters: {
    // Compatibility getter: merges both tiers for read-only access
    browserPersisted: state => ({ ...state.localState, ...state.cookieState }),
    isDataBarVisible: state => state.dev.showConsoleBar,
    isKnownUser: state => state.cookieState.knownUser,
    isConsented: state => state.cookieState.consented,
    isWithdrawn: state => state.cookieState.withdrawn,
    isDone: state => state.cookieState.done,
    lastRoute: state => state.cookieState.lastRoute,
    isDataLoaded: state => state.browserEphemeral.dataLoaded,
    hasAutofill: state => state.dev?.viewProvidesAutofill,
    searchParams: state => state.dev?.searchParams,
    recruitmentService: state => state.data.recruitmentService,
    isSeedSet: state => state.cookieState.seedSet,
    getSeedID: state => state.cookieState.seedID,
    getLocal: state => ({ ...state.localState, ...state.cookieState }),
    getConditions: state => state.localState.conditions,
    getRandomizedRoutes: state => state.localState.randomizedRoutes,
    verifiedVisibility: state => state.data.verifiedVisibility,
    getAllPageData: (state) => {
      const pageDataFields = {}
      for (const key in state.data) {
        if (key.startsWith('pageData_')) {
          pageDataFields[key] = state.data[key]
        }
      }
      return pageDataFields
    },
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

    setSearchParams(searchParams) {
      this.dev.searchParams = searchParams
    },

    setConsented() {
      this.cookieState.consented = true
      this.data.consented = true
      this.data.starttime = Date.now()
      this.data.starttimeLocal = getLocalTimeString()
      this.data.userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      this.data.userTimezoneOffset = new Date().getTimezoneOffset()
    },

    setUnconsented() {
      this.cookieState.consented = false
      this.data.consented = false
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

    recordWindowEvent(type, event_data = null) {
      if (event_data) {
        this.data.browserData.push({
          event_type: type,
          timestamp: Date.now(),
          event_data,
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
      this.data.studyData.push(JSON.parse(JSON.stringify(data)))
      this.browserEphemeral.unsavedChanges = true
    },

    recordProperty(name, data) {
      this.data[name] = JSON.parse(JSON.stringify(data))
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
      const log = useLog()
      this.cookieState.knownUser = true
      this.data.seedID = this.cookieState.seedID
      try {
        const { id } = await $fetch('/api/participants', {
          method: 'POST',
          body: { data: this.data },
        })
        this.cookieState.participantId = id
        const { id: privateId } = await $fetch(`/api/participants/${id}/private`, {
          method: 'POST',
          body: { data: this.private },
        })
        this.localState.privateDataId = privateId
        this.setDataLoaded()
      }
      catch (err) {
        log.error('SMILESTORE: could not create participant record: ' + err)
      }
    },

    async loadData() {
      if (this.cookieState.participantId) {
        try {
          const result = await $fetch(`/api/participants/${this.cookieState.participantId}`)
          if (result?.data) {
            // Prefer the local backup if it holds changes the DB never got
            // (e.g. trials recorded before a reload). This browser is the only
            // writer for this participant, so an unsaved backup is newer (#42).
            const backup = readDataBackup()
            const restore = backup
              && backup.participantId === this.cookieState.participantId
              && backup.rev > backup.savedRev
              && backup.data
            if (restore) {
              useLog().warn(
                `SMILESTORE: restoring unsaved data from local backup (rev ${backup.rev}, last saved ${backup.savedRev})`,
              )
              this.browserEphemeral.dataRev = backup.rev
              this.browserEphemeral.savedRev = backup.savedRev
              this.data = backup.data
            }
            else {
              const rev = backup?.participantId === this.cookieState.participantId ? backup.rev : 0
              this.browserEphemeral.dataRev = rev
              this.browserEphemeral.savedRev = rev
              this.data = result.data
            }
            this.localState.approxDataSize = JSON.stringify(this.data).length
            this.setDataLoaded()
            this.writeDataBackup()
            if (restore) await this.saveData()
          }
          else {
            // Record exists but has no data — treat as orphaned
            this.resetOrphanedUser()
          }
        }
        catch (err) {
          if (err?.statusCode === 404 || err?.statusCode === 403) {
            // User in cookie but not in DB or token invalid — reset everything
            const log = useLog()
            log.warn('SMILESTORE: Participant not found or token invalid, resetting to new user')
            this.resetOrphanedUser()
          }
          else {
            const log = useLog()
            log.error('SMILESTORE: could not load participant data: ' + err)
          }
        }
      }
    },

    /**
     * Resets an orphaned user (cookie exists but DB record is missing).
     * Clears cookies and localStorage, then redirects to the welcome page.
     */
    resetOrphanedUser() {
      const log = useLog()
      log.warn('SMILESTORE: Orphaned user detected — clearing state and redirecting to welcome')

      // Reset cookie state to defaults
      this.clearSmileCookies()

      // Clear localStorage
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(appconfig.localStorageKey)
      }
      this.clearDataBackup()

      // Reset local state to defaults
      Object.assign(this.localState, { ...initLocalState })

      // Redirect to welcome
      navigateTo('/welcome')
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

    async saveData(force = false) {
      const log = useLog()
      if (this.isDataLoaded) {
        if (!force && this.localState.totalWrites >= appconfig.maxWrites) {
          log.error(
            'SMILESTORE: max writes reached. Data NOT saved. Call saveData() less frequently.',
          )
          return
        }

        if (
          !force
          && this.localState.lastWrite
          && Date.now() - this.localState.lastWrite < appconfig.minWriteInterval
        ) {
          // Too soon after the last write: save once the interval has passed
          // instead of dropping it. The data stays in memory (and the local
          // backup) meanwhile, and one pending save covers any number of calls.
          if (!deferredSaveTimer) {
            const wait = appconfig.minWriteInterval - (Date.now() - this.localState.lastWrite)
            log.log(`SMILESTORE: write interval too short, deferring save by ${wait}ms`)
            deferredSaveTimer = setTimeout(() => {
              deferredSaveTimer = null
              this.saveData()
            }, wait)
          }
          return
        }

        if (deferredSaveTimer) {
          clearTimeout(deferredSaveTimer) // this save covers the pending one
          deferredSaveTimer = null
        }

        // Changes made while the request is in flight stay unsaved (rev > sentRev).
        const sentRev = this.browserEphemeral.dataRev
        try {
          await $fetch(`/api/participants/${this.cookieState.participantId}`, {
            method: 'PATCH',
            body: { data: this.data },
          })
          this.browserEphemeral.savedRev = Math.max(this.browserEphemeral.savedRev, sentRev)
          this.writeDataBackup()
          if (this.localState.privateDataId) {
            await $fetch(`/api/participants/${this.cookieState.participantId}/private`, {
              method: 'PATCH',
              body: { data: this.private },
            })
          }
          this.localState.approxDataSize = JSON.stringify(this.data).length
          this.localState.totalWrites += 1
          this.localState.lastWrite = Date.now()
          this.browserEphemeral.unsavedChanges = this.browserEphemeral.dataRev > this.browserEphemeral.savedRev
          log.success('SMILESTORE: saveData() successful (force = ' + force + ')')
        }
        catch (err) {
          if (err?.statusCode === 403) {
            log.warn('SMILESTORE: Participant token invalid during save, resetting to new user')
            this.resetOrphanedUser()
          }
          else {
            log.error('SMILESTORE: error saving data: ' + err)
          }
        }
      }
      else if (!this.data.consented && !this.cookieState.consented) {
        log.log('SMILESTORE: not saving because not consented')
      }
      else {
        log.error('SMILESTORE: can\'t save data, not connected to server')
      }
    },

    /**
     * Called (by the store-sync plugin) whenever store.data changes.
     * An in-place change is a new, unsaved revision; a replaced object (from
     * loadData) is not. Either way the local backup is refreshed.
     * @param {object} opts
     * @param {boolean} opts.replaced - store.data was swapped for a new object
     */
    noteDataChanged({ replaced }) {
      if (!replaced) {
        this.browserEphemeral.dataRev += 1
        this.browserEphemeral.unsavedChanges = true
      }
      this.writeDataBackup()
    },

    /**
     * Writes store.data and its save state to the local backup (#42).
     * Only for a participant with a DB record; before consent there is
     * nothing to restore into.
     */
    writeDataBackup() {
      if (typeof localStorage === 'undefined' || !this.cookieState.participantId) return
      try {
        localStorage.setItem(dataBackupKey, JSON.stringify({
          participantId: this.cookieState.participantId,
          rev: this.browserEphemeral.dataRev,
          savedRev: this.browserEphemeral.savedRev,
          data: this.data,
        }))
      }
      catch (err) {
        // e.g. quota exceeded: the DB save path still works, only reload safety is lost
        useLog().warn('SMILESTORE: could not write local data backup: ' + err)
      }
    },

    /** Removes the local data backup (on reset or when the participant is cleared). */
    clearDataBackup() {
      if (typeof localStorage === 'undefined') return
      localStorage.removeItem(dataBackupKey)
    },

    /**
     * Best-effort save when the page is closing (pagehide). Uses a keepalive
     * request so it can outlive the page. Browsers cap keepalive bodies at
     * 64 KiB, so larger records are skipped; the local backup still restores
     * them if the participant comes back in this browser. Mobile browsers may
     * not fire pagehide at all, so this is never the only safeguard.
     */
    saveOnClose() {
      if (!this.isDataLoaded || !this.cookieState.participantId) return
      if (this.browserEphemeral.dataRev <= this.browserEphemeral.savedRev) return
      const body = JSON.stringify({ data: this.data })
      if (new TextEncoder().encode(body).length > KEEPALIVE_MAX_BYTES) return
      try {
        fetch(`/api/participants/${this.cookieState.participantId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        })
      }
      catch {
        // nothing to do: the page is going away
      }
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
      this.clearDataBackup()
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
