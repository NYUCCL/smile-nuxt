/**
 * @module log
 * @description Pinia store for managing application logging functionality. Provides methods for:
 * - Logging messages at different levels (debug, info, warn, error)
 * - Capturing stack traces
 * - Formatting log messages
 * - Notifying users of important events
 * - Integrating with the application's global state management
 */
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import useSmileStore from './smilestore.js'

/**
 * The most entries kept in `history` and in `page_history`. When an array is
 * full the oldest entries are dropped, so a long session that logs often
 * (every recordPageData call logs) cannot use memory without bound.
 */
export const MAX_HISTORY = 2000

/**
 * Gets a formatted stack trace string from the current execution context
 * @param {number} frame - Index of the caller's line among the stack's frames.
 *   Frame 0 is this function; a store action called from outside the store
 *   adds two frames (the action and Pinia's wrapper around it).
 * @returns {string} A formatted string containing the file path, line number and column number of the caller,
 *                   or '(could not parse trace)' if parsing fails
 * @example
 * // Returns something like: "src/components/MyComponent.vue (line 42, column 3)"
 * const trace = getLogTrace(4);
 */
function getLogTrace(frame) {
  // some browsers use 'at ', some use '@'
  const lines = new Error('trace').stack.split('\n').filter(line => line.includes('at ') || line.includes('@'))
  if (lines.length <= frame) {
    return '(could not parse trace)'
  }
  // strip leading 'http://localhost:xxx/.../.../.../' and '?t=xxx' query param, if present
  const regex
    = /(?:at\s|@)(?:.*?\s\()?(?:http:\/\/localhost:\d+\/\w+\/\w+\/\w+\/)?(?<filePath>[^?:]+)(?:\?[^:]*)?:(?<lineNumber>\d+):(?<columnNumber>\d+)\)?/
  const match = regex.exec(lines[frame])
  if (match) {
    return `${match.groups.filePath} (line ${match.groups.lineNumber}, column ${match.groups.columnNumber})`
  }
  else {
    return '(could not parse trace)'
  }
}

/**
 * Converts an array of arguments into a single string representation
 * @param {Array} args - Array of arguments to convert to string
 * @returns {string} Space-separated string of all arguments, with objects JSON stringified
 * @example
 * // Returns "hello 42 {"foo":"bar"}"
 * argsToString(["hello", 42, {foo: "bar"}])
 */
function argsToString(args) {
  return args
    .map((arg) => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg)
        }
        catch {
          return ''
        }
      }
      else {
        return String(arg)
      }
    })
    .join(' ')
}

/**
 * Appends an entry to an array and drops the oldest entries beyond MAX_HISTORY.
 * @param {Array} list - `history` or `page_history`
 * @param {object} msg - The entry
 */
function pushCapped(list, msg) {
  list.push(msg)
  if (list.length > MAX_HISTORY) list.splice(0, list.length - MAX_HISTORY)
}

/**
 * What each level does besides adding the entry to the history: the console
 * method that prints the message (none for 'log'), and for the levels that
 * can show a toast, the toast method and the dev tools' notification filter
 * values that turn it on.
 */
const LEVELS = {
  log: {},
  debug: { console: 'log' },
  warn: { console: 'warn', toast: 'warning', filters: ['Warnings and Errors', 'Warnings only'] },
  error: { console: 'error', toast: 'error', filters: ['Warnings and Errors', 'Errors only'] },
  success: { console: 'log', toast: 'success', filters: ['All', 'Success only'] },
}

/**
 * Records one message at a level: shows the toast (if the notification filter
 * asks for this level), prints to the console, and adds the entry to the
 * history. Called directly by the store's five logging actions, so the
 * caller of the action is frame 4 of the stack (getLogTrace, this function,
 * the action, Pinia's wrapper, the caller).
 * @param {object} store - The log store
 * @param {'log'|'debug'|'warn'|'error'|'success'} type - The level
 * @param {Array} args - The arguments given to the logging action
 */
function record(store, type, args) {
  const level = LEVELS[type]
  const message = argsToString(args)
  const msg = {
    type,
    time: new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' }),
    message: message,
    trace: getLogTrace(4),
  }
  if (level.toast && level.filters.includes(useSmileStore().dev.notificationFilter)) {
    toast[level.toast](message)
  }
  if (level.console) console[level.console](message)
  store.addToHistory(msg)
}

/**
 * Pinia store for managing application logging functionality
 * @returns {object} Store instance with state and actions for logging
 * @example
 * const logStore = useLogStore()
 * logStore.log('Hello world') // Logs a message
 * logStore.warn('Warning message') // Logs a warning
 * logStore.debug('Debug info') // Logs debug info in development mode
 */
export default defineStore('log', {
  /**
   * State for the log store
   * @returns {object} Store state object
   * @property {Array} history - The newest MAX_HISTORY log messages of the session
   * @property {Array} page_history - The newest MAX_HISTORY log messages of the current page/route
   */
  state: () => ({
    history: [],
    page_history: [],
  }),
  actions: {
    /**
     * Adds a message to both the global history and page history arrays,
     * keeping the newest MAX_HISTORY entries of each
     * @param {object} msg - The message object to add to history
     */
    addToHistory(msg) {
      pushCapped(this.history, msg)
      pushCapped(this.page_history, msg)
    },

    /**
     * Clears the page-specific history array while preserving global history
     */
    clearPageHistory() {
      this.page_history = []
    },

    /**
     * Logs a standard message to history
     * @param {...*} args - Arguments to log, will be converted to string
     */
    log(...args) {
      record(this, 'log', args)
    },

    /**
     * Logs a debug message to history and to the console
     * @param {...*} args - Arguments to log, will be converted to string
     */
    debug(...args) {
      record(this, 'debug', args)
    },

    /**
     * Logs a warning message to history and optionally shows notification based on settings
     * @param {...*} args - Arguments to log, will be converted to string
     */
    warn(...args) {
      record(this, 'warn', args)
    },

    /**
     * Logs an error message to history and optionally shows notification based on settings
     * @param {...*} args - Arguments to log, will be converted to string
     */
    error(...args) {
      record(this, 'error', args)
    },

    /**
     * Logs a success message to history and optionally shows notification based on settings
     * @param {...*} args - Arguments to log, will be converted to string
     */
    success(...args) {
      record(this, 'success', args)
    },
  },
})
