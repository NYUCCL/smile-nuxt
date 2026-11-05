/**
 * The dev tools' modes (store.dev.mainView), in rail order. One list, read by
 * the app menu rail (SmileDevAppMenu.vue) and the `:` command palette
 * (palette/commands.js). The dashboard ('dashboard', Database icon) comes back
 * here when it's ready.
 *
 * - view: the store.dev.mainView value
 * - label: the rail's tooltip
 * - command / aliases: what you type in the command palette
 */
import { BookMarked, BugPlay, Presentation, SlidersHorizontal } from 'lucide-vue-next'

export const DEV_MODES = [
  { view: 'devmode', icon: BugPlay, label: 'Developer mode', command: 'dev', aliases: ['devmode', 'developer'] },
  { view: 'presentation', icon: Presentation, label: 'Presentation mode', command: 'pres', aliases: ['presentation'] },
  // Docs mode: dev server only (layouts/development.vue)
  ...(import.meta.dev
    ? [{ view: 'docs', icon: BookMarked, label: 'Docs', command: 'docs', aliases: ['documentation'] }]
    : []),
  { view: 'config', icon: SlidersHorizontal, label: 'Build & deploy settings', command: 'config', aliases: ['settings', 'build'] },
]
