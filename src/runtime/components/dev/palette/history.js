/**
 * The `:` command palette's history: the commands you've run ("dev",
 * "go welcome"), newest first, in localStorage. Storage can be missing or
 * throw (private windows, blocked site data), so every access is guarded and
 * the palette works without it.
 */

export const HISTORY_KEY = 'smile-dev-palette-history'
export const HISTORY_MAX = 20

/** @returns {string[]} newest first */
export function loadHistory(storage = globalThis.localStorage) {
  try {
    const list = JSON.parse(storage?.getItem(HISTORY_KEY) ?? '[]')
    return Array.isArray(list) ? list.filter(s => typeof s === 'string') : []
  }
  catch {
    return []
  }
}

/** Put a command at the front (once) and save. @returns {string[]} the new list */
export function pushHistory(entry, storage = globalThis.localStorage) {
  const list = [entry, ...loadHistory(storage).filter(s => s !== entry)].slice(0, HISTORY_MAX)
  try {
    storage?.setItem(HISTORY_KEY, JSON.stringify(list))
  }
  catch {
    // not saved; the palette still works
  }
  return list
}
