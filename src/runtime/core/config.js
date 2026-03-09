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
 * @property {string} randomSeed - Seed for random number generation
 * @property {string} deployURL - URL where app is deployed
 * @property {string} labURL - URL of the lab website
 * @property {string} brandLogoFn - Function name for brand logo
 * @property {string} googleAnalyticsID - Google Analytics tracking ID
 * @property {object} windowsizerRequest - Requested window dimensions
 * @property {boolean} windowsizerAggressive - Whether to force window sizing
 * @property {boolean} anonymousMode - Whether to enable anonymous mode
 * @property {object} firebaseConfig - Firebase configuration object
 * @property {string} firebaseConfig.apiKey - Firebase API key
 * @property {string} firebaseConfig.authDomain - Firebase auth domain
 * @property {string} firebaseConfig.projectId - Firebase project ID
 * @property {string} firebaseConfig.storageBucket - Firebase storage bucket
 * @property {string} firebaseConfig.messagingSenderId - Firebase messaging sender ID
 * @property {string} firebaseConfig.appId - Firebase app ID
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
  autoSave: import.meta.env.VITE_AUTO_SAVE_DATA,
  maxWrites: import.meta.env.VITE_MAX_WRITES,
  minWriteInterval: import.meta.env.VITE_MIN_WRITE_INTERVAL,
  maxSteps: import.meta.env.VITE_MAX_STEPS,
  randomSeed: import.meta.env.VITE_RANDOM_SEED,
  deployURL: import.meta.env.VITE_DEPLOY_URL, // auto compute this
  labURL: import.meta.env.VITE_LAB_URL,
  brandLogoFn: import.meta.env.VITE_BRAND_LOGO_FN,
  advertisementImageFn: '/_smile/images/helpus.png',
  advertisementImageInvertDark: false,
  colorMode: import.meta.env.VITE_COLOR_MODE, // 'light' or 'dark' or 'system'
  responsiveUI: import.meta.env.VITE_RESPONSIVE_UI === 'true',
  googleAnalyticsID: import.meta.env.VITE_GOOGLE_ANALYTICS,
  windowsizerRequest: parseWidthHeight(import.meta.env.VITE_WINDOWSIZER_REQUEST),
  windowsizerAggressive: import.meta.env.VITE_WINDOWSIZER_AGGRESSIVE === 'true',
  anonymousMode: import.meta.env.VITE_ANONYMOUS_MODE === 'true',
  unpaidStudy: import.meta.env.VITE_UNPAID_STUDY === 'true',
  sona: {
    url: import.meta.env.VITE_SONA_URL,
    experimentId: import.meta.env.VITE_SONA_EXPERIMENT_ID,
    creditToken: import.meta.env.VITE_SONA_CREDIT_TOKEN,
  },
  sonaPaid: {
    url: import.meta.env.VITE_SONA_PAID_URL,
    experimentId: import.meta.env.VITE_SONA_PAID_EXPERIMENT_ID,
    creditToken: import.meta.env.VITE_SONA_PAID_CREDIT_TOKEN,
  },
  spark: {
    completionUrl: 'https://spark.hartleylab.org/completed',
  },
  firebaseConfig: {
    apiKey: import.meta.env.VITE_FIREBASE_APIKEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTHDOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECTID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGEBUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGINGSENDERID,
    appId: import.meta.env.VITE_FIREBASE_APPID,
  },
}
