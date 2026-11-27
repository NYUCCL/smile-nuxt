/**
 * @module useAPI
 * @description Creates and returns a reactive SmileAPI instance that provides core functionality for SMILE experiments.
 * Combines access to:
 * - Store management (Pinia store)
 * - Logging capabilities
 * - Routing and navigation
 * - Timeline management
 * - Randomization utilities
 *
 * This composable serves as the main entry point for components to interact with the SMILE framework's
 * core functionality. It initializes all required dependencies and returns a reactive API object
 * that maintains reactivity when used in components.
 *
 * @returns {object} A reactive SmileAPI instance with all core framework capabilities
 */

import { reactive } from 'vue'
import { useRoute, useRouter, useRuntimeConfig, useNuxtApp } from '#imports'
import useSmileStore from '../stores/smilestore'
import * as participant from '../core/participant-actions.js'
import useLog from '../stores/log'
import useTimeline from './useTimeline'
import usePreload from './usePreload'
import { sha256Base64 } from '../utils/sha256.js'
import { stableStringify } from '../utils/stableStringify.js'
import {
  randomInt,
  shuffle,
  sampleWithReplacement,
  sampleWithoutReplacement,
  fakerDistributions,
} from '../utils/randomization'

/**
 * SmileAPI class provides core functionality for SMILE experiments
 * @class
 * @description Main API class that provides access to store data, logging, routing, timeline management,
 * and other core functionality needed for running SMILE experiments. It serves as the primary interface
 * between experiment components and the underlying application infrastructure.
 *
 * @property {object} store - Smile store instance containing application state
 * @property {object} logStore - Logging store for application logging
 * @property {object} route - Vue Router route object for current route
 * @property {object} router - Vue Router instance for navigation
 * @property {object} timeline - Timeline instance for managing view sequence
 * @property {object} config - The store's configuration (read from the store on each access)
 * @property {object} data - The participant's data in the store (read on each access)
 * @property {object} private - The participant's private data in the store (read on each access)
 * @property {object} all_data - `{ private, data }`: the private and the public data
 * @property {object} all_config - `{ browserPersisted, dev, code, config }`: the persisted browser state
 *   (cookie and local state merged), the dev tools' state, the git information (`config.github`) and the configuration
 * @property {object} urls - The store's `browserEphemeral.urls`
 * @property {object} log - Logging methods interface
 */
// Files api.asset() already warned about (dev server only)
const notPreloaded = new Set()

// Space WindowSizerView leaves around its box (classes m-2 mt-5), in px.
const WINDOWSIZER_MARGIN_X = 16 // 8 left + 8 right
const WINDOWSIZER_MARGIN_Y = 28 // 20 top + 8 bottom

export class SmileAPI {
  /**
   * Creates a new SmileAPI instance
   * @param {object} store - The Smile store instance containing application state
   * @param {object} logStore - The logging store for application logging
   * @param {object} route - Vue Router route object for current route
   * @param {object} router - Vue Router instance for navigation
   * @param {object} timeline - Timeline instance for managing view sequence
   * @param {object} runtimeConfig - Nuxt runtime config object
   */
  constructor(store, logStore, route, router, timeline, runtimeConfig) {
    this.store = store
    this.logStore = logStore
    this.route = route
    this.router = router
    this.timeline = timeline
    this.runtimeConfig = runtimeConfig
  }

  // Store data access. These are getters, not copies made in the constructor:
  // the store replaces `data` and `private` with new objects (loadData), and
  // an API object that outlives that (the one given to design.js, the
  // useViewAPI() instance) must read the current ones.

  /** @returns {object} The store's configuration */
  get config() {
    return this.store.config
  }

  /** @returns {object} The participant's data */
  get data() {
    return this.store.data
  }

  /** @returns {object} The participant's private data */
  get private() {
    return this.store.private
  }

  /** @returns {{ private: object, data: object }} The private and the public data */
  get all_data() {
    return { private: this.store.private, data: this.store.data }
  }

  /** @returns {{ browserPersisted: object, dev: object, code: object, config: object }} The state and configuration the dev tools list */
  get all_config() {
    return {
      browserPersisted: this.store.browserPersisted, // read-only merge of the local and the cookie state
      dev: this.store.dev,
      code: this.store.config.github,
      config: this.store.config,
    }
  }

  /** @returns {object} The store's `browserEphemeral.urls` */
  get urls() {
    return this.store.browserEphemeral.urls
  }

  // Logging methods
  /**
   * Logging methods for the application
   * @property {object} log - Object containing logging methods
   * @property {Function} log.debug - Log debug level messages
   * @property {Function} log.log - Log standard messages
   * @property {Function} log.warn - Log warning messages
   * @property {Function} log.error - Log error messages
   * @property {Function} log.success - Log success messages
   * @property {Function} log.clearPageHistory - Clear the page history log
   * @property {Function} log.addToHistory - Add an entry to the page history log
   */
  log = {
    debug: (...args) => this.logStore.debug(...args),
    log: (...args) => this.logStore.log(...args),
    warn: (...args) => this.logStore.warn(...args),
    error: (...args) => this.logStore.error(...args),
    success: (...args) => this.logStore.success(...args),
    clearPageHistory: () => this.logStore.clearPageHistory(),
    addToHistory: (...args) => this.logStore.addToHistory(...args),
  }

  // Router related methods
  /**
   * Navigate to the next view in the timeline sequence
   * @param {boolean} [resetScroll] - Whether to reset scroll position to top after navigation
   * @returns {void}
   * @memberof SmileAPI
   * @instance
   */
  goNextView = (resetScroll = true) => {
    this.timeline.goNextView(() => {
      if (resetScroll) {
        this.scrollToTop()
      }
    })
  }

  /**
   * Navigate to the previous view in the timeline sequence
   * @param {boolean} [resetScroll] - Whether to reset scroll position to top after navigation
   * @returns {void}
   * @memberof SmileAPI
   * @instance
   */
  goPrevView = (resetScroll = true) => {
    this.timeline.goPrevView(() => {
      if (resetScroll) {
        this.scrollToTop()
      }
    })
  }

  /**
   * Navigate to a specific view in the application
   * @param {string} view - The name of the view to navigate to
   * @param {boolean} [force] - Whether to force navigation by temporarily disabling navigation guards
   * @param {boolean} [resetScroll] - Whether to reset scroll position to top after navigation
   * @returns {Promise<void>}
   * @memberof SmileAPI
   * @instance
   */
  goToView = async (view, force = true, resetScroll = true) => {
    // Use the useTimeline composable's goToView which resolves name→path
    await this.timeline.goToView(view, force)
    if (resetScroll) {
      this.scrollToTop()
    }
  }

  /**
   * Check if there is a next view available in the sequential navigation
   * @returns {boolean} True if there is a next view and sequential navigation is enabled
   */
  hasNextView = () => {
    const nv = this.timeline.nextView()
    return !!nv
  }

  /**
   * Check if there is a previous view available in the sequential navigation
   * @returns {boolean} True if there is a previous view and sequential navigation is enabled
   */
  hasPrevView = () => {
    const pv = this.timeline.prevView()
    return !!pv
  }

  /**
   * Get the next view in the navigation sequence
   * @returns {object | null} Route object with name and query params, or null if no next view
   */
  nextView = () => this.timeline.nextView()

  /**
   * Get the previous view in the navigation sequence
   * @returns {object | null} Route object with name and query params, or null if no previous view
   */
  prevView = () => this.timeline.prevView()

  /**
   * Scrolls the main content container to the top
   * @returns {void}
   */
  scrollToTop() {
    if (typeof document === 'undefined') return
    const mainContent = document.querySelector('.device-container')
    if (mainContent) {
      mainContent.scrollTop = 0
    }
  }

  // Randomization utilities
  /**
   * Collection of faker distributions for generating random data
   * @type {object} fakerDistributions
   */
  faker = fakerDistributions

  /**
   * Generate a random integer between min and max (inclusive)
   * @param {number} min - The minimum value
   * @param {number} max - The maximum value
   * @returns {number} A random integer between min and max
   */
  randomInt = randomInt

  /**
   * Randomly reorder elements in an array
   * @param {Array} array - The array to shuffle
   * @returns {Array} A new array with elements in random order
   */
  shuffle = shuffle

  /**
   * Sample elements from an array with replacement
   * @param {Array} array - The array to sample from
   * @param {number} n - Number of elements to sample
   * @returns {Array} Array of n randomly sampled elements
   */
  sampleWithReplacement = sampleWithReplacement

  /**
   * Sample elements from an array without replacement
   * @param {Array} array - The array to sample from
   * @param {number} n - Number of elements to sample
   * @returns {Array} Array of n unique randomly sampled elements
   */
  sampleWithoutReplacement = sampleWithoutReplacement

  // URL helpers

  /**
   * Get the URL for an asset in the consumer app's public/ directory.
   * @param {string} name - Relative path (no leading slash), e.g. 'stimuli/dog.png'
   * @returns {string} URL under the app's base URL (`app.baseURL`), e.g. '/stimuli/dog.png'
   */
  getPublicUrl = name => participant.withBase(this.runtimeConfig?.app?.baseURL, name)

  /**
   * Get the URL for an asset shipped by the @nyuccl/smile-nuxt module itself
   * (e.g. the SMILE logo). Module assets are served at /_smile/* via
   * nitro.publicAssets — see src/module.ts.
   * @param {string} name - Relative path under the module's public dir,
   *   e.g. 'images/smile.svg'
   * @returns {string} URL under the app's base URL (`app.baseURL`), e.g. '/_smile/images/smile.svg'
   */
  getCoreStaticUrl = name => participant.withBase(this.runtimeConfig?.app?.baseURL, '_smile/' + String(name).replace(/^\/+/, ''))

  /**
   * Alias for getPublicUrl — kept for compatibility with experiments that
   * use it to reference stimuli in their public/ directory.
   * @param {string} name - Relative path
   * @returns {string} Absolute URL
   */
  getStaticUrl = name => this.getPublicUrl(name)

  /**
   * Reset the entire application state
   * @returns {void}
   */
  resetApp = () => this.store.resetApp()

  /**
   * Check if the application is in reset state
   * @returns {boolean} True if app is reset, false otherwise
   */
  isResetApp = () => this.store.localState.reset

  /**
   * Reset just the store state
   * @returns {void}
   */
  resetStore = () => this.store.resetLocal()

  /**
   * Removes everything the browser stores for this participant (the local
   * snapshot and the cookies), then loads the app's first page.
   * @returns {void}
   */
  resetLocalState() {
    participant.resetLocalState(this.store, this.runtimeConfig?.app?.baseURL)
  }

  /**
   * Reloads the current browser window/page
   * Forces a fresh reload of the current page by calling window.location.reload()
   * @returns {void}
   */
  reloadBrowser() {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  // App component management
  /**
   * Set a global app component that can be accessed throughout the application
   * @param {string} key - The key/identifier for the component
   * @param {object} value - The component to store globally
   * @returns {void}
   */
  setAppComponent(key, value) {
    if (!this.store.config.global_app_components) {
      this.store.config.global_app_components = {}
    }
    this.store.config.global_app_components[key] = value
  }

  /**
   * Get a global app component by its key identifier
   * @param {string} key - The key/identifier of the component to retrieve
   * @returns {object | undefined} The component if found, undefined otherwise
   */
  getAppComponent(key) {
    if (!this.store.config.global_app_components || !(key in this.store.config.global_app_components)) {
      this.logStore.error('SMILE API: getAppComponent() key not found:', key)
      return undefined
    }
    return this.store.config.global_app_components[key]
  }

  // Config management
  /**
   * Sets a runtime configuration value. If the key exists in the main config,
   * updates it there. Otherwise stores it in the runtime config object.
   * Also updates the smileConfig in store data without global components.
   * @param {string} key - The configuration key to set
   * @param {*} value - The value to set for the configuration key
   * @returns {void}
   */
  setRuntimeConfig(key, value) {
    if (key in this.store.config) {
      this.store.config[key] = value
    }
    else {
      if (!this.store.config.runtime) {
        this.store.config.runtime = {}
      }
      this.store.config.runtime[key] = value
    }
    // eslint-disable-next-line no-unused-vars
    const { global_app_components: _gac, ...configWithoutComponents } = this.store.config
    this.store.data.smileConfig = configWithoutComponents
  }

  /**
   * Gets a configuration value by key, checking both main config and runtime config
   * @param {string} key - The configuration key to retrieve
   * @returns {*|null} The configuration value if found, null otherwise
   */
  getConfig(key) {
    if (key in this.store.config) {
      return this.store.config[key]
    }
    else if (this.store.config.runtime && key in this.store.config.runtime) {
      return this.store.config.runtime[key]
    }
    else {
      this.logStore.error('SMILE API: getConfig() key not found', key)
      return null
    }
  }

  // User state management
  /**
   * Sets the user as known in the store. This is typically called when a user first visits the site.
   * @returns {Promise<void>} A promise that resolves when the known status is set
   */
  async setKnown() {
    return await this.store.setKnown()
  }

  /**
   * Marks the current task/experiment as completed in the store
   * @returns {void}
   */
  setDone() {
    this.store.setDone()
  }

  /**
   * Records that the user has provided consent in the store
   * @returns {void}
   */
  setConsented() {
    this.store.setConsented()
  }

  /**
   * Ensures the user is known and consented, creating a server-side record if needed.
   * @returns {Promise<void>}
   */
  async connectDB() {
    await participant.connectDB(this.store)
  }

  /**
   * Records that the user has withdrawn from the study and stores their withdrawal form info
   * @param {object} forminfo - The withdrawal form information provided by the user
   * @returns {void}
   */
  setWithdrawn(forminfo) {
    this.store.setWithdrawn(forminfo)
  }

  /**
   * Sets whether the browser window visibility has been verified
   * @param {boolean} value - True if visibility is verified, false otherwise
   * @returns {void}
   */
  verifyVisibility(value) {
    this.store.verifyVisibility(value)
  }

  /**
   * Records a form submission in the store
   * @deprecated Use recordPageData() instead. This method will be removed in a future version.
   * @param {string} name - The name/identifier of the form
   * @param {*} data - The form data to store
   * @returns {void}
   */
  recordForm(name, data) {
    this.logStore.warn('SMILE API: recordForm() is deprecated. Use recordPageData() instead.')
    this.store.recordProperty(name, data) // Keep for backward compat
    this.recordPageData(data) // Also record to new format
  }

  /**
   * Records a named property in the store
   * @param {string} name - The name of the property
   * @param {*} data - The property value to store
   * @returns {void}
   */
  recordProperty(name, data) {
    this.store.recordProperty(name, data)
  }

  /**
   * Records data associated with a specific page/route.
   * Data is organized by visit number using visit_N keys (visit_0, visit_1, etc.).
   * Multiple calls within the same visit append to that visit's timestamps and data arrays.
   *
   * Any value can be recorded. Values plain JSON can't hold (a BigInt, a
   * circular reference, a DOM node, NaN...) are cleaned before they're stored,
   * never refused, and each change is noted in `data.smileWarnings`.
   *
   * @param {*} data - The data to record for this page (usually an object)
   * @param {string} [routeName] - Optional route name override. Uses current route if not provided
   * @returns {boolean} True if data was recorded, false if there is no route to record it under
   *
   * @example
   * // Record data for current page (uses current route name)
   * api.recordPageData({ response: 'yes', rt: 1234 })
   *
   * // Record data with explicit route name
   * api.recordPageData({ response: 'no' }, 'custom_page')
   *
   * // Data structure after multiple visits:
   * // pageData_trial: {
   * //   visit_0: { timestamps: [...], data: [...] },
   * //   visit_1: { timestamps: [...], data: [...] }
   * // }
   */
  recordPageData(data, routeName = null) {
    const pageName = routeName || this.currentRouteName()
    if (!pageName) {
      this.logStore.error('SMILE API: recordPageData() - No route name available')
      return false
    }

    const fieldName = `pageData_${pageName}`

    // Calculate current visit index from routeOrder
    const visitCount = this.store.data.routeOrder
      ? this.store.data.routeOrder.filter(entry => entry.route === pageName).length
      : 0
    const currentVisitIndex = Math.max(0, visitCount - 1) // -1 because current visit is already in routeOrder
    const visitKey = `visit_${currentVisitIndex}`

    // Initialize pageData field if it doesn't exist
    if (!this.store.data[fieldName]) {
      this.store.data[fieldName] = {}
    }

    // Initialize visit structure if it doesn't exist
    if (!this.store.data[fieldName][visitKey]) {
      this.store.data[fieldName][visitKey] = {
        timestamps: [],
        data: [],
      }
    }

    // Append timestamp and data to the current visit
    this.store.data[fieldName][visitKey].timestamps.push(Date.now())
    const visit = this.store.data[fieldName][visitKey]
    const cleaned = this.store.cleanValue(data, `${fieldName}.${visitKey}.data[${visit.data.length}]`)
    visit.data.push(cleaned === undefined ? null : cleaned)
    this.store.browserEphemeral.unsavedChanges = true

    this.logStore.debug(`SMILE API: recordPageData() recorded to ${fieldName}.${visitKey}`, data)

    return true
  }

  /**
   * Gets whether browser window visibility has been verified
   * @returns {boolean} True if visibility is verified, false otherwise
   */
  getVerifiedVisibility() {
    return this.store.verifiedVisibility
  }

  // Browser checks
  /**
   * Checks if the space available to the experiment is smaller than the required dimensions
   * @param {number} width - Available width (the window, or the dev device container)
   * @param {number} height - Available height below the status bar
   * @returns {boolean} True if browser window is too small, false otherwise
   */
  isBrowserTooSmall(width, height) {
    let val = false
    if (
      this.store.config.windowsizerAggressive === true
      && this.store.data.verifiedVisibility === true
      && !this.store.cookieState.withdrawn
    ) {
      // width/height are the space available below the status bar; the
      // margins are WindowSizerView's around the box (m-2 mt-5).
      val
        = width < this.store.config.windowsizerRequest.width + WINDOWSIZER_MARGIN_X
          || height < this.store.config.windowsizerRequest.height + WINDOWSIZER_MARGIN_Y
    }
    return val
  }

  // Development tools
  /**
   * Sets an autofill function for development mode
   * @param {Function} autofill - The autofill function to register
   * @returns {void}
   */
  setAutofill(autofill) {
    this.logStore.debug('SMILEAPI: registering autofill function')
    if (import.meta.dev) this.store.setAutofill(autofill)
  }

  /**
   * Removes the registered autofill function in development mode
   * @returns {void}
   */
  removeAutofill() {
    this.logStore.debug('SMILEAPI: removing autofill')
    if (import.meta.dev) this.store.removeAutofill()
  }

  // Completion and recruitment
  /**
   * Sets the completion code for the study
   * @param {string} code - The completion code to set
   * @returns {void}
   */
  setCompletionCode(code) {
    this.store.setCompletionCode(code)
  }

  /**
   * Computes a unique completion code based on study data.
   * Creates a hash of all pageData_* fields and appends status indicators.
   * Falls back to studyData for backward compatibility if no pageData fields exist.
   *
   * @returns {string} A unique completion code with status suffix
   */
  computeCompletionCode() {
    // Collect all pageData_* fields
    const pageDataFields = {}
    for (const key in this.store.data) {
      if (key.startsWith('pageData_')) {
        pageDataFields[key] = this.store.data[key]
      }
    }

    // Use pageData if available, fallback to studyData for backward compat
    let dataToHash
    if (Object.keys(pageDataFields).length > 0) {
      dataToHash = stableStringify(pageDataFields)
    }
    else {
      dataToHash = stableStringify(this.store.data.studyData)
    }

    // stableStringify gives undefined when there is no studyData; the code is
    // then the hash of the empty string.
    const hashDigest = sha256Base64(dataToHash ?? '')

    const codes = {
      withdrew: 'xx',
      completed: 'oo',
    }
    let endCode = ''
    if (this.store.cookieState.withdrawn) {
      endCode = codes['withdrew']
    }
    else if (this.store.cookieState.done) {
      endCode = codes['completed']
    }
    return hashDigest.slice(0, 20) + endCode
  }

  /**
   * Gets the recruitment service being used (e.g. Prolific, CloudResearch)
   * @returns {string} The name of the recruitment service
   */
  getRecruitmentService() {
    return this.store.data.recruitmentService
  }

  // dev tools
  /**
   * Checks if an autofill function is registered
   * @returns {boolean} True if autofill function exists, false otherwise
   */
  hasAutofill() {
    return this.store.hasAutofill
  }

  /**
   * Executes the registered autofill function
   * @returns {*} The result of the autofill function
   */
  autofill() {
    return this.store.autofill()
  }

  // routes
  /**
   * Gets the name of the current route from the timeline.
   * In Nuxt, Vue Router route names are catch-all names (e.g. 'dev-slug'),
   * so we resolve the actual timeline route name from the path.
   * @returns {string|undefined} The current timeline route name
   */
  currentRouteName() {
    // Dev root shows RecruitmentChooserView, not the landing redirect
    if (this.route.path === '/dev' || this.route.path === '/dev/') {
      return 'recruit'
    }
    const viewConfig = this._resolveTimelineRoute()
    return viewConfig?.name
  }

  // routes
  /**
   * Gets the info of the current route
   * @returns {object} The current route info
   */
  currentRouteInfo() {
    return this.route
  }

  /**
   * Gets the name of the current view from the timeline.
   * @returns {string|undefined} The current view name
   */
  currentViewName() {
    return this.currentRouteName()
  }

  /**
   * Resolves the timeline route for the current path by stripping
   * any /dev/ or /presentation/ prefix and looking up in $timeline.
   * @returns {object | null} The timeline route config
   * @private
   */
  _resolveTimelineRoute() {
    if (typeof window === 'undefined') return null
    try {
      const nuxtApp = useNuxtApp()
      const timeline = nuxtApp?.$timeline
      if (!timeline) return null
      // Strip /dev or /presentation prefix to get the experiment path
      const path = this.route.path.replace(/^\/(dev|presentation)(\/|$)/, '/') || '/'
      return timeline.getViewForPath(path)
    }
    catch {
      return null
    }
  }

  /**
   * Gets a condition by its name
   * @param {string} name - The name of the condition to get
   * @returns {*} The condition value
   */
  getConditionByName(name) {
    return this.store.getConditionByName(name)
  }

  /**
   * Gets the browser fingerprint
   * @returns {string} The browser fingerprint
   */
  getBrowserFingerprint() {
    return this.store.getBrowserFingerprint()
  }

  // Event and trial management
  /**
   * Records a window event
   * @param {string} type - The type of window event
   * @param {*} event_data - Additional event data (optional)
   * @returns {void}
   */
  recordWindowEvent(type, event_data = null) {
    this.store.recordWindowEvent(type, event_data)
  }

  /**
   * Sends the participant's data to the server now and waits for the answer.
   * Data is saved by itself about a second after every change, so this is
   * only for a point where the experiment needs to know the data has arrived
   * (before sending the participant back to the recruitment site, for
   * example). Never throws.
   * @returns {Promise<{ ok: boolean, rev: number, error: string|null }>} `ok`
   *   is true when the server has everything recorded so far
   */
  sync() {
    return this.store.sync()
  }

  /**
   * The older name for sync(). Saving no longer needs to be asked for.
   * @returns {Promise<{ ok: boolean, rev: number, error: string|null }>} As sync()
   */
  saveData() {
    return this.store.sync()
  }

  /**
   * Whether the participant's data has reached the server (reactive):
   * `{ status, error, retryAt }` with status 'saved', 'pending' (a change is
   * waiting to be sent), 'saving', 'offline' or 'error'.
   * @returns {{ status: string, error: object|null, retryAt: number|null }} The sync loop's state
   */
  get syncStatus() {
    return this.store.browserEphemeral.sync
  }

  /**
   * Records trial data and increments trial counter
   * @deprecated Use recordPageData() instead. The studyData array will be maintained for backward compatibility but is deprecated.
   * @param {*} data - The trial data to record
   * @returns {void}
   */
  recordData(data) {
    this.logStore.warn('SMILE API: recordData() is deprecated. Use recordPageData() instead.')
    this.store.data.trialNum += 1
    this.store.recordData(data) // Keep for backward compat
    this.recordPageData(data) // Also record to new format
  }

  // Randomization and conditions
  /**
   * Sets a random seed for the random number generator
   * @param {string} [seed] - The seed to use, defaults to a random UUID
   * @returns {void}
   */
  randomSeed(seed) {
    participant.randomSeed(seed)
  }

  /**
   * Randomly assigns a condition from a set of possible conditions
   * @param {object} conditionObject - Object containing condition name and possible values
   * @param {string[]} conditionObject[name] - Array of possible condition values
   * @param {number[]} [conditionObject.weights] - Optional weights for sampling conditions
   * @returns {string|null} The assigned condition value, or null if error
   */
  randomAssignCondition(conditionObject) {
    const keys = Object.keys(conditionObject)
    const conditionNames = keys.filter(key => key !== 'weights')

    if (conditionNames.length > 1) {
      this.logStore.error('SMILE API: randomAssignCondition() only accepts one condition name at a time')
      return null
    }

    const [name] = conditionNames
    const currentCondition = this.store.getConditionByName(name)
    if (currentCondition) {
      this.logStore.debug('SMILE API: condition already assigned', name, currentCondition)
      return currentCondition
    }

    const possibleConditions = conditionObject[name]
    this.store.localState.possibleConditions[name] = possibleConditions

    const hasWeights = keys.includes('weights')
    const weights = hasWeights ? conditionObject.weights : undefined

    if (hasWeights && weights.length !== possibleConditions.length) {
      this.logStore.error(
        'SMILE API: randomAssignCondition() weights must be the same length as the condition possibilities',
      )
      return null
    }

    const randomCondition = sampleWithReplacement(possibleConditions, 1, weights)[0]
    this.store.setCondition(name, randomCondition)
    this.logStore.debug('SMILE API: assigned condition', name, randomCondition)
    return randomCondition
  }

  /**
   * Loads files into memory, so showing them later needs no network request.
   * Images are then drawn from memory wherever their URL is used. A video, a
   * sound or any other file has to be shown from `api.asset(path)`.
   *
   * A view's files are usually listed in design.js instead (`preload:` on the
   * view), which also keeps the view from showing before they are loaded.
   * @param {string|string[]} files - Paths relative to public/ ('stimuli/a.png'),
   *   patterns ('stimuli/*.png') and full URLs
   * @param {object} [options] - Options
   * @param {boolean} [options.urgent] - Load these before files waiting in the background (default true)
   * @returns {Promise<object>} `{ ok, total, ready, failed: [{ url, error }], bytes, ms }`.
   *   Never rejects: check `ok`.
   */
  async preload(files, { urgent = true } = {}) {
    if (typeof window === 'undefined') return { ok: true, total: 0, ready: 0, failed: [], bytes: 0, ms: 0 }
    const { preloader, urlsOf } = usePreload(this.runtimeConfig?.app?.baseURL)
    const urls = await urlsOf(files, this)
    const report = await preloader.loadAll(urls, { urgent })
    for (const { url, error } of report.failed) {
      this.logStore.error(`PRELOAD: ${url} could not be loaded: ${error}`)
    }
    return report
  }

  /**
   * The URL to give an <img>, <video> or <audio> for a file in public/. For a
   * preloaded video, sound or other file this is a blob: URL of the copy in
   * memory; for an image, or a file that was not preloaded, the file's own URL
   * (as getPublicUrl). Record the path in your data, not what this returns.
   * @param {string} path - Path relative to public/, or a full URL
   * @returns {string} The URL for the element
   */
  asset(path) {
    if (typeof window === 'undefined') return this.getPublicUrl(path)
    const { preloader, urlOf } = usePreload(this.runtimeConfig?.app?.baseURL)
    const url = urlOf(path)
    if (import.meta.dev && preloader.status(url) === 'none' && !notPreloaded.has(url)) {
      notPreloaded.add(url)
      this.logStore.warn(`PRELOAD: api.asset('${path}') was not preloaded, so it loads from the network when shown. List it under the view's preload in design.js.`)
    }
    return preloader.resolve(url)
  }

  /**
   * Counts for a set of files, for a progress display. Reactive in a template
   * or a computed. Patterns are not expanded here: pass paths or URLs.
   * @param {string|string[]} files - Paths relative to public/ and full URLs
   * @returns {{total: number, ready: number, failed: number, fraction: number}} The counts
   */
  preloadProgress(files) {
    if (typeof window === 'undefined') return { total: 0, ready: 0, failed: 0, fraction: 1 }
    const { preloader, urlOf } = usePreload(this.runtimeConfig?.app?.baseURL)
    return preloader.progress([files].flat().map(urlOf))
  }

  /**
   * Preload the images listed in the smile.preloadImages module option
   * (nuxt.config.ts). Starts the loads and returns; see {@link preload}.
   * @returns {void}
   */
  preloadAllImages() {
    const list = this.runtimeConfig?.public?.smile?.preloadImages || []
    this.logStore.debug(`Preloading ${list.length} image(s)`)
    this.preload(list, { urgent: false })
  }

  /**
   * Preload the videos listed in the smile.preloadVideos module option. A
   * view shows one from `api.asset(path)`.
   * @returns {void}
   */
  preloadAllVideos() {
    const list = this.runtimeConfig?.public?.smile?.preloadVideos || []
    this.logStore.debug(`Preloading ${list.length} video(s)`)
    this.preload(list, { urgent: false })
  }

  /**
   * Completes the consent process by setting consented status and known user if needed
   * @returns {Promise<void>}
   */
  async completeConsent() {
    await participant.completeConsent(this.store)
  }
}

/**
 * Creates and returns a reactive SmileAPI instance with necessary dependencies
 * @returns {SmileAPI} A reactive SmileAPI instance with timeline, routing and store functionality
 */
export default function useAPI() {
  const timeline = useTimeline()
  const route = useRoute()
  const router = useRouter()
  const store = useSmileStore()
  const logStore = useLog()
  const runtimeConfig = useRuntimeConfig()

  const api = new SmileAPI(store, logStore, route, router, timeline, runtimeConfig)
  return reactive(api)
}
