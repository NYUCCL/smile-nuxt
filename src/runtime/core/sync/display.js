// @ts-check
/**
 * What to show for the state of saving. One mapping, used by the
 * participant's indicator (builtins/SyncIndicator.vue) and by the dev tools
 * (the nav bar's database button, the side bar's progress and status table),
 * so they can't disagree.
 *
 * States:
 * - 'none'     no record on the server yet (changes are kept in the browser)
 * - 'saved'    the server has everything
 * - 'pending'  a change is waiting to be sent
 * - 'saving'   a save is on its way
 * - 'offline'  the browser is offline; saving goes on when it is back
 * - 'retrying' a save failed and will be tried again
 * - 'stopped'  saving has stopped and won't go on by itself (refused, over
 *              the size limit, over the limit on saves)
 * - 'paused'   another tab has the participant; this one doesn't save
 */

/** @typedef {import('./loop.js').SyncStatus} SyncStatus */
/** @typedef {import('./loop.js').SyncErrorKind} SyncErrorKind */

/**
 * The state to show (the list above).
 * @typedef {'none'|'saved'|'pending'|'saving'|'offline'|'retrying'|'stopped'|'paused'} SyncDisplayState
 */

/**
 * @typedef {object} SyncDisplay
 * @property {SyncDisplayState} state - The state to show
 * @property {string} label - A few words for the dev tools
 * @property {string|null} detail - The error's message
 * @property {boolean} active - Something is waiting or on its way
 * @property {boolean} problem - The data isn't reaching the server
 */

/** @type {Record<Exclude<SyncErrorKind, 'retrying'>, string>} */
const STOPPED_LABELS = {
  oversize: 'Not saved: the record is over the size limit',
  limit: 'Not saved: the limit on saves was reached',
  refused: 'Not saved: the server refused the save',
  conflict: 'Not saved: another copy saved something different',
}

/**
 * @param {object} input - The store's state
 * @param {boolean} input.loaded - A record exists on the server (browserEphemeral.dataLoaded)
 * @param {SyncStatus|null|undefined} input.sync - The sync loop's state (browserEphemeral.sync); read as 'saved' when missing
 * @param {boolean} [input.unsaved] - A change the server doesn't have (browserEphemeral.unsavedChanges)
 * @param {boolean|string} [input.otherTab] - Another tab has the participant (browserEphemeral.otherTab)
 * @returns {SyncDisplay}
 *   `label` is a few words for the dev tools; `detail` is the error's message;
 *   `active` is true while something is waiting or on its way; `problem` is
 *   true when the data isn't reaching the server
 */
export function syncDisplay({ loaded, sync, unsaved = false, otherTab = false }) {
  /**
   * @param {SyncDisplayState} state - The state to show
   * @param {string} label - A few words for the dev tools
   * @param {string|null} [detail] - The error's message
   * @returns {SyncDisplay} What to show
   */
  const make = (state, label, detail = null) => ({
    state,
    label,
    detail,
    active: state === 'pending' || state === 'saving',
    problem: state === 'offline' || state === 'retrying' || state === 'stopped' || state === 'paused',
  })
  if (otherTab) return make('paused', 'Paused: open in another tab')
  const status = sync?.status ?? 'saved'
  const error = sync?.error ?? null
  if (status === 'offline') return make('offline', 'Offline: will save when back', error?.message ?? null)
  if (status === 'error') {
    if (!error || error.kind === 'retrying') return make('retrying', 'Save failed: trying again', error?.message ?? null)
    return make('stopped', STOPPED_LABELS[error.kind] ?? 'Not saved', error.message ?? null)
  }
  if (!loaded) return make('none', 'No record yet')
  if (status === 'saving') return make('saving', 'Saving')
  if (status === 'pending' || unsaved) return make('pending', 'Unsaved changes')
  return make('saved', 'Saved')
}
