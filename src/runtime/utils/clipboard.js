/**
 * @fileoverview Copying text to the clipboard, on https and on plain http.
 */

/**
 * Copies text with document.execCommand('copy'), which works on pages that
 * are not in a secure context. When an input or textarea holding the text is
 * given, its text is selected and copied (and stays selected). Otherwise a
 * temporary textarea is added to the page for the copy and then removed.
 * @param {string} text - The text to copy
 * @param {HTMLInputElement|HTMLTextAreaElement} [field] - A field whose value is the text
 * @returns {boolean} Whether the browser reported that the copy worked
 */
function copyWithExecCommand(text, field) {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false
  const usable = field && typeof field.select === 'function' && field.value === text
  const el = usable ? field : document.createElement('textarea')
  if (!usable) {
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.top = '0'
    el.style.left = '-9999px'
    document.body.appendChild(el)
  }
  try {
    el.select()
    return document.execCommand('copy') !== false
  }
  catch {
    return false
  }
  finally {
    if (!usable) document.body.removeChild(el)
  }
}

/**
 * Copies text to the clipboard. Uses navigator.clipboard.writeText() when the
 * page has it (https and localhost). When it is missing or refuses, selects
 * the text and uses document.execCommand('copy'). Never throws.
 * @param {string} text - The text to copy
 * @param {HTMLInputElement|HTMLTextAreaElement} [field] - A field whose value is the text; the fallback selects it
 * @returns {Promise<boolean>} Whether the text was copied
 */
export async function copyText(text, field) {
  const value = String(text ?? '')
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
  if (typeof clipboard?.writeText === 'function') {
    try {
      await clipboard.writeText(value)
      return true
    }
    catch {
      // Permission refused or the document is not focused: try the other way.
    }
  }
  return copyWithExecCommand(value, field)
}

export default copyText
