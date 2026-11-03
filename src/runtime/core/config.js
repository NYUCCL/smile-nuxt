/**
 * @fileoverview Global configuration options for the Smile application.
 * @description This module exports configuration settings used throughout the app.
 * Configuration values are populated from environment variables during build time
 * using Vite's import.meta.env string replacement.
 * @module config
 */
/**
 * Parses a string in the format "WIDTHxHEIGHT" into width and height values
 * @param {string} value - String in format "WIDTHxHEIGHT" (e.g. "800x600")
 * @returns {object} Object containing parsed width and height as integers
 * @property {number} width - The parsed width value
 * @property {number} height - The parsed height value
 */
/**
 * Parses a numeric env setting. import.meta.env values are strings, and an
 * unset one is undefined; without a fallback the write throttle and limits
 * would silently turn off (comparisons with NaN/undefined are always false).
 * @param {string|undefined} value - The env value
 * @param {number} fallback - Used when the value is unset or not a number
 * @returns {number} The parsed number
 */
/**
 * The experiment's color mode setting: 'light', 'dark' or 'system' (follow the
 * participant's OS/browser preference). 'auto' is accepted for 'system'.
 * Anything else, or unset, is 'light': dark mode changes how stimuli look, so
 * it is opt in.
 * @param {string|undefined} value
 * @returns {'light'|'dark'|'system'} The normalized setting
 */
export function normalizeColorMode(value) {
  const v = String(value ?? '').trim().toLowerCase()
  if (v === 'dark') return 'dark'
  if (v === 'system' || v === 'auto') return 'system'
  return 'light'
}

function envNumber(value, fallback) {
  const n = Number(value)
  return value === undefined || value === '' || Number.isNaN(n) ? fallback : n
}

/**
 * Reference size for the dev tools' data meter, in characters of JSON
 * (~bytes). Every save sends the participant's whole data object, and Vercel
 * Functions reject request bodies over 4.5 MB, so that's the practical limit
 * on the default deploy target. Display only; nothing enforces it.
 */
export const DATA_SIZE_REFERENCE = 4_500_000

function parseWidthHeight(value) {
  // receives configuration option as WIDTHxHEIGHT
  // split based on 'x' and assign to objects
  if (!value) return { width: 0, height: 0 }
  const w_h = value.split('x')
  return { width: Number.parseInt(w_h[0]), height: Number.parseInt(w_h[1]) }
}

/**
 * Global configuration object for the Smile application
 * @typedef {object} Config
 * @property {string} mode - Application mode ('development', 'production', 'testing')
 * @property {string} projectName - Name of the project
 * @property {string} projectRef - Project reference derived from deploy base path
 * @property {string} codeName - Project code name
 * @property {string} codeNameURL - Deploy URL for code name
 * @property {string} localStorageKey - Key for storing data in localStorage
 * @property {string} devLocalStorageKey - Key for storing dev data in localStorage
 * @property {object} github - GitHub repository information
 * @property {string} github.repoName - Repository name
 * @property {string} github.owner - Repository owner
 * @property {string} github.branch - Current branch name
 * @property {string} github.lastCommitMsg - Last commit message
 * @property {string} github.lastCommitHash - Last commit hash
 * @property {string} github.commitURL - URL to last commit
 * @property {boolean} allowRepeats - Whether to allow repeat participants
 * @property {boolean} autoSave - Whether to auto-save data
 * @property {number} maxWrites - Maximum number of writes allowed
 * @property {number} minWriteInterval - Minimum interval between writes
 * @property {number} maxSteps - Maximum rows in stepper tables
 * @property {number} dataSizeReference - Reference size for the dev tools' data meter (see DATA_SIZE_REFERENCE)
 * @property {string} randomSeed - Seed for random number generation
 * @property {string} deployURL - URL where app is deployed
 * @property {string} labURL - URL of the lab website
 * @property {string} brandLogoFn - Function name for brand logo
 * @property {string} googleAnalyticsID - Google Analytics tracking ID
 * @property {object} windowsizerRequest - Requested window dimensions
 * @property {boolean} windowsizerAggressive - Whether to force window sizing
 * @property {boolean} anonymousMode - Whether to enable anonymous mode
 */
const codeName = import.meta.env.VITE_CODE_NAME || 'unnamed-experiment'
const projectRef = (import.meta.env.VITE_DEPLOY_BASE_PATH || '/local/experiment/main/').slice(1, -1).replace(/\//g, '-')
const owner = import.meta.env.VITE_GIT_OWNER || 'local'
const repoName = import.meta.env.VITE_GIT_REPO_NAME || 'experiment'
const branch = import.meta.env.VITE_GIT_BRANCH_NAME || 'main'
const hash = import.meta.env.VITE_GIT_HASH || '0000000'

export default {
  mode: import.meta.env.MODE,
  smileVersion: import.meta.env.VITE_SMILE_VERSION || '(unknown)',
  projectName: import.meta.env.VITE_PROJECT_NAME || 'experiment',
  projectRef,
  codeName,
  codeNameURL: import.meta.env.VITE_CODE_NAME_DEPLOY_URL,
  localStorageKey: `smilestore-${codeName}`,
  devLocalStorageKey: `smilestore-${codeName}_dev`,
  github: {
    repoName,
    owner,
    branch,
    lastCommitMsg: import.meta.env.VITE_GIT_LAST_MSG || '(no commits yet)',
    lastCommitHash: hash,
    commitURL: `https://github.com/${owner}/${repoName}/commit/${hash}`,
  },
  // browser_exclude: import.meta.env.VITE_BROWSER_EXCLUDE,
  allowRepeats: import.meta.env.VITE_ALLOW_REPEATS === 'true',
  // On unless set to 'false'. (The raw string 'false' is truthy, so setting
  // VITE_AUTO_SAVE_DATA=false used to leave auto-save on.)
  autoSave: import.meta.env.VITE_AUTO_SAVE_DATA !== 'false',
  maxWrites: envNumber(import.meta.env.VITE_MAX_WRITES, 1000),
  minWriteInterval: envNumber(import.meta.env.VITE_MIN_WRITE_INTERVAL, 2000),
  maxSteps: envNumber(import.meta.env.VITE_MAX_STEPS, 5000),
  dataSizeReference: DATA_SIZE_REFERENCE,
  randomSeed: import.meta.env.VITE_RANDOM_SEED,
  deployURL: import.meta.env.VITE_DEPLOY_URL, // auto compute this
  labURL: import.meta.env.VITE_LAB_URL,
  brandLogoFn: import.meta.env.VITE_BRAND_LOGO_FN,
  advertisementImageFn: '/_smile/images/helpus.png',
  advertisementImageInvertDark: false,
  colorMode: normalizeColorMode(import.meta.env.VITE_COLOR_MODE), // 'light' | 'dark' | 'system'
  responsiveUI: import.meta.env.VITE_RESPONSIVE_UI === 'true',
  googleAnalyticsID: import.meta.env.VITE_GOOGLE_ANALYTICS,
  windowsizerRequest: parseWidthHeight(import.meta.env.VITE_WINDOWSIZER_REQUEST),
  windowsizerAggressive: import.meta.env.VITE_WINDOWSIZER_AGGRESSIVE === 'true',
  anonymousMode: import.meta.env.VITE_ANONYMOUS_MODE === 'true',
  unpaidStudy: import.meta.env.VITE_UNPAID_STUDY === 'true',
}
