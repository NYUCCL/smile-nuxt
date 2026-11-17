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
import { toPlainJSON, sendable, addWarnings } from '../utils/plainJSON.js'
import {
  readLocalCopy, chooseCopy, repairData, buildResume, resumeForServer,
  serializeParts, snapshotText, saveBodyText, legacyDataKey, isPlainObject,
  RESUME_KEYS, LOCAL_KEYS,
} from '../core/sync/snapshot.js'

// Cookie max age: 30 days in seconds
const COOKIE_MAX_AGE = 86400 * 30

/**
 * localStorage key of the participant's snapshot (core/sync/snapshot.js):
 * `{ v, participantId, rev, savedRev, local, data, resume }`, the record and
 * the position together in one value. Every change to either bumps `rev`
 * and rewrites the value; on load the copy with the higher `rev`, local or
 * server, is used.
 */
const snapshotKey = appconfig.localStorageKey

// Browsers cap the body of keepalive requests (the close-time save) at 64 KiB.
const KEEPALIVE_MAX_BYTES = 60_000

// A save deferred by minWriteInterval (at most one pending at a time).
let deferredSaveTimer = null

// The local snapshot is written a moment after a change, so that everything
// one event does (a keypress sets the step's data, records the trial and moves
// to the next step, in several separate microtasks) ends in one write. The
// wait is at least SNAPSHOT_MIN_DELAY ms and grows with what the last write
// cost, so that writing a large record takes at most about a tenth of the
// main thread's time. The page being hidden or closed, and every save to the
// server, write at once.
const SNAPSHOT_MIN_DELAY = 4
const SNAPSHOT_MAX_DELAY = 2000
const SNAPSHOT_COST_FACTOR = 10

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

// Waits (ms) before asking the server again when a load found no copy at all
export const LOAD_RETRY_DELAYS = [300, 900]

/**
 * Per store: the texts of the last snapshot captured, to tell whether
 * anything changed, and what was last written. Not reactive (the record's
 * text can be large).
 */
const captured = new WeakMap()

function captureState(store) {
  let state = captured.get(store)
  if (!state) {
    state = { dataText: null, resumeText: null, written: null, warnedCleaned: false, warnedWrite: false }
    captured.set(store, state)
  }
  return state
}

function browserStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  }
  catch {
    return null // storage blocked by the browser's settings
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
  docsPage: null, // the page open in Docs mode ('coding/steps.md')
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
  globalColorMode: 'auto', // the dev tools' own theme; 'auto' = follow the system
  devPalette: 'default', // the dev tools' palette (useDevPalette.js)
  experimentColorMode: null, // null = follow config.colorMode
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

/**
 * A new copy of the defaults. They hold objects (viewSteppers, conditions),
 * which must not be shared between a store and the one that replaces it
 * after a reset.
 */
const freshLocalState = () => structuredClone(initLocalState)

const initBrowserEphemeral = {
  currentViewDone: false,
  forceNavigate: false,
  tooSmall: false,
  steppers: {},
  dataLoaded: false,
  unsavedChanges: true,
  // The snapshot's counters (see snapshotKey): rev goes up with every change
  // to the record or the position; savedRev is the last rev the server has.
  rev: 0,
  savedRev: 0,
  // A known participant's load was tried and neither copy could be read
  loadFailed: false,
  // Why the last write of the local copy failed (null when it worked)
  localCopyError: null,
  urls: {
    prolific: '/welcome/prolific?PROLIFIC_PID=XXXX&STUDY_ID=XXXX&SESSION_ID=XXXXX',
    cloudresearch:
      '/welcome/cloudresearch?assignmentId=123RVWYBAZW00EXAMPLE456RVWYBAZW00EXAMPLE&hitId=123RVWYBAZW00EXAMPLE&workerId=AZ3456EXAMPLE',
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
export { initCookieState, initLocalState, initDev, COOKIE_MAX_AGE, snapshotKey }

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
    const localState = freshLocalState()

    return {
      cookieState,
      localState,
      browserEphemeral: structuredClone(initBrowserEphemeral),
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
      const log = useLog()
      this.cookieState.knownUser = true
      this.data.seedID = this.cookieState.seedID
      let id
      try {
        const created = await $fetch('/api/participants', {
          method: 'POST',
          body: { data: sendable(this.data) },
        })
        id = created.id
      }
      catch (err) {
        log.error('SMILESTORE: could not create participant record: ' + err)
        return
      }
      // The record exists from here on, whatever happens to the private one
      this.cookieState.participantId = id
      this.browserEphemeral.savedRev = 0
      this.setDataLoaded()
      this.captureSnapshot()
      try {
        const { id: privateId } = await $fetch(`/api/participants/${id}/private`, {
          method: 'POST',
          body: { data: sendable(this.private) },
        })
        this.localState.privateDataId = privateId
      }
      catch (err) {
        // The next save sends the private data again (the server creates the row)
        log.error('SMILESTORE: could not create private data record: ' + err)
      }
    },

    /**
     * Puts a stored `resume` into the store: the stepper states, conditions
     * and the other values a reload restores, and the current View.
     * @param {object} resume - As cleaned by core/sync/snapshot.js
     */
    applyResume(resume) {
      if (!isPlainObject(resume)) return
      for (const key of RESUME_KEYS) {
        if (Object.prototype.hasOwnProperty.call(resume, key)) this.localState[key] = resume[key]
      }
      // The cookie's View is a hint for server rendering; the snapshot's wins
      if (typeof resume.view === 'string' && resume.view) this.cookieState.lastRoute = resume.view
    },

    /**
     * Reads the local snapshot when the page starts (the store-sync plugin)
     * and restores the position from it. The record itself is restored by
     * loadData(), once the server's copy can be compared with it. A copy that
     * can't be read, or belongs to another participant, is skipped.
     */
    restoreLocal() {
      const storage = browserStorage()
      if (!storage) return
      const log = useLog()
      const local = readLocalCopy(storage, snapshotKey)
      for (const note of local.notes) log.warn('SMILESTORE: ' + note)
      if (local.format === 'none' || local.format === 'bad') return
      const participantId = this.cookieState.participantId || null
      if (local.resumeParticipantId !== undefined && local.resumeParticipantId !== participantId) {
        log.warn('SMILESTORE: the local copy belongs to another participant, starting without it')
        return
      }
      for (const key of LOCAL_KEYS) {
        if (Object.prototype.hasOwnProperty.call(local.local, key)) this.localState[key] = local.local[key]
      }
      if (local.resume) this.applyResume(local.resume)
      if (local.format === 'v1') {
        this.browserEphemeral.rev = local.rev
        this.browserEphemeral.savedRev = local.savedRev
      }
    },

    /**
     * Loads a known participant's record when the page starts: reads the
     * local copy and the server's, and uses the one with the higher `rev`,
     * record and position together (core/sync/snapshot.js, chooseCopy). A
     * copy that is missing or damaged is skipped. Never throws.
     */
    async loadData() {
      const participantId = this.cookieState.participantId
      if (!participantId) return
      const log = useLog()
      const storage = browserStorage()
      const hadFailed = this.browserEphemeral.loadFailed

      let choice
      for (let attempt = 0; ; attempt += 1) {
        let server
        try {
          const result = await $fetch(`/api/participants/${participantId}`)
          server = { ok: true, data: result?.data, rev: result?.rev, resume: result?.resume }
        }
        catch (err) {
          if (err?.statusCode === 404 || err?.statusCode === 403) {
            // User in cookie but not in DB or token invalid — reset everything
            log.warn('SMILESTORE: Participant not found or token invalid, resetting to new user')
            this.resetOrphanedUser()
            return
          }
          log.error('SMILESTORE: could not load participant data: ' + err)
          server = { ok: false }
        }
        const local = storage ? readLocalCopy(storage, snapshotKey) : { format: 'none', notes: [] }
        choice = chooseCopy({ participantId, local, server })
        // With no copy at all, try the server again before giving up
        if (choice.source !== 'none' || attempt >= LOAD_RETRY_DELAYS.length) break
        await new Promise(resolve => setTimeout(resolve, LOAD_RETRY_DELAYS[attempt]))
      }
      // The participant was reset, or loaded another way, while this waited
      if (this.cookieState.participantId !== participantId || this.browserEphemeral.dataLoaded) return

      for (const note of choice.notes) log.warn('SMILESTORE: ' + note)

      if (choice.source === 'none') {
        // Nothing to load from. The page goes on (the next navigation tries
        // again); the local copy keeps the position but not this record, so
        // it can never be taken for the participant's real one.
        this.browserEphemeral.loadFailed = true
        return
      }

      if (hadFailed && typeof window !== 'undefined') {
        // The page went on without the record after an earlier failure.
        // Start it again from the copy that has now been read, so the record
        // and the position on screen agree.
        log.warn('SMILESTORE: participant data loaded after an earlier failure, reloading the page')
        window.location.reload()
        return
      }

      if (choice.data) {
        const repaired = repairData(choice.data, this.data)
        for (const note of repaired.notes) log.warn('SMILESTORE: loaded record repaired: ' + note)
        this.data = repaired.data
      }
      if (choice.resume) this.applyResume(choice.resume)
      this.browserEphemeral.rev = choice.rev
      this.browserEphemeral.savedRev = choice.savedRev
      this.browserEphemeral.loadFailed = false
      if (choice.source === 'local' && choice.send) {
        log.warn(`SMILESTORE: using the local copy (rev ${choice.rev}); the server has rev ${choice.savedRev}`)
      }
      this.setDataLoaded()
      this.captureSnapshot()
      if (choice.send) await this.saveData()
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

      // Clear the local copy
      this.clearLocalSnapshot()

      // Reset local state to defaults
      Object.assign(this.localState, freshLocalState())
      this.browserEphemeral.rev = 0
      this.browserEphemeral.savedRev = 0
      this.browserEphemeral.loadFailed = false

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

        // The snapshot as it is now: its rev, and exactly the text that rev
        // names. Changes made while the request is in flight get a higher rev
        // and stay unsaved.
        const snap = this.captureSnapshot()
        if (!snap || !snap.includeData) {
          log.error('SMILESTORE: could not prepare the record for saving. Data NOT saved.')
          return
        }
        const sentRev = snap.rev
        const participantId = this.cookieState.participantId
        try {
          await $fetch(`/api/participants/${participantId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: saveBodyText({ rev: sentRev, dataText: snap.dataText, resumeText: snap.serverResumeText() }),
          })
          this.browserEphemeral.savedRev = Math.max(this.browserEphemeral.savedRev, sentRev)
          this.localState.totalWrites += 1
          this.localState.lastWrite = Date.now()
          this.captureSnapshot() // records savedRev in the local copy
          log.success('SMILESTORE: saveData() successful (force = ' + force + ')')
        }
        catch (err) {
          if (err?.statusCode === 403) {
            log.warn('SMILESTORE: Participant token invalid during save, resetting to new user')
            this.resetOrphanedUser()
          }
          else if (err?.statusCode === 409) {
            // Another copy of this participant (a second tab) saved something
            // newer. Handling it is step 5 of plans/sync_engine.md.
            log.error(`SMILESTORE: save refused, the server has a newer copy (rev ${err?.data?.data?.rev ?? '?'}, sent ${sentRev})`)
          }
          else {
            log.error('SMILESTORE: error saving data: ' + err)
          }
          return
        }
        try {
          // Always sent: the server creates the row if the first POST was lost
          await $fetch(`/api/participants/${participantId}/private`, {
            method: 'PATCH',
            body: { data: sendable(this.private) },
          })
        }
        catch (err) {
          log.error('SMILESTORE: error saving private data: ' + err)
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
     * Takes the snapshot as it is now and writes it to localStorage as one
     * value, now. Changes ask for it with requestSnapshot(), which waits a
     * moment so one event ends in one write; this is called directly when the
     * page is hidden or closing and before anything is sent.
     *
     * `rev` goes up by one when the record or the position differs from the
     * last snapshot taken, so calling this again without a change does
     * nothing. Never throws: a full or blocked localStorage is reported and
     * the copy in memory is still sent to the server.
     *
     * @returns {{ rev: number, includeData: boolean, dataText: string,
     *   resumeText: string, serverResumeText: Function }|null} The snapshot's
     *   texts, or null when nothing was taken
     */
    captureSnapshot() {
      if (typeof window === 'undefined') return null
      const state = captureState(this)
      if (state.stopped) return null
      if (state.timer) {
        clearTimeout(state.timer) // this write covers the one that was waiting
        state.timer = null
      }
      const started = now()
      const participantId = this.cookieState.participantId || null
      const loaded = this.browserEphemeral.dataLoaded
      // A known participant whose stored copy hasn't been read yet: writing
      // now would replace it with the empty record the page starts with.
      if (participantId && !loaded && !this.browserEphemeral.loadFailed) return null

      const log = useLog()
      // The record is part of the snapshot once it's the participant's own
      // (created, or loaded). Before that only the position is kept.
      const includeData = !!participantId && loaded
      const resume = buildResume(this.cookieState.lastRoute, this.localState)
      const parts = serializeParts(includeData ? this.data : null, resume)
      if (!parts.ok) {
        // Keep the last snapshot that worked
        if (!state.warnedFailed) {
          state.warnedFailed = true
          log.error('SMILESTORE: the record could not be turned into JSON; keeping the last snapshot that could')
        }
        return null
      }
      if (parts.cleaned && !state.warnedCleaned) {
        state.warnedCleaned = true
        log.warn('SMILESTORE: the record holds a value JSON can\'t store (written to api.data directly?); it is cleaned each time the record is saved')
      }

      if (parts.dataText !== state.dataText || parts.resumeText !== state.resumeText) {
        this.browserEphemeral.rev += 1
        state.dataText = parts.dataText
        state.resumeText = parts.resumeText
      }
      if (includeData) this.localState.approxDataSize = parts.dataText.length
      const rev = this.browserEphemeral.rev
      this.browserEphemeral.unsavedChanges = rev > this.browserEphemeral.savedRev

      const storage = browserStorage()
      if (storage) {
        const text = snapshotText({
          participantId,
          rev,
          savedRev: this.browserEphemeral.savedRev,
          local: this.localState,
          dataText: parts.dataText,
          resumeText: parts.resumeText,
        })
        if (text !== state.written) {
          try {
            storage.setItem(snapshotKey, text)
            state.written = text
            state.warnedWrite = false
            if (this.browserEphemeral.localCopyError) this.browserEphemeral.localCopyError = null
            if (!state.legacyRemoved) {
              state.legacyRemoved = true
              storage.removeItem(legacyDataKey(snapshotKey)) // the old data backup
            }
          }
          catch (err) {
            // e.g. quota exceeded: saving to the server still works, only reload safety is lost
            state.written = null
            this.browserEphemeral.localCopyError = String(err)
            if (!state.warnedWrite) {
              state.warnedWrite = true
              log.warn('SMILESTORE: could not write the local copy: ' + err)
            }
          }
        }
      }

      state.cost = now() - started
      return {
        rev,
        includeData,
        dataText: parts.dataText,
        resumeText: parts.resumeText,
        serverResumeText: () => serializeParts(null, resumeForServer(resume)).resumeText,
      }
    },

    /**
     * Asks for the snapshot to be written soon: once, a few milliseconds
     * after the first of a run of changes (longer when writing is slow; see
     * SNAPSHOT_MIN_DELAY). Called by the store-sync plugin's watcher on
     * every change to the record or the position, and by the stepper each
     * time it saves its state, which is once per assignment to step data.
     * captureSnapshot() writes at once and cancels the wait.
     */
    requestSnapshot() {
      if (typeof window === 'undefined') return
      const state = captureState(this)
      if (state.timer || state.stopped) return
      const delay = Math.min(SNAPSHOT_MAX_DELAY, Math.max(SNAPSHOT_MIN_DELAY, (state.cost || 0) * SNAPSHOT_COST_FACTOR))
      state.timer = setTimeout(() => {
        state.timer = null
        try {
          this.captureSnapshot()
        }
        catch (err) {
          useLog().warn('SMILESTORE: could not write the local copy: ' + err)
        }
      }, delay)
    },

    /**
     * Stops writing the snapshot, for good. Called just before the stored
     * state is removed and the page reloaded (a reset), so that the write
     * made as the page closes doesn't put the old state back.
     */
    stopSnapshots() {
      const state = captureState(this)
      state.stopped = true
      if (state.timer) clearTimeout(state.timer)
      state.timer = null
    },

    /** Removes the local snapshot (on reset or when the participant is cleared). */
    clearLocalSnapshot() {
      const state = captured.get(this)
      if (state?.timer) clearTimeout(state.timer)
      captured.delete(this)
      const storage = browserStorage()
      if (!storage) return
      try {
        storage.removeItem(snapshotKey)
        storage.removeItem(legacyDataKey(snapshotKey))
      }
      catch {
        // nothing more to do
      }
    },

    /**
     * Best-effort save when the page is closing (pagehide). Uses a keepalive
     * request so it can outlive the page. Browsers cap keepalive bodies at
     * 64 KiB, so larger records are skipped; the local snapshot still has
     * them if the participant comes back in this browser. Mobile browsers may
     * not fire pagehide at all, so this is never the only safeguard.
     */
    saveOnClose() {
      const snap = this.captureSnapshot()
      if (!this.isDataLoaded || !this.cookieState.participantId) return
      if (!snap || !snap.includeData) return
      if (snap.rev <= this.browserEphemeral.savedRev) return
      const body = saveBodyText({ rev: snap.rev, dataText: snap.dataText, resumeText: snap.serverResumeText() })
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
