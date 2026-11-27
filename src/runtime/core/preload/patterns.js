/**
 * @module preload/patterns
 * @description Turns what a view lists under `preload` into URLs: paths in
 * public/, patterns such as 'stimuli/*.png' matched against the list of the
 * project's public files, and full URLs.
 */

/**
 * Whether a path is a pattern (has `*`, `?` or `{a,b}`).
 * @param {string} path - A path from a preload list
 * @returns {boolean} True for a pattern
 */
export function isPattern(path) {
  return /[*?]|\{[^},]*,[^}]*\}/.test(path)
}

/**
 * Whether a string is a URL to use as it is, not a path in public/.
 * @param {string} path - An entry of a preload list
 * @returns {boolean} True for http(s):, protocol-relative, blob: and data: URLs
 */
export function isFullUrl(path) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(path)
}

/**
 * The regular expression of a pattern. `*` matches within a folder, `**`
 * across folders, `?` one character, `{a,b}` either.
 * @param {string} pattern - e.g. 'stimuli/**\/*.{png,jpg}'
 * @returns {RegExp} Matches a whole path relative to public/
 */
export function patternToRegExp(pattern) {
  let out = ''
  let depth = 0
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        i += 1
        if (pattern[i + 1] === '/') {
          i += 1
          out += '(?:.*/)?' // '**/' also matches no folder at all
        }
        else {
          out += '.*'
        }
      }
      else {
        out += '[^/]*'
      }
    }
    else if (char === '?') {
      out += '[^/]'
    }
    else if (char === '{') {
      depth += 1
      out += '(?:'
    }
    else if (char === '}' && depth > 0) {
      depth -= 1
      out += ')'
    }
    else if (char === ',' && depth > 0) {
      out += '|'
    }
    else {
      out += char.replace(/[.+^$()|[\]\\{}]/g, '\\$&')
    }
  }
  return new RegExp(`^${out}$`)
}

/**
 * A path as the list of public files writes it: no leading slash.
 * @param {string} path - A path relative to public/
 * @returns {string} The path without leading slashes
 */
function relative(path) {
  return String(path).replace(/^\/+/, '')
}

/**
 * Expands a preload list into paths and URLs, without duplicates, in order.
 * @param {string[]} list - Paths in public/, patterns and full URLs
 * @param {string[]} [publicFiles] - Every file in public/, relative to it.
 *   Needed only when the list has a pattern.
 * @returns {{paths: string[], unmatched: string[]}} `paths`: paths relative to
 *   public/ and full URLs; `unmatched`: patterns that matched no file
 */
export function expandList(list, publicFiles = []) {
  const paths = []
  const unmatched = []
  const seen = new Set()
  const add = (path) => {
    if (seen.has(path)) return
    seen.add(path)
    paths.push(path)
  }
  for (const item of list) {
    if (typeof item !== 'string' || item === '') continue
    if (isFullUrl(item)) {
      add(item)
    }
    else if (isPattern(item)) {
      const regexp = patternToRegExp(relative(item))
      const matches = publicFiles.filter(file => regexp.test(file)).sort()
      if (matches.length === 0) unmatched.push(item)
      matches.forEach(add)
    }
    else {
      add(relative(item))
    }
  }
  return { paths, unmatched }
}
