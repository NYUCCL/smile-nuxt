/**
 * Ways into the `:` command palette and Docs mode from other dev components.
 *
 * - openCommandPalette(): the rail's button asks the palette to open
 * - docsJump: a page and heading for Docs mode to open (the palette's `:/`
 *   search); SmileDevDocsView takes it when it mounts or while it's open
 */
import { ref } from 'vue'

/** Bumped to ask the palette to open */
export const paletteRequests = ref(0)

export function openCommandPalette() {
  paletteRequests.value++
}

/** { path, hash } for Docs mode to open, or null */
export const docsJump = ref(null)
