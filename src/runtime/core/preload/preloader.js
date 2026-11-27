/**
 * @module preloader
 * @description Loads files into memory before a view needs them, so showing
 * them needs no network request (#30).
 *
 * How a file is held depends on its kind, because that is what works in
 * Chromium, Firefox and WebKit when the server sends
 * `cache-control: max-age=0, must-revalidate` (what Vercel sends for public/):
 *
 * - image: an Image object at the file's own URL, decoded and kept. While the
 *   object is alive an <img> or CSS background with the same URL is drawn from
 *   memory, so templates need no change.
 * - media (video, audio) and any other file: fetched whole into a Blob. The
 *   view plays it from `resolve(url)`, a blob: URL. A <video> at the file's own
 *   URL would go to the network again (WebKit always, the others to
 *   revalidate).
 *
 * `<link rel="prefetch">` and a plain fetch() fill the HTTP cache only; with
 * the headers above the browser still asks the server before it shows the
 * file. Neither is used.
 *
 * This file has no Nuxt imports: the browser's fetch, Image and URL are passed
 * in, so the unit tests replace them.
 */
import { reactive } from 'vue'

const IMAGE = /\.(?:png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i
const MEDIA_TYPES = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
}

/**
 * The file extension of a URL, lower case, without the query or hash.
 * @param {string} url - A URL or path
 * @returns {string} e.g. 'png', or '' when there is none
 */
function extensionOf(url) {
  const path = String(url).split(/[?#]/)[0]
  const match = /\.([a-z0-9]+)$/i.exec(path)
  return match ? match[1].toLowerCase() : ''
}

/**
 * How a URL is held once loaded.
 * @param {string} url - A URL or path
 * @returns {'image'|'media'|'file'} image: a kept Image object; media and file: a Blob
 */
export function kindOf(url) {
  const path = String(url).split(/[?#]/)[0]
  if (IMAGE.test(path)) return 'image'
  if (extensionOf(url) in MEDIA_TYPES) return 'media'
  return 'file'
}

/** Defaults of {@link createPreloader}'s options. */
export const PRELOAD_DEFAULTS = Object.freeze({
  concurrency: 6, // files loading at once
  retries: 2, // attempts after the first one fails
  retryDelay: 500, // ms before the first retry; doubles each time
  stallTimeout: 20000, // ms a download may go without receiving a byte
  imageTimeout: 60000, // ms an image may take in all (its progress can't be seen)
})

/**
 * An error that another attempt will not fix (the file is missing, say).
 */
class PermanentError extends Error {}

/**
 * @typedef {object} PreloadEntry
 * @property {string} url - The file's URL
 * @property {'image'|'media'|'file'} kind - How it is held
 * @property {'queued'|'loading'|'ready'|'failed'} status - Where it is
 * @property {number} attempts - Attempts made so far
 * @property {number} bytes - Bytes received (0 for an image: the browser doesn't say)
 * @property {number|null} ms - How long the load took, from its start to ready or failed
 * @property {string|null} error - Why it failed
 */

/**
 * @typedef {object} PreloadReport
 * @property {boolean} ok - Every file is in memory
 * @property {number} total - Files asked for (after removing duplicates)
 * @property {number} ready - Files in memory
 * @property {Array<{url: string, error: string}>} failed - Files that could not be loaded
 * @property {number} bytes - Bytes held, of the fetched files
 * @property {number} ms - How long this call waited
 */

/**
 * Creates a preloader. One per page: what it holds lives as long as the
 * document does and is gone after a reload.
 * @param {object} [env] - The browser's functions, and the options above
 * @param {Function} [env.fetch] - fetch
 * @param {Function} [env.createImage] - Returns a new Image
 * @param {Function} [env.createObjectURL] - URL.createObjectURL
 * @param {Function} [env.revokeObjectURL] - URL.revokeObjectURL
 * @param {Function} [env.now] - A millisecond clock
 * @param {Function} [env.wait] - `(ms) => Promise`, the pause before a retry
 * @returns {object} `{ entries, load, loadAll, resolve, status, progress, report, release }`
 */
export function createPreloader(env = {}) {
  const options = { ...PRELOAD_DEFAULTS, ...env }
  const fetchFn = env.fetch ?? ((...args) => globalThis.fetch(...args))
  const createImage = env.createImage ?? (() => new globalThis.Image())
  const createObjectURL = env.createObjectURL ?? (blob => globalThis.URL.createObjectURL(blob))
  const revokeObjectURL = env.revokeObjectURL ?? (url => globalThis.URL.revokeObjectURL(url))
  const now = env.now ?? (() => globalThis.performance.now())
  const wait = env.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))

  /** @type {Map<string, PreloadEntry>} What the page shows (reactive) */
  const entries = reactive(new Map())
  /** What is held in memory per URL: `{ image }` or `{ blob, objectUrl }`. Not reactive. */
  const held = new Map()
  /** The promise of each load in flight or finished, per URL */
  const promises = new Map()
  /** Loads waiting for a free slot: `{ url, start }`, first out first */
  const queue = []
  let running = 0

  /**
   * Starts queued loads while there is a free slot.
   * @returns {void}
   */
  function pump() {
    while (running < options.concurrency && queue.length) {
      const task = queue.shift()
      running += 1
      task.start().finally(() => {
        running -= 1
        pump()
      })
    }
  }

  /**
   * Loads an image into an Image object at its own URL and decodes it.
   * @param {string} url - The image's URL
   * @returns {Promise<{image: object}>} The kept object
   */
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = createImage()
      const timer = setTimeout(() => {
        image.onload = image.onerror = null
        image.src = ''
        reject(new Error(`no answer in ${Math.round(options.imageTimeout / 1000)} s`))
      }, options.imageTimeout)
      image.onload = () => {
        clearTimeout(timer)
        // Decode now, so the first paint doesn't wait for it. A browser that
        // can't decode ahead (or an SVG, in some) still has the file loaded.
        const decoded = typeof image.decode === 'function' ? image.decode() : null
        Promise.resolve(decoded).catch(() => {}).then(() => resolve({ image }))
      }
      image.onerror = () => {
        clearTimeout(timer)
        // The browser gives no reason: a missing file, a failed connection and
        // a file that is not an image all end here.
        reject(new Error('the image could not be loaded'))
      }
      image.src = url
    })
  }

  /**
   * Fetches a file whole into a Blob.
   * @param {string} url - The file's URL
   * @param {PreloadEntry} entry - Its entry: `bytes` follows the download
   * @returns {Promise<{blob: Blob, objectUrl: string}>} The Blob and a blob: URL of it
   */
  async function loadBlob(url, entry) {
    const controller = new AbortController()
    let stalled = false
    let timer
    const restartTimer = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        stalled = true
        controller.abort()
      }, options.stallTimeout)
    }
    restartTimer()
    try {
      const response = await fetchFn(url, { signal: controller.signal })
      if (!response.ok) {
        const message = `the server answered ${response.status}`
        const retry = response.status >= 500 || response.status === 408 || response.status === 429
        throw retry ? new Error(message) : new PermanentError(message)
      }
      // An app with a catch-all page answers a path that has no file with
      // that page and status 200. That is not the file.
      const contentType = response.headers?.get?.('content-type')?.split(';')[0].trim().toLowerCase() || ''
      if (contentType === 'text/html' && !/^x?html?$/.test(extensionOf(url))) {
        throw new PermanentError('the server answered with a web page, not the file (is the path right?)')
      }
      entry.bytes = 0
      let blob
      const reader = response.body?.getReader?.()
      if (reader) {
        const chunks = []
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          entry.bytes += value.byteLength
          restartTimer()
        }
        blob = new Blob(chunks)
      }
      else {
        blob = await response.blob()
        entry.bytes = blob.size
      }
      // A <video> may refuse a blob with no type or a generic one
      const fromHeader = contentType
      const generic = !fromHeader || fromHeader === 'application/octet-stream' || fromHeader === 'binary/octet-stream'
      const type = generic ? (MEDIA_TYPES[extensionOf(url)] || fromHeader) : fromHeader
      blob = new Blob([blob], { type })
      return { blob, objectUrl: createObjectURL(blob) }
    }
    catch (err) {
      if (err instanceof PermanentError) throw err
      if (stalled) throw new Error(`the download stopped for ${Math.round(options.stallTimeout / 1000)} s`, { cause: err })
      // fetch() rejects with a TypeError for a failed connection and for a
      // server on another origin that doesn't allow cross-origin requests
      throw new Error(err?.message ? `the download failed (${err.message})` : 'the download failed', { cause: err })
    }
    finally {
      clearTimeout(timer)
    }
  }

  /**
   * One file, with retries. Resolves when it is ready or has failed for good.
   * @param {PreloadEntry} entry - The file's entry
   * @returns {Promise<PreloadEntry>} The entry
   */
  async function run(entry) {
    const started = now()
    entry.status = 'loading'
    for (let attempt = 0; attempt <= options.retries; attempt += 1) {
      entry.attempts += 1
      try {
        const result = entry.kind === 'image' ? await loadImage(entry.url) : await loadBlob(entry.url, entry)
        held.set(entry.url, result)
        entry.status = 'ready'
        entry.error = null
        entry.ms = Math.round(now() - started)
        return entry
      }
      catch (err) {
        entry.error = err.message
        if (err instanceof PermanentError || attempt === options.retries) break
        await wait(options.retryDelay * 2 ** attempt)
      }
    }
    entry.status = 'failed'
    entry.ms = Math.round(now() - started)
    return entry
  }

  /**
   * Puts a file in the queue without starting it. A file already loading or
   * in memory is left as it is; one that failed is queued again.
   * @param {string} url - The file's URL
   * @param {number|null} front - Where in the queue to put it, counted from
   *   the front; null for the end
   * @returns {boolean} True when the file is now in the queue at `front`
   */
  function enqueue(url, front) {
    const existing = entries.get(url)
    if (existing && existing.status !== 'failed') {
      if (front === null || existing.status !== 'queued') return false
      const index = queue.findIndex(task => task.url === url)
      queue.splice(front, 0, ...queue.splice(index, 1))
      return true
    }
    entries.set(url, { url, kind: kindOf(url), status: 'queued', attempts: 0, bytes: 0, ms: null, error: null })
    const entry = entries.get(url) // the reactive one
    promises.set(url, new Promise((resolve) => {
      const task = { url, start: () => run(entry).then(resolve) }
      if (front === null) queue.push(task)
      else queue.splice(front, 0, task)
    }))
    return front !== null
  }

  /**
   * Queues a set of files and starts what there is room for.
   * @param {string[]} urls - The files, without duplicates
   * @param {boolean} urgent - Put them before the files that are waiting, in
   *   the order given (a view is waiting for these)
   * @returns {Array<Promise<PreloadEntry>>} A promise per file
   */
  function start(urls, urgent) {
    let front = 0
    for (const url of urls) {
      if (enqueue(url, urgent ? front : null)) front += 1
    }
    pump()
    return urls.map(url => promises.get(url))
  }

  /**
   * Loads one file. A file already loading or in memory is not loaded again;
   * one that failed is tried again.
   * @param {string} url - The file's URL
   * @param {object} [opts] - Options
   * @param {boolean} [opts.urgent] - Go before the files that are waiting (a
   *   view is waiting for this one)
   * @returns {Promise<PreloadEntry>} The entry, ready or failed. Never rejects.
   */
  function load(url, { urgent = false } = {}) {
    return start([url], urgent)[0]
  }

  /**
   * The state of a set of files, without loading anything.
   * @param {string[]} urls - The files
   * @param {number} [ms] - How long the caller waited
   * @returns {PreloadReport} The report
   */
  function report(urls, ms = 0) {
    const unique = [...new Set(urls)]
    const failed = []
    let ready = 0
    let bytes = 0
    for (const url of unique) {
      const entry = entries.get(url)
      if (entry?.status === 'ready') {
        ready += 1
        bytes += entry.bytes
      }
      else if (entry?.status === 'failed') {
        failed.push({ url, error: entry.error })
      }
    }
    return { ok: ready === unique.length, total: unique.length, ready, failed, bytes, ms }
  }

  /**
   * Loads a set of files and waits for all of them.
   * @param {string[]} urls - The files
   * @param {object} [opts] - As for {@link load}
   * @returns {Promise<PreloadReport>} The report. Never rejects: see `ok` and `failed`.
   */
  async function loadAll(urls, opts) {
    const started = now()
    const unique = [...new Set(urls)]
    await Promise.all(start(unique, !!opts?.urgent))
    return report(unique, Math.round(now() - started))
  }

  /**
   * The URL to give an element.
   * @param {string} url - The file's URL
   * @returns {string} A blob: URL when the file was fetched into memory;
   *   otherwise the URL itself (an image, or a file not loaded)
   */
  function resolve(url) {
    // Reads the entry, so a template that calls this is drawn again when the
    // file arrives
    if (entries.get(url)?.status !== 'ready') return url
    return held.get(url)?.objectUrl ?? url
  }

  /**
   * Where a file is.
   * @param {string} url - The file's URL
   * @returns {'queued'|'loading'|'ready'|'failed'|'none'} 'none': never asked for
   */
  function status(url) {
    return entries.get(url)?.status ?? 'none'
  }

  /**
   * Counts for a progress bar. Reactive when read in a computed or a template.
   * @param {string[]} urls - The files
   * @returns {{total: number, ready: number, failed: number, fraction: number}} `fraction` is ready / total (1 for an empty set)
   */
  function progress(urls) {
    const unique = [...new Set(urls)]
    let ready = 0
    let failed = 0
    for (const url of unique) {
      const state = entries.get(url)?.status
      if (state === 'ready') ready += 1
      else if (state === 'failed') failed += 1
    }
    return { total: unique.length, ready, failed, fraction: unique.length ? ready / unique.length : 1 }
  }

  /**
   * Lets go of files, to free their memory. A later load fetches them again.
   * A file still loading is left alone.
   * @param {string[]} [urls] - The files; all of them when left out
   * @returns {void}
   */
  function release(urls) {
    for (const url of urls ?? [...entries.keys()]) {
      const state = entries.get(url)?.status
      if (state !== 'ready' && state !== 'failed') continue
      const item = held.get(url)
      if (item?.objectUrl) revokeObjectURL(item.objectUrl)
      held.delete(url)
      entries.delete(url)
      promises.delete(url)
    }
  }

  return { entries, load, loadAll, resolve, status, progress, report, release }
}
