/**
 * @module sync/tabs
 * @description Two tabs of the same experiment (plans/sync_engine.md, step 5).
 *
 * Tabs of one browser share the cookie and the local snapshot, so only one
 * of them can be the participant's. The rule: the tab opened last is. A tab
 * says `hello` on a BroadcastChannel once it holds the participant's record;
 * every older tab that holds it too stops saving and shows a notice
 * (the store's `pauseForOtherTab`). A reload makes a tab the newest again.
 *
 * Plain functions: the channel is passed in. Nothing here throws, whatever
 * arrives on the channel.
 */

/**
 * Whether tab `a` was opened after tab `b`. The id settles a tie, so two
 * tabs never both think they are the newer one.
 * @param {{ startedAt: number, id: string }} a - A tab
 * @param {{ startedAt: number, id: string }} b - Another
 * @returns {boolean} True when `a` is the newer
 */
export function isNewer(a, b) {
  if (a.startedAt !== b.startedAt) return a.startedAt > b.startedAt
  return a.id > b.id
}

function readHello(message) {
  if (message === null || typeof message !== 'object' || message.type !== 'hello') return null
  if (typeof message.id !== 'string' || !message.id) return null
  if (typeof message.startedAt !== 'number' || !Number.isFinite(message.startedAt)) return null
  return { id: message.id, startedAt: message.startedAt }
}

/**
 * @param {object} deps - What the guard works with
 * @param {object|null} deps.channel - A BroadcastChannel (`postMessage`,
 *   `onmessage`), or null where there is none: the guard then does nothing,
 *   and the server's 409 is what stops the older tab
 * @param {string} deps.id - This tab's id
 * @param {number} deps.startedAt - When this tab's page started
 * @param {Function} deps.isActive - () => boolean: this tab holds the
 *   participant's record and has not been paused
 * @param {Function} deps.onOtherTab - A newer tab holds the record now
 * @returns {{ announce: Function, close: Function }} `announce()` when this
 *   tab's record is loaded
 */
export function createTabGuard({ channel, id, startedAt, isActive, onOtherTab }) {
  const me = { id, startedAt }
  const post = () => {
    try {
      channel?.postMessage({ type: 'hello', id, startedAt })
    }
    catch {
      // a closed channel: the 409 covers it
    }
  }
  if (channel) {
    channel.onmessage = (event) => {
      try {
        const other = readHello(event?.data)
        if (!other || other.id === id || !isActive()) return
        if (isNewer(other, me)) onOtherTab()
        // An older tab that loaded after this one (two tabs restored
        // together): tell it, so it is the one that stops
        else post()
      }
      catch {
        // a message this tab can't use is ignored
      }
    }
  }
  return {
    announce: post,
    close() {
      try {
        if (channel) channel.onmessage = null
        channel?.close?.()
      }
      catch {
        // nothing to close
      }
    },
  }
}
