import { defineNuxtPlugin, useRuntimeConfig } from '#imports'
import useAPI from '../composables/useAPI'
import usePreload from '../composables/usePreload'

/**
 * Starts loading the files the views list under `preload` (design.js) when
 * the app has mounted, in timeline order, behind whatever the current view
 * is waiting for. By the time the participant reaches a view its files are
 * usually in memory and the view shows at once; if they are not, the page
 * waits for them (composables/useViewGate.js). Off with
 * `smile: { preloadAhead: false }` in nuxt.config.ts (#30).
 */
/** @type {import('#app').Plugin} */
export default defineNuxtPlugin((nuxtApp) => {
  if (useRuntimeConfig().public?.smile?.preloadAhead === false) return
  const api = useAPI()
  const { preloader, urlsOf } = usePreload()

  nuxtApp.hook('app:mounted', async () => {
    const timeline = nuxtApp.$timeline
    if (!timeline) return
    // The sequence first, in order; then views reached another way (registered
    // views, branches of a randomized or conditional node)
    const views = [...timeline.seqtimeline, ...timeline.routes.filter(route => !timeline.seqtimeline.includes(route))]
    for (const view of views) {
      if (!view.preload) continue
      let urls
      try {
        urls = await urlsOf(view.preload, api)
      }
      catch {
        // A list that depends on something not set yet (a condition, say).
        // The view's own wait works it out again when it is reached.
        continue
      }
      preloader.loadAll(urls) // not awaited: the queue keeps the order
    }
  })
})
