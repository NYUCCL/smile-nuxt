/**
 * @module useTimeline
 * @description Timeline management composable for handling view navigation in the SMILE framework.
 * Provides functionality for:
 * - Sequential navigation between views
 * - Route metadata handling
 * - Navigation state management
 * - Next/previous view lookups
 *
 * In the Nuxt module, experiment routes are NOT registered with Vue Router
 * (they all hit the catch-all route). So route metadata (next, prev, etc.)
 * is looked up from $timeline.getViewForPath() instead of route.meta.
 *
 * Route paths under /dev/ and /presentation/ are transparently handled:
 * the prefix is stripped for timeline lookups and re-added for navigation.
 */
import { useRoute, useRouter, useNuxtApp, navigateTo as nuxtNavigateTo } from '#imports'
import useSmileStore from '../stores/smilestore'
import useLog from '../stores/log'

/**
 * Timeline management composable for handling view navigation
 * @function useTimeline
 * @returns {Object} Timeline methods and utilities
 */
export default function useTimeline() {
  const smilestore = useSmileStore()
  const route = useRoute()
  const router = useRouter()
  const log = useLog()

  /**
   * Detects the current route prefix ('/dev', '/presentation', or '').
   * @returns {string} The prefix string
   */
  const _getRoutePrefix = () => {
    const path = route.path
    if (path.startsWith('/dev/') || path === '/dev') return '/dev'
    if (path.startsWith('/presentation/') || path === '/presentation') return '/presentation'
    return ''
  }

  /**
   * Strips /dev or /presentation prefix from a path to get the experiment path.
   * @param {string} path - The full route path
   * @returns {string} The experiment path without prefix
   */
  const _stripPrefix = (path) => {
    return path.replace(/^\/(dev|presentation)(\/|$)/, '/') || '/'
  }

  /**
   * Gets the timeline route config for the current path.
   * Strips /dev or /presentation prefix before lookup.
   * Falls back to null if $timeline isn't available yet.
   */
  const _getTimelineRoute = () => {
    const nuxtApp = useNuxtApp()
    const timeline = nuxtApp.$timeline
    if (!timeline) return null
    const experimentPath = _stripPrefix(route.path)
    return timeline.getViewForPath(experimentPath)
  }

  /**
   * Looks up the next route in the navigation sequence for a given route name
   * @param {string} routeName - The name of the route to look up the next route for
   * @returns {Object|null} Route object with path and query params, or null if no next route found
   */
  const lookupNext = (routeName) => {
    const nuxtApp = useNuxtApp()
    const timeline = nuxtApp.$timeline
    if (!timeline) return null

    const currentRoute = timeline.getRouteByName(routeName)
    if (!currentRoute) return null

    if (currentRoute.meta?.next) {
      const nextRoute = timeline.getRouteByName(currentRoute.meta.next)
      if (nextRoute) {
        const prefix = _getRoutePrefix()
        return {
          path: prefix + nextRoute.path,
          query: route.query,
        }
      }
    }
    return null
  }

  /**
   * Gets the next view in the navigation sequence based on current route metadata
   * @returns {Object|null} Route object with path and query params, or null if no next view
   */
  const nextView = () => {
    const config = _getTimelineRoute()
    if (config?.meta?.next) {
      const nuxtApp = useNuxtApp()
      const timeline = nuxtApp.$timeline
      const nextRoute = timeline?.getRouteByName(config.meta.next)
      if (nextRoute) {
        const prefix = _getRoutePrefix()
        return { path: prefix + nextRoute.path, query: route.query }
      }
    }
    return null
  }

  /**
   * Gets the previous view in the navigation sequence based on current route metadata
   * @returns {Object|null} Route object with path and query params, or null if no previous view
   */
  const prevView = () => {
    const config = _getTimelineRoute()
    if (config?.meta?.prev) {
      const nuxtApp = useNuxtApp()
      const timeline = nuxtApp.$timeline
      const prevRoute = timeline?.getRouteByName(config.meta.prev)
      if (prevRoute) {
        const prefix = _getRoutePrefix()
        return { path: prefix + prevRoute.path, query: route.query }
      }
    }
    return null
  }

  /**
   * Navigates to a specific view with optional force parameter
   * @param {string} view - Name of the view to navigate to
   * @param {boolean} [force=true] - Whether to force navigation by temporarily disabling navigation guards
   * @returns {Promise<void>}
   */
  const goToView = async (view, force = true) => {
    // Look up path from timeline since experiment routes aren't in Vue Router
    const nuxtApp = useNuxtApp()
    const timeline = nuxtApp.$timeline
    const targetRoute = timeline?.getRouteByName(view)
    const basePath = targetRoute ? targetRoute.path : `/${view}`
    const prefix = _getRoutePrefix()
    const target = prefix + basePath

    if (force) {
      smilestore.browserEphemeral.forceNavigate = true
      await nuxtNavigateTo(target)
      smilestore.browserEphemeral.forceNavigate = false
    } else {
      await nuxtNavigateTo(target)
    }
  }

  /**
   * Internal navigation handler that manages state updates and data saving
   * @private
   * @param {Object} goto - Route object to navigate to (with path, not name)
   */
  const _doNavigate = (goto) => {
    // sets the current page as done
    smilestore.browserEphemeral.currentViewDone = true

    if (smilestore.config.autoSave) {
      log.log('TIMELINE STEPPER: Attempting auto saving on navigation')
      smilestore.saveData() // automatically saves data
    }
    if (goto) nuxtNavigateTo(goto)
  }

  /**
   * Navigates to the next view in sequence, optionally executing a callback first
   * @param {Function} [fn] - Optional callback to execute before navigation
   */
  const goNextView = (fn) => {
    if (fn) fn()
    _doNavigate(nextView())
  }

  /**
   * Navigates to the previous view in sequence, optionally executing a callback first
   * @param {Function} [fn] - Optional callback to execute before navigation
   */
  const goPrevView = (fn) => {
    if (fn) fn()
    _doNavigate(prevView())
  }

  return { goNextView, goPrevView, goToView, lookupNext, nextView, prevView }
}
