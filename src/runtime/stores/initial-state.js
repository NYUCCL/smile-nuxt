/**
 * @module initial-state
 * @description The starting values of the smilestore's state, and the
 * localStorage key of the participant's snapshot. The store
 * (stores/smilestore.js) and the sync engine (core/sync/engine.js) both import
 * from here; this file imports neither of them.
 */
import appconfig from '../core/config.js'

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
  verifiedVisibility: false,
  reset: false,
  totalWrites: 0, // saves the server confirmed
  totalSends: 0, // saves sent, whatever the answer (the VITE_MAX_WRITES count)
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

/** A new participant's record, before anything is recorded */
const freshData = () => ({
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
})

/** A new participant's private data */
const freshPrivate = () => ({
  recruitmentInfo: {},
  withdrawData: {},
  browserFingerprint: {},
})

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
  // The sync loop's state (core/sync/loop.js): status is 'saved', 'pending',
  // 'saving', 'offline' or 'error'; error is the last one, or null
  sync: { status: 'saved', error: null, retryAt: null },
  // The last save sent, for the dev tools: the body's size as text and as
  // sent (gzipped when the browser can), how long the answer took, its status
  lastSend: null,
  // Another tab has the participant now ('newer-tab' or 'conflict'); this
  // one has stopped saving. False otherwise. See pauseForOtherTab().
  otherTab: false,
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

export {
  COOKIE_MAX_AGE, snapshotKey, initDev, initCookieState, initLocalState, initBrowserEphemeral,
  freshLocalState, freshData, freshPrivate,
}
