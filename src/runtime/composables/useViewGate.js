/**
 * @module useViewGate
 * @description Keeps a view from showing until the files it lists under
 * `preload` (design.js) are in memory (#30). The pages that render timeline
 * views use it: while `gate.status` is not 'ready' they render PreloadingView
 * instead of the view.
 *
 * A view without a list, and a view whose files are already in memory (the
 * usual case, see plugins/preload.client.js), is ready in the same tick, so
 * nothing is drawn in between.
 */
import { reactive, watch } from 'vue'
import useAPI from './useAPI'
import usePreload from './usePreload'

/**
 * @param {import('vue').Ref<object|null|undefined>} viewConfig - The current
 *   view, as Timeline.getViewForPath() returns it
 * @returns {object} Reactive `{ status, view, urls, failed, retry }`. `status`
 *   is 'ready', 'loading' or 'failed'.
 */
export default function useViewGate(viewConfig) {
  const api = useAPI()
  const { preloader, urlsOf, urlsOfNow } = usePreload()

  const gate = reactive({
    status: 'ready',
    view: null, // the name of the view being waited for
    urls: [], // its files
    failed: [], // [{ url, error }] after a failed load
    retry: () => check(),
  })
  let run = 0 // a later check makes an earlier one's result void

  /**
   * Works out the current view's files and waits for them.
   * @returns {Promise<void>}
   */
  async function check() {
    const mine = ++run
    const config = viewConfig.value
    if (!config?.preload) {
      Object.assign(gate, { status: 'ready', view: config?.name ?? null, urls: [], failed: [] })
      return
    }
    let urls
    try {
      urls = urlsOfNow(config.preload, api)
      if (urls && preloader.report(urls).ok) {
        Object.assign(gate, { status: 'ready', view: config.name, urls, failed: [] })
        return
      }
      Object.assign(gate, { status: 'loading', view: config.name, urls: urls ?? [], failed: [] })
      if (!urls) {
        urls = await urlsOf(config.preload, api)
        if (mine !== run) return
        gate.urls = urls
      }
    }
    catch (err) {
      // The view's own preload function threw
      api.log.error(`PRELOAD: the preload list of view '${config.name}' could not be worked out: ${err?.message ?? err}`)
      Object.assign(gate, { status: 'failed', view: config.name, urls: [], failed: [{ url: '(the preload list)', error: String(err?.message ?? err) }] })
      return
    }
    const report = await preloader.loadAll(urls, { urgent: true })
    if (mine !== run) return
    // In the participant's record (browserData): how long they waited and
    // whether every file arrived
    api.recordWindowEvent('preload', {
      view: config.name,
      files: report.total,
      bytes: report.bytes,
      waited_ms: report.ms,
      failed: report.failed.map(item => item.url),
    })
    if (report.ok) {
      gate.status = 'ready'
      return
    }
    for (const { url, error } of report.failed) {
      api.log.error(`PRELOAD: ${url} could not be loaded: ${error}`)
    }
    gate.failed = report.failed
    gate.status = 'failed'
  }

  // 'sync': the status changes in the same tick as the view, so the new view
  // is never drawn before its files are checked
  watch(() => viewConfig.value?.name, check, { immediate: true, flush: 'sync' })

  return gate
}
