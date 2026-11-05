/**
 * Keyboard helpers for the `:` command palette.
 */

/**
 * True when a key event's target is somewhere you type: an input, textarea,
 * select or contenteditable (a `:` there is text, not the palette).
 */
export function isTypingTarget(event) {
  const el = event.composedPath?.()[0] ?? event.target
  if (!el || el.nodeType !== 1) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return !!(el.isContentEditable || el.closest?.('[contenteditable]:not([contenteditable="false"])'))
}

/** True for the key that opens the palette: a plain `:` (Shift is how you type it) */
export function isOpenKey(event) {
  return event.key === ':' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing
}
