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
import { useCookie } from '#imports'
import axios from 'axios'
import appconfig from '../core/config.js'
import useLog from './log.js'

// Cookie max age: 30 days in seconds
const COOKIE_MAX_AGE = 86400 * 30

/**
 * Returns the current local time as an ISO-like string in the user's timezone
 * @returns {string} Local time string (e.g., "2024-12-03T16:04:00.000-05:00")
 */
function getLocalTimeString() {
  const now = new Date()
  const offset = -now.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const pad = (n) => String(Math.abs(n)).padStart(2, '0')
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
  docRef: null,
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
  privateDocRef: null,
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
  dbConnected: false,
  dbChanges: true,
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
export { initCookieState, initLocalState, initDev, COOKIE_MAX_AGE }

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
      docRef: useCookie(`${prefix}docRef`, { default: () => null, maxAge: COOKIE_MAX_AGE }).value ?? null,
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
      dev:
        appconfig.mode === 'development'
          ? useCookie(`smile_${appconfig.codeName}_dev`, { default: () => ({ ...initDev }), maxAge: 86400 * 365 }).value ?? { ...initDev }
          : { ...initDev },
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
    browserPersisted: (state) => ({ ...state.localState, ...state.cookieState }),
    isDataBarVisible: (state) => state.dev.showConsoleBar,
    isKnownUser: (state) => state.cookieState.knownUser,
    isConsented: (state) => state.cookieState.consented,
    isWithdrawn: (state) => state.cookieState.withdrawn,
    isDone: (state) => state.cookieState.done,
    lastRoute: (state) => state.cookieState.lastRoute,
    isDBConnected: (state) => state.browserEphemeral.dbConnected,
    hasAutofill: (state) => state.dev?.viewProvidesAutofill,
    searchParams: (state) => state.dev?.searchParams,
    recruitmentService: (state) => state.data.recruitmentService,
    isSeedSet: (state) => state.cookieState.seedSet,
    getSeedID: (state) => state.cookieState.seedID,
    getLocal: (state) => ({ ...state.localState, ...state.cookieState }),
    getConditions: (state) => state.localState.conditions,
    getRandomizedRoutes: (state) => state.localState.randomizedRoutes,
    verifiedVisibility: (state) => state.data.verifiedVisibility,
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
      if (!state.cookieState.docRef || typeof state.cookieState.docRef !== 'string') return 'N/A'
      return `${state.cookieState.docRef.substring(0, 10)}`
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

    setDBConnected() {
      if (this.browserEphemeral.dbConnected === false) {
        this.manualSyncLocalToData()
      }
      this.browserEphemeral.dbConnected = true
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
      } else {
        this.data.browserData.push({
          event_type: type,
          timestamp: Date.now(),
        })
      }
    },

    getBrowserFingerprint() {
      let ip = 'unknown'
      const log = useLog()
      axios
        .get('https://api.ipify.org/?format=json')
        .then((response) => {
          if (response.data.ip) {
            ip = response.data.ip
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
    },

    recordProperty(name, data) {
      this.data[name] = JSON.parse(JSON.stringify(data))
    },

    setCondition(name, cond) {
      this.localState.conditions[name] = cond
      this.data.conditions[name] = cond
    },

    setRandomizedRoute(name, route) {
      this.localState.randomizedRoutes[name] = route
      this.data.randomizedRoutes[name] = route
    },

    async setKnown() {
      const log = useLog()
      this.cookieState.knownUser = true
      this.data.seedID = this.cookieState.seedID
      try {
        const { id } = await $fetch('/api/participants', {
          method: 'POST',
          body: { data: this.data, projectRef: appconfig.projectRef },
        })
        this.cookieState.docRef = id
        const { id: privateId } = await $fetch(`/api/participants/${id}/private`, {
          method: 'POST',
          body: { data: this.private },
        })
        this.localState.privateDocRef = privateId
        this.setDBConnected()
      } catch (err) {
        log.error('SMILESTORE: could not create participant record: ' + err)
      }
    },

    async loadData() {
      if (this.cookieState.docRef) {
        try {
          const result = await $fetch(`/api/participants/${this.cookieState.docRef}`)
          if (result?.data) {
            this.data = result.data
            this.localState.approxDataSize = JSON.stringify(result.data).length
            this.setDBConnected()
          }
        } catch (err) {
          const log = useLog()
          log.error('SMILESTORE: could not load participant data: ' + err)
        }
      }
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
    },

    async saveData(force = false) {
      const log = useLog()
      if (this.isDBConnected) {
        if (!force && this.localState.totalWrites >= appconfig.maxWrites) {
          log.error(
            'SMILESTORE: max writes reached. Data NOT saved. Call saveData() less frequently.'
          )
          return
        }

        if (
          !force &&
          this.localState.lastWrite &&
          Date.now() - this.localState.lastWrite < appconfig.minWriteInterval
        ) {
          log.error(
            `SMILESTORE: write interval too short (${appconfig.minWriteInterval}ms). Data NOT saved.`
          )
          return
        }

        try {
          await $fetch(`/api/participants/${this.cookieState.docRef}`, {
            method: 'PATCH',
            body: { data: this.data },
          })
          if (this.localState.privateDocRef) {
            await $fetch(`/api/participants/${this.cookieState.docRef}/private`, {
              method: 'PATCH',
              body: { data: this.private },
            })
          }
          this.localState.approxDataSize = JSON.stringify(this.data).length
          this.localState.totalWrites += 1
          this.localState.lastWrite = Date.now()
          this.browserEphemeral.dbChanges = false
          log.success('SMILESTORE: saveData() successful (force = ' + force + ')')
        } catch (err) {
          log.error('SMILESTORE: error saving data: ' + err)
        }
      } else if (!this.data.consented && !this.cookieState.consented) {
        log.log('SMILESTORE: not saving because not consented')
      } else {
        log.error("SMILESTORE: can't save data, not connected to server")
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
