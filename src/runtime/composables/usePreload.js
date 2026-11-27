/**
 * @module usePreload
 * @description The page's preloader (core/preload/preloader.js) and what
 * turns a view's `preload` list into URLs. One preloader per page: the files
 * it holds are in the document's memory, so they last until a reload (#30).
 */
import { useRuntimeConfig } from '#imports'
import { createPreloader } from '../core/preload/preloader.js'
import { expandList, isFullUrl, isPattern } from '../core/preload/patterns.js'
import { withBase } from '../core/participant-actions.js'

let preloader = null
/** The project's public files, once loaded (see loadPublicFiles) */
let publicFiles = null
let publicFilesPromise = null
/** Patterns already reported as matching nothing, so each is logged once */
const reported = new Set()

/**
 * The page's preloader, made on first use.
 * @returns {object} The preloader
 */
export function getPreloader() {
  if (!preloader) preloader = createPreloader()
  return preloader
}

/**
 * The list of the project's public files, which the module writes when it
 * builds (src/module.ts). Loaded on first use, in its own chunk: a project
 * that uses no patterns never downloads it.
 * @returns {Promise<string[]>} Paths relative to public/
 */
export function loadPublicFiles() {
  if (!publicFilesPromise) {
    publicFilesPromise = import('#build/smile-public-files.mjs')
      .then((module) => {
        publicFiles = module.default
        return publicFiles
      })
  }
  return publicFilesPromise
}

/**
 * The URL of an entry of a preload list.
 * @param {string} path - A path relative to public/, or a full URL
 * @param {string} [baseURL] - The app's base URL
 * @returns {string} The URL an element would use
 */
export function assetUrl(path, baseURL) {
  return isFullUrl(path) ? path : withBase(baseURL, path)
}

/**
 * A view's `preload` as an array. A function is called with the API, so the
 * list can depend on the participant's condition.
 * @param {Array|string|Function|undefined} preload - What the view lists
 * @param {object} api - The SmileAPI
 * @returns {string[]} Paths, patterns and URLs
 */
function asList(preload, api) {
  const value = typeof preload === 'function' ? preload(api) : preload
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * Expands a list into URLs with the public files that are known now.
 * @param {string[]} list - Paths, patterns and URLs
 * @param {string} baseURL - The app's base URL
 * @param {object} [log] - A logger, told once about a pattern that matches nothing
 * @returns {string[]} URLs
 */
function toUrls(list, baseURL, log) {
  const { paths, unmatched } = expandList(list, publicFiles ?? [])
  for (const pattern of unmatched) {
    if (reported.has(pattern)) continue
    reported.add(pattern)
    log?.warn?.(`PRELOAD: the pattern '${pattern}' matches no file in public/`)
  }
  return paths.map(path => assetUrl(path, baseURL))
}

/**
 * Preloading for the API and the pages.
 * @param {string} [baseURL] - The app's base URL; read from the runtime config when left out
 * @returns {object} `{ preloader, urlsOf, urlsOfNow, urlOf }`
 */
export default function usePreload(baseURL = useRuntimeConfig()?.app?.baseURL) {
  /**
   * The URLs of a preload list.
   * @param {Array|string|Function|undefined} preload - What a view lists, or what api.preload() was given
   * @param {object} api - The SmileAPI (for a function, and for its log)
   * @returns {Promise<string[]>} URLs, without duplicates
   */
  async function urlsOf(preload, api) {
    const list = asList(preload, api)
    if (publicFiles === null && list.some(item => typeof item === 'string' && !isFullUrl(item) && isPattern(item))) {
      await loadPublicFiles()
    }
    return toUrls(list, baseURL, api?.log)
  }

  /**
   * The same without waiting, when that is possible.
   * @param {Array|string|Function|undefined} preload - As for urlsOf
   * @param {object} api - The SmileAPI
   * @returns {string[]|null} URLs; null when the list has a pattern and the
   *   list of public files is not loaded yet
   */
  function urlsOfNow(preload, api) {
    const list = asList(preload, api)
    if (publicFiles === null && list.some(item => typeof item === 'string' && !isFullUrl(item) && isPattern(item))) {
      return null
    }
    return toUrls(list, baseURL, api?.log)
  }

  return {
    preloader: getPreloader(),
    urlsOf,
    urlsOfNow,
    urlOf: path => assetUrl(path, baseURL),
  }
}

/**
 * For the unit tests: a new preloader and no public files.
 * @param {object} [replacement] - `{ preloader, publicFiles }` to use instead
 * @returns {void}
 */
export function _resetPreload(replacement = {}) {
  preloader = replacement.preloader ?? null
  publicFiles = replacement.publicFiles ?? null
  publicFilesPromise = publicFiles ? Promise.resolve(publicFiles) : null
  reported.clear()
}
