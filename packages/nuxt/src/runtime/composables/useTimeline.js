/**
 * @module useTimeline
 * @description Timeline management composable for handling view navigation in the SMILE framework.
 * Provides functionality for:
 * - Sequential navigation between views
 * - Route metadata handling
 * - Navigation state management
 * - Next/previous view lookups
 *
 * The timeline ensures proper view sequencing and maintains navigation state by:
 * - Checking route metadata for navigation rules
 * - Handling navigation guards
 * - Managing query parameters between routes
 * - Providing navigation utilities for views
 */
import { useRoute, useRouter, navigateTo as nuxtNavigateTo } from '#imports'
import useSmileStore from '../stores/smilestore'
import useLog from '../stores/log'

/**
 * Timeline management composable for handling view navigation
 * @function useTimeline
 * @returns {Object} Timeline methods and utilities
 * @description Provides functionality for sequential navigation between views, including:
 * - Looking up next/previous views in the navigation sequence
 * - Navigating between views with optional force parameter
 * - Checking navigation state and route metadata
 * The timeline ensures proper view sequencing and navigation guard handling.
 */
export default function useTimeline() {
  const smilestore = useSmileStore()
  const route = useRoute()
  const router = useRouter()
  const log = useLog()

  /**
   * Looks up the next route in the navigation sequence for a given route name
   * @param {string} routeName - The name of the route to look up the next route for
   * @returns {Object|null} Route object with name and query params, or null if no next route found
   */
  const lookupNext = (routeName) => {
    // TODO: In Nuxt, experiment routes are not registered with Vue Router.
    // This method currently uses router.getRoutes() which returns Nuxt's routes,
    // not SMILE timeline routes. Will need to use Timeline.routes instead
    // once the catch-all route integration is complete (Phase 5).
    const routes = router.getRoutes()

    // Find the specified route
    const currentRoute = routes.find((r) => r.name === routeName)
    if (!currentRoute) return null

    // If the route has a next property, find that route
    if (currentRoute.meta?.next) {
      const nextRoute = routes.find((r) => r.name === currentRoute.meta.next)
      if (nextRoute) {
        return {
          name: nextRoute.name,
          query: route.query,
        }
      }
    }
    return null
  }

  /**
   * Gets the next view in the navigation sequence based on current route metadata
   * @returns {Object|null} Route object with name and query params, or null if no next view
   */
  const nextView = () => {
    if (route.meta.next) {
      return { name: route.meta.next, query: route.query }
    }
    return null
  }

  /**
   * Gets the previous view in the navigation sequence based on current route metadata
   * @returns {Object|null} Route object with name and query params, or null if no previous view
   */
  const prevView = () => {
    if (route.meta.prev) {
      return { name: route.meta.prev, query: route.query }
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
    // unfortunately this is required because the router
    // doesn't allow you to pass configuration options
    // directly to the router.push() function
    // although there's some plan about it in future
    if (force) {
      smilestore.browserEphemeral.forceNavigate = true
      await nuxtNavigateTo({ name: view })
      smilestore.browserEphemeral.forceNavigate = false
    } else {
      await nuxtNavigateTo({ name: view })
    }
  }

  /**
   * Internal navigation handler that manages state updates and data saving
   * @private
   * @param {Object} goto - Route object to navigate to
   */
  const _doNavigate = (goto) => {
    // sets the current page as done
    smilestore.dev.currentViewDone = true

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
