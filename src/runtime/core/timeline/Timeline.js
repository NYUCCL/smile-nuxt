/**
 * @fileoverview Timeline module for managing application routing and view sequencing
 * @module timeline
 */

import * as _lodash from 'lodash'

const _ = _lodash.default || _lodash
// NOTE: RecruitmentChooser and PresentationMode views are handled via
// route-based modes (/dev/, /presentation/) in Nuxt, not registered here.
// See runtime/pages/dev/ and runtime/pages/presentation/

/**
 * Timeline class for managing the sequence of routes in the application
 * @class Timeline
 * @param {object} api - API instance
 */
class Timeline {
  /**
   * Constructor for the Timeline class
   * @param {object} api - API instance
   */
  constructor(api) {
    this.api = api
    this.routes = [] // the actual routes given to VueRouter
    this.seqtimeline = [] // copies of routes that are sequential
    this.registered = {}
    this.type = 'timeline'
    this.has_welcome_anonymous = false
    this._IS_ROOT_NODE = '_IS_ROOT_NODE'
    // Register landing redirect: `/` → `welcome_anonymous`
    // NOTE: Dev-mode and presentation-mode routes are handled via extendPages
    // in the Nuxt module (Phase 8), not registered on the Timeline.
    this.registerView({
      path: '/',
      name: 'landing',
      redirect: {
        name: 'welcome_anonymous',
      },
      meta: { requiresConsent: false },
    })
  }

  /**
   * Clones a route and fills in default values
   * @param {object} route - The route to clone
   * @returns {object} The cloned route with default values
   */
  cloneRouteAndFillDefaults(route) {
    const newroute = _.cloneDeep(route)

    if (newroute.path == null) {
      const nameAsPath = `/${encodeURIComponent(newroute.name.toLowerCase().replace(/\s/g, '_'))}`
      // this.api.log.debug(`Assigning path by name for route ${newroute.name}: ${nameAsPath}`)
      newroute.path = nameAsPath
    }

    return newroute
  }

  /**
   * Pushes a route to the routes array
   * @param {object} route - The route to push
   * @throws {Error} If a route with the same path or name already exists
   */
  pushToRoutes(route) {
    for (let i = 0; i < this.routes.length; i += 1) {
      if (this.routes[i].path === route.path) {
        this.api.log.error(`Registering two routes to router with same path.  DuplicatePathError:${route.path}`)
        throw new Error(`DuplicatePathError:${route.path}`)
      }
      if (this.routes[i].name === route.name) {
        this.api.log.error(`Registering two routes to router with same name.  DuplicatePathError:${route.name}`)
        throw new Error(`DuplicateNameError:${route.name}`)
      }
    }
    this.routes.push(route)
  }

  /**
   * Pushes a route to the timeline array
   * @param {object} route - The route to push
   * @throws {Error} If a route with the same path or name already exists
   */
  pushToTimeline(route) {
    for (let i = 0; i < this.seqtimeline.length; i += 1) {
      if (this.seqtimeline[i].name === route.name) {
        this.api.log.error(`Registering two routes to timeline with same name.  DuplicateNameError:${route.name}`)
        throw new Error(`DuplicateNameError:${route.name}`)
      }
      if (this.seqtimeline[i].path === route.path) {
        this.api.log.error(`Registering two routes to timeline with same path.  DuplicatePathError:${route.path}`)
        throw new Error(`DuplicatePathError${route.path}`)
      }
    }
    this.seqtimeline.push(route)
  }

  /**
   * Pushes a sequential route to the timeline array
   * @param {object} routeConfig - The route configuration
   * @throws {Error} If a route with the same path or name already exists
   */
  pushSeqView(routeConfig) {
    const newroute = this.cloneRouteAndFillDefaults(routeConfig)

    if (!newroute.meta) {
      newroute.meta = { next: undefined, prev: undefined } // need to configure it
    }
    else {
      if (!newroute.meta.next) {
        // need to configure next
        newroute.meta.next = undefined
      }

      if (!newroute.meta.prev) {
        // need to configure prev
        newroute.meta.prev = undefined
      }
    }
    newroute.meta.type = 'route'
    newroute.meta.sequential = true
    newroute.meta.level = 0

    if (newroute.meta.requiresConsent == undefined) {
      newroute.meta.requiresConsent = true // default to require consent
    }

    if (newroute.meta.requiresDone == undefined) {
      newroute.meta.requiresDone = false // default to not require done
    }

    if (newroute.meta.requiresWithdraw == undefined) {
      newroute.meta.requiresWithdraw = false // default to not require done
    }

    try {
      this.pushToRoutes(newroute)
    }
    catch (err) {
      this.api.log.error('Smile FATAL ERROR: ', err)
      throw err
    }

    try {
      this.pushToTimeline(newroute) // by reference so should update together
    }
    catch (err) {
      this.api.log.error('Smile FATAL ERROR: ', err)
      throw err
    }

    if (newroute.name === 'welcome_anonymous') {
      this.has_welcome_anonymous = true
    }
  }

  /**
   * Registers a view in the timeline
   * @param {object} routeConfig - The route configuration
   * @throws {Error} If a route with the same path or name already exists
   */
  registerView(routeConfig) {
    const newroute = this.cloneRouteAndFillDefaults(routeConfig)
    // should NOT allow meta next/prev to exist
    if (!newroute.meta) {
      newroute.meta = { prev: null, next: null, type: 'route' }
    }
    else if (newroute.meta.prev || newroute.meta.next) {
      throw new Error(`NonSequentialRouteError: Can't have meta.next or meta.prev defined for non-sequential route`)
    }
    newroute.meta.sequential = false
    newroute.meta.level = 0

    if (newroute.meta.requiresConsent == undefined) {
      newroute.meta.requiresConsent = true // default to require consent
    }

    if (newroute.meta.requiresDone == undefined) {
      newroute.meta.requiresDone = false // default to not require done
    }

    if (newroute.meta.requiresWithdraw == undefined) {
      newroute.meta.requiresWithdraw = false // default to not require done
    }

    try {
      this.pushToRoutes(newroute)
    }
    catch (err) {
      this.api.log.error('Smile FATAL ERROR: ', err)
      throw err
    }

    if (newroute.name === 'welcome_anonymous') {
      this.has_welcome_anonymous = true
    }
  }

  /**
   * Pushes a randomized node to the timeline
   * @param {object} routeConfig - The route configuration
   * @param {boolean} [push] - Whether to push the node to the timeline
   */
  pushRandomizedNode(routeConfig, push = true) {
    const newroute = this.cloneRouteAndFillDefaults(routeConfig)

    if (!push) {
      if (this.registered[newroute.name]) {
        this.api.log.debug(`Randomized node ${newroute.name} already registered`)
        return
      }
      else {
        this.registered[newroute.name] = []
      }
    }

    // get options
    const options = newroute.options

    // get weights
    let weights = undefined
    if (newroute.weights) {
      weights = newroute.weights

      // check that options and weights are the same length
      if (options.length !== weights.length) {
        this.api.log.error('Length of options and weights do not match for randomized node')
        throw new Error('OptionsWeightsLengthMismatchError')
      }
    }

    // Use this.api.store instead of smilestore
    let randomOption = this.api.store.getRandomizedRouteByName(newroute.name)
    let currentRouteOptions = newroute.options
    let needsNewOption = false

    // is there already a selected option?
    if (randomOption != null) {
      // is the currently selected option actually one of the available options, as currently defined in the design file?
      const isContained = currentRouteOptions.some(
        option => option.length === randomOption.length && option.every((val, i) => val === randomOption[i]),
      )
      if (isContained) {
        // if yes,
        this.api.log.debug(`Randomized node ${newroute.name} already assigned option ${randomOption}`) // we can stick with the existing one
      }
      else {
        // otherwise, we need to select a new random option
        needsNewOption = true
        randomOption = this.api.sampleWithReplacement(options, 1, weights)[0]
        this.api.log.debug(`Randomized node ${newroute.name} selected option ${randomOption}`)
        this.api.store.setRandomizedRoute(newroute.name, randomOption)
      }
    }
    else {
      // also select new if there's no current option
      needsNewOption = true
    }

    if (needsNewOption) {
      randomOption = this.api.sampleWithReplacement(options, 1, weights)[0]
      this.api.log.debug(`Randomized node ${newroute.name} selected option ${randomOption}`)
      this.api.store.setRandomizedRoute(newroute.name, randomOption)
    }

    // now, pull entries from routes that match random Option names (for each random option)
    this._handleRandomizedOption(newroute, randomOption, push)
  }

  /**
   * Handles a randomized option
   * @param {object} newroute - The new route
   * @param {object} randomOption - The random option
   * @param {boolean} push - Whether to push the option to the timeline
   */
  _handleRandomizedOption(newroute, randomOption, push) {
    for (let i = 0; i < randomOption.length; i += 1) {
      const option = randomOption[i]
      const route = this.routes.find(r => r.name === option)
      if (!route) {
        if (option in this.registered) {
          // if the route(s) are in the registered list, pull it from there
          const registeredRoutes = this.registered[option]
          delete this.registered[option]
          if (registeredRoutes) {
            // TODO: Do we actually need to do this?
            registeredRoutes.forEach((r) => {
              // TODO: should we also set something about the parent? meta-parent?
              r.meta.level += 1
            })

            if (push) {
              registeredRoutes.forEach((r) => {
                this.pushToTimeline(r)
              })
            }
            else {
              this.registered[newroute.name].push(...registeredRoutes)
            }
          }
          continue
        }
        else {
          this.api.log.error(
            `Randomized node option ${option} not found in routes. You must add randomized route options to the timeline using registerView() before adding a randomized node`,
          )
          throw new Error('RandomizedNodeOptionNotFoundError')
        }
      }

      // Preserve existing meta (requiresConsent, requiresDone, etc.) while adding sequential fields
      route.meta = {
        ...route.meta,
        next: undefined,
        prev: undefined,
        sequential: true,
        level: 1,
        parentRandomizer: newroute.name,
      }

      if (push) {
        // add the route to the sequential timeline
        this.pushToTimeline(route)
      }
      else {
        // add the route to the registered list to be consumed later
        this.registered[newroute.name].push(route)
      }
    }
  }

  /**
   * Registers a randomized node
   * @param {object} routeConfig - The route configuration
   */
  registerRandomizedNode(routeConfig) {
    this.pushRandomizedNode(routeConfig, false)
  }

  /**
   * Pushes a conditional node to the timeline
   * @param {object} routeConfig - The route configuration
   * @param {boolean} [push] - Whether to push the node to the timeline
   */
  pushConditionalNode(routeConfig, push = true) {
    // newroute should have name and a condition name (user specified, has to match something in data.conditions)
    const newroute = this.cloneRouteAndFillDefaults(routeConfig)

    // Check if already registered if not pushing
    if (!push) {
      if (this.registered[newroute.name]) {
        this.api.log.debug(`Randomized node ${newroute.name} already registered`)
        return
      }
      else {
        this.registered[newroute.name] = []
      }
    }

    // get condition name—anything that's not name or path
    const conditionname = Object.keys(newroute).filter(key => key !== 'name' && key !== 'path')
    if (conditionname.length > 1) {
      this.api.log.error('Can only branch routes based on one condition at a time')
      throw new Error('TooManyConditionNamesError')
    }
    const name = conditionname[0]
    let assignedCondition = this.api.getConditionByName(name)
    if (!assignedCondition) {
      const possibleConditions = Object.keys(newroute[name])
      this.api.log.warn(
        `Condition ${name} not found in data.conditions -- assigning uniformly from keys of condition object: ${possibleConditions}`,
      )

      assignedCondition = this.api.randomAssignCondition({
        conditionname: possibleConditions,
      })
    }

    // based on assigned condition, get the correct set of routes

    const randomOption = newroute[name][assignedCondition]

    this._handleRandomizedOption(newroute, randomOption, push)
  }

  /**
   * Registers a conditional node
   * @param {object} routeConfig - The route configuration
   */
  registerConditionalNode(routeConfig) {
    this.pushConditionalNode(routeConfig, false)
  }

  /**
   * Builds the timeline
   */
  build() {
    if (!this.has_welcome_anonymous) {
      this.api.log.error('No welcome_anonymous route defined in src/user/design.js  This is required.')
      throw new Error('NoWelcomeAnonymousRouteError')
    }

    this.buildGraph()

    this.api.store.localState.seqtimeline = this.seqtimeline
    this.api.store.localState.routes = this.routes
  }

  /**
   * Builds the graph
   */
  buildGraph() {
    // this.api.log.debug('DEV MODE: building DAG for timeline')

    for (let i = 0; i < this.seqtimeline.length; i += 1) {
      if (this.seqtimeline[i].meta.next === undefined) {
        if (this.seqtimeline.length === 1) {
          this.seqtimeline[i].meta.next = null
        }
        else if (i === 0) {
          this.seqtimeline[i].meta.next = this.seqtimeline[i + 1].name
        }
        else if (i === this.seqtimeline.length - 1) {
          this.seqtimeline[i].meta.next = null
        }
        else {
          this.seqtimeline[i].meta.next = this.seqtimeline[i + 1].name
        }
      }
      if (!this.seqtimeline[i].meta.root && this.seqtimeline[i].meta.prev === undefined) {
        if (this.seqtimeline.length === 1) {
          this.seqtimeline[i].meta.prev = null
        }
        else if (i === 0) {
          this.seqtimeline[i].meta.prev = null
        }
        else if (i === this.seqtimeline.length - 1) {
          this.seqtimeline[i].meta.prev = this.seqtimeline[i - 1].name
        }
        else {
          this.seqtimeline[i].meta.prev = this.seqtimeline[i - 1].name
        }
      }
      else {
        this.seqtimeline[i].meta.prev = null
      }
    }
  }

  /**
   * Looks up a route config from the routes array by name.
   * Used by middleware to resolve name → path for redirects.
   * @param {string} name - The route name to look up
   * @returns {object | null} The matching route config, or null if not found
   */
  getRouteByName(name) {
    return this.routes.find(r => r.name === name) || null
  }

  /**
   * Looks up a route config from the routes array by path.
   * Used by the catch-all page to resolve which component to render.
   * @param {string} path - The URL path to look up
   * @returns {object | null} The matching route config, or null if not found
   */
  getViewForPath(path) {
    // Normalize path (strip trailing slash, etc.)
    const normalized = path === '' ? '/' : path.replace(/\/$/, '') || '/'

    // First try exact match, then pattern match for parameterized routes (e.g., /welcome/:service)
    let match = this.routes.find(r => r.path === normalized)
    if (!match) {
      match = this.routes.find((r) => {
        if (!r.path.includes(':')) return false
        // Convert route pattern like /welcome/:service to regex /^\/welcome\/([^/]+)$/
        const regex = new RegExp('^' + r.path.replace(/:[^/]+/g, '([^/]+)') + '$')
        return regex.test(normalized)
      })
    }
    if (!match) return null

    // Handle redirect routes (e.g., landing → welcome_anonymous)
    if (match.redirect) {
      return { redirect: match.redirect, meta: match.meta, name: match.name }
    }

    return {
      component: match.component,
      props: match.props || {},
      meta: match.meta,
      name: match.name,
    }
  }
}

export default Timeline
