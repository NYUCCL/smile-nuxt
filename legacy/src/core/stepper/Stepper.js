import { StepState } from '@/core/stepper/StepState'
import config from '@/core/config'
import { StepperSerializer } from '@/core/stepper/StepperSerializer'
import StepperProxy from '@/core/stepper/StepperProxy'
import useLog from '@/core/stores/log'
import seedrandom from 'seedrandom'

// to be implemented functions

// some write operations should be named and only go once
// others should go repeatedly

// shuffle() - done
// append() - done
// outer()  - done
// forEach() - done/tests? - broken currently
// zip()  - done

// TO BE IMPLEMENTED IN THE FUTURE
// sample() - mid priorty
// range() - mid priorty
// repeat()  tricky?
// interleave()  low priority
// print()  low priority
// partition()  low priority

/**
 * @class Stepper
 * @extends StepState
 * @description A specialized version of StepState that provides stepper-specific functionality.
 * This class extends the base StepState to add stepper-specific operations and data handling.
 */
export class Stepper extends StepState {
  /**
   * Creates a new Stepper instance
   * @param {Object} [options] - Configuration options for the stepper
   * @param {*} [options.id] - The id for this node. If null, defaults to '/'
   * @param {StepState|null} [options.parent] - The parent node. If null, this is a root node
   * @param {string} [options.serializedState] - Optional serialized JSON state to load
   * @param {Object} [options.store] - Optional reference to the store where this stepper is saved
   */
  constructor(options = {}) {
    const { id = null, parent = null, data = null, serializedState = null, store = null } = options
    const log = useLog()
    super(id, parent, data)

    // Store the store reference
    this._store = store
    this._log = log
    this._shuffled = false // Add shuffled property
    this._onModify = null // Add callback property
    this._needsWrite = false // Track if we need to write

    // If serialized state is provided, load it
    if (serializedState !== null) {
      this._log.debug('STEPSTATE:loading serialized state')
      this.loadFromJSON(serializedState)
    }

    return new StepperProxy(this)
  }

  /**
   * Sets a callback to be called when the stepper is modified
   * @param {Function} callback - The callback function to call on modification
   */
  setOnModify(callback) {
    this._onModify = callback
  }

  /**
   * Marks the stepper as needing a write and triggers the modify callback
   * @private
   */
  _markForWrite() {
    this._needsWrite = true
    if (this._onModify) {
      this._onModify()
    }
  }
  /**
   * Creates a new state instance. Overridden to return Stepper instances.
   * @protected
   * @param {*} id - The id for the new state
   * @param {StepState} parent - The parent state
   * @returns {Stepper} A new Stepper instance
   */
  _createNew(id, parent) {
    return new Stepper({ id, parent })
  }

  /**
   * Checks if any of the given items would create duplicate paths in the tree
   * @private
   * @param {Object|Array<Object>} items - Single object or array of objects to check for duplicates
   * @param {string} [items[].id] - Optional path property on each item
   * @returns {boolean} True if any items would create duplicate paths, false otherwise
   * @description
   * This method checks for duplicates in two ways:
   * 1. Checks for duplicate paths among the input items themselves
   * 2. Checks if any new items would create paths that already exist in the tree
   * 3. Checks if any new items have the same data content as existing items
   */
  _hasDuplicatePaths(items) {
    // Convert single item to array if needed
    const itemsToCheck = Array.isArray(items) ? items : [items]

    // First check for duplicates among the input items
    const seenPaths = new Set()
    const seenData = new Set()
    for (const item of itemsToCheck) {
      // Check for explicit path duplicates
      if (item.id !== undefined) {
        if (seenPaths.has(item.id)) {
          return true
        }
        seenPaths.add(item.id)
      }

      // Check for data content duplicates
      const dataStr = JSON.stringify(item)
      if (seenData.has(dataStr)) {
        return true
      }
      seenData.add(dataStr)
    }

    // Get all existing paths in the tree
    const existingPaths = this.existingPaths
    const existingData = new Set(this._states.map((state) => JSON.stringify(state.data)))

    // Check if any new items would create duplicate paths with existing ones
    return itemsToCheck.some((item) => {
      // Create a temporary state to get its path
      let state
      if (item.id !== undefined) {
        state = new Stepper({ id: item.id, parent: this })
      } else {
        state = new Stepper({ parent: this })
      }
      state.data = item
      const newPath = state.pathString

      // Check both path and data content
      return existingPaths.has(newPath) || existingData.has(JSON.stringify(item))
    })
  }

  /**
   * Creates a new state and assigns data to it
   * @private
   * @param {Object} item - The item to create a state for
   * @returns {Stepper} The newly created state
   * @description
   * If the item contains an 'id' field, it will be used as the state's id.
   */
  _addState(item) {
    let state
    try {
      // Create a new state with auto-incremented id
      if (item.id !== undefined) {
        state = this.push(item.id, item)
      } else {
        state = this.push(null, item)
      }
    } catch (error) {
      this._log.error(error.message)
    }
    return state
  }

  /**
   * Appends one or more objects as new states to the current node
   * @param {Object|Array<Object>} items - Single object or array of objects to append as new states
   * @returns {Stepper} Returns this instance for method chaining
   * @throws {Error} If items is not an object or array, or if adding items would exceed maxSteps
   */
  append(items) {
    this._log.debug('\tappend', items)
    // Convert single item to array if needed
    const itemsToAdd = Array.isArray(items) ? items : [items]

    // Check if adding these items would exceed maxSteps
    if (this._states.length + itemsToAdd.length > config.maxSteps) {
      this._log.error(`Cannot append ${itemsToAdd.length} rows as it exceeds the safety limit of ${config.maxSteps}`)
      throw new Error(`Cannot append ${itemsToAdd.length} rows as it exceeds the safety limit of ${config.maxSteps}`)
    }

    // Try to add each item individually
    itemsToAdd.forEach((item) => {
      // Check if this specific item would create a duplicate path
      if (this._hasDuplicatePaths(item)) {
        this._log.warn(`Warning: Skipping item that would create duplicate path`)
      } else {
        this._addState(item)
      }
    })

    this._markForWrite()
    return this
  }

  /**
   * Creates a factorial combination (Cartesian product) of all provided arrays.
   * Each combination will be a row in the resulting table.
   *
   * @param {Object} trials - Object with arrays as values
   * @param {Function} [idGenerator] - Optional function to generate custom IDs for each combination
   * @returns {Stepper} Returns this instance for method chaining
   * @throws {Error} If trials is not an object or if operation would exceed maxSteps
   */
  outer(trials, idGenerator = null) {
    if (typeof trials !== 'object' || trials === null) {
      throw new Error('outer() requires an object with arrays as values')
    }

    const columns = Object.entries(trials)
    if (columns.length === 0) {
      throw new Error('outer() requires at least one column')
    }

    // Convert non-array values to single-element arrays
    const processedColumns = columns.map(([key, value]) => {
      if (Array.isArray(value)) return [key, value]
      return [key, [value]]
    })

    // Calculate total number of combinations
    const totalCombinations = processedColumns.reduce((total, [_, arr]) => total * arr.length, 1)

    // Check if adding these combinations would exceed maxSteps
    if (this._states.length + totalCombinations > config.maxSteps) {
      throw new Error(
        `Cannot create ${totalCombinations} combinations: would exceed maximum of ${config.maxSteps} rows`
      )
    }

    // Helper function to generate combinations
    function generateCombinations(arrays) {
      if (arrays.length === 0) return [{}]

      const [key, values] = arrays[0]
      const rest = arrays.slice(1)
      const restCombinations = generateCombinations(rest)

      return values.flatMap((value) =>
        restCombinations.map((combo) => ({
          [key]: value,
          ...combo,
        }))
      )
    }

    const outerRows = generateCombinations(processedColumns)

    // Try to add each combination individually
    outerRows.forEach((row) => {
      // If an idGenerator function is provided, use it to generate the ID
      if (typeof idGenerator === 'function') {
        row.id = idGenerator(row)
      }

      // Check if this specific combination would create a duplicate path
      if (this._hasDuplicatePaths(row)) {
        this._log.warn(`Warning: Skipping combination that would create duplicate path`)
      } else {
        this._addState(row)
      }
    })

    this._markForWrite()
    return this
  }

  /**
   * Combines multiple arrays into a single table by matching elements at corresponding indices.
   * Supports different methods for handling arrays of different lengths.
   *
   * @param {Object} trials - Object with arrays as values
   * @param {Function|Object} [idGeneratorOrOptions] - Either a function to generate custom IDs or options object
   * @param {Object} [options] - Options for handling arrays of different lengths (only used if idGeneratorOrOptions is a function)
   * @param {string} [options.method] - Method to use: 'loop', 'pad', or 'last'
   * @param {*} [options.padValue] - Value to use for padding when method is 'pad'
   * @returns {Stepper} Returns this instance for method chaining
   * @throws {Error} If trials is not an object or if operation would exceed maxSteps
   */
  zip(trials, idGeneratorOrOptions = {}, options = {}) {
    if (typeof trials !== 'object' || trials === null) {
      throw new Error('zip() requires an object with arrays as values')
    }

    // Handle both API styles:
    // 1. zip(trials, options)
    // 2. zip(trials, idGenerator, options)
    const idGenerator = typeof idGeneratorOrOptions === 'function' ? idGeneratorOrOptions : null
    const actualOptions = typeof idGeneratorOrOptions === 'function' ? options : idGeneratorOrOptions

    const columns = Object.entries(trials)
    if (columns.length === 0) {
      throw new Error('zip() requires at least one column')
    }

    // Convert non-array values to single-element arrays
    const processedColumns = columns.map(([key, value]) => {
      if (Array.isArray(value)) return [key, value]
      return [key, [value]]
    })

    // Get the maximum length of any column
    const maxLength = Math.max(...processedColumns.map(([_, arr]) => arr.length))

    // Check if adding these combinations would exceed maxSteps
    if (this._states.length + maxLength > config.maxSteps) {
      throw new Error(`Cannot create ${maxLength} combinations: would exceed maximum of ${config.maxSteps} rows`)
    }

    // Check if any column has a different length
    const hasDifferentLengths = processedColumns.some(([_, arr]) => arr.length !== maxLength)

    // By default, throw error if lengths are different
    if (hasDifferentLengths && !actualOptions.method) {
      throw new Error(
        'All columns must have the same length when using zip(). Specify a method (loop, pad, last) to handle different lengths.'
      )
    }

    // Helper function to adjust array length
    const adjustArrayLength = (arr, targetLength, method, padValue) => {
      if (arr.length === targetLength) return arr

      if (method === 'loop') {
        const result = []
        for (let i = 0; i < targetLength; i++) {
          result.push(arr[i % arr.length])
        }
        return result
      } else if (method === 'pad' || method === 'last') {
        const value = method === 'last' ? arr[arr.length - 1] : padValue
        return [...arr, ...Array(targetLength - arr.length).fill(value)]
      }
      return arr
    }

    // Process each column according to the specified method
    const processedArrays = processedColumns.map(([key, arr]) => {
      if (arr.length === maxLength) return arr

      const method = actualOptions.method
      const padValue = actualOptions.padValue

      if (method === 'loop') {
        return adjustArrayLength(arr, maxLength, 'loop')
      } else if (method === 'pad') {
        if (padValue === undefined) {
          throw new Error('padValue is required when using the pad method')
        }
        return adjustArrayLength(arr, maxLength, 'pad', padValue)
      } else if (method === 'last') {
        return adjustArrayLength(arr, maxLength, 'pad', arr[arr.length - 1])
      } else {
        throw new Error(`Invalid method: ${method}. Must be one of: loop, pad, last`)
      }
    })

    // Create the zipped rows
    const zippedRows = Array(maxLength)
      .fill(null)
      .map((_, i) => {
        const row = {}
        processedColumns.forEach(([key], colIndex) => {
          row[key] = processedArrays[colIndex][i]
        })
        return row
      })

    // Try to add each combination individually
    zippedRows.forEach((row) => {
      // If an idGenerator function is provided, use it to generate the ID
      if (typeof idGenerator === 'function') {
        row.id = idGenerator(row)
      }

      // Check if this specific combination would create a duplicate path
      if (this._hasDuplicatePaths(row)) {
        this._log.warn(`Warning: Skipping combination that would create duplicate path`)
      } else {
        this._addState(row)
      }
    })

    this._markForWrite()
    return this
  }

  /**
   * Shuffles the current states using the Fisher-Yates algorithm.
   * If a seed is provided, ensures deterministic shuffling.
   *
   * @param {Object} options - Options for shuffling
   * @param {string} [options.seed] - Optional seed for deterministic shuffling
   * @param {boolean} [options.always=false] - If true, allows shuffling even if already shuffled
   * @returns {Stepper} Returns this instance for method chaining
   */
  shuffle(options = {}) {
    const { seed = null, always = false } = typeof options === 'string' ? { seed: options } : options

    // Skip if already shuffled and always is false
    if (this._shuffled && !always) {
      return this
    }

    // Skip if there's only one or zero states
    if (this._states.length <= 1) return this

    // Create RNG function - either seeded or Math.random
    let rng
    if (seed) {
      // Create a new seeded RNG instance
      const seededRng = seedrandom(seed)
      rng = () => seededRng()
    } else {
      rng = Math.random
    }

    // For other depths, shuffle all elements
    for (let i = this._states.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[this._states[i], this._states[j]] = [this._states[j], this._states[i]]

      // Update indices for the swapped elements
      this._states[i]._currentIndex = i
      this._states[j]._currentIndex = j
    }

    // Mark as shuffled
    this._shuffled = true

    this._markForWrite()
    return this
  }

  /**
   * Executes a function once for each item in the table.
   * Returns the table for chaining.
   *
   * Note: While the 'id' field can be modified through forEach, doing so will throw an error
   * if it would create duplicate paths. IDs should generally be set during node creation
   * (via append, outer, or zip) to avoid potential conflicts.
   *
   * @param {Function} callback - Function to execute for each element
   * @param {Stepper} callback.item - The current item being processed
   * @param {number} callback.index - The index of the current item
   * @returns {Stepper} The current instance for chaining
   */
  forEach(callback) {
    this._states.forEach((item, index) => {
      // Call the callback and check if it returns a new value
      const result = callback(item, index)
      if (result !== undefined) {
        // If result is an object with properties from the proxy, extract just the data properties
        if (typeof result === 'object' && result !== null) {
          // Create a new data object by starting with the original data
          const newData = { ...item.data }

          // Add or update properties from the result object
          // This allows new properties to be added that weren't in the original data
          Object.keys(result).forEach((key) => {
            // Only copy properties that are not internal properties of the Stepper
            if (
              key !== '_id' &&
              key !== '_states' &&
              key !== '_parent' &&
              key !== '_path' &&
              key !== 'data' &&
              typeof result[key] !== 'function'
            ) {
              newData[key] = result[key]
            }
          })

          // Check for duplicate paths before updating
          if (this._hasDuplicatePaths(newData)) {
            throw new Error('Cannot update item: would create duplicate paths')
          }

          item.data = newData
        }
      }
    })
    this._markForWrite()
    return this
  }

  /**
   * Serializes the StepState object to a JSON string.
   * @returns {string} A JSON representation of the StepState object
   */
  get json() {
    return StepperSerializer.serialize(this)
  }

  /**
   * Deserializes a JSON string to a StepState object.
   * @param {string} data - The JSON string to deserialize
   */
  loadFromJSON(data) {
    StepperSerializer.deserialize(data, this, this)
  }

  /**
   * Visualizes the Stepper object as a tree structure.
   * Used by the dev bar to display the stepper tree.
   * @returns {Object} A clean object representation of the Stepper tree
   */
  visualize() {
    // Helper function to recursively process each state
    const processState = (state, level = 0) => {
      // Create a clean object without currentIndex, depth, and parent
      const cleanState = {
        data: state.data,
        path: state.pathString,
        index: state.index,
        isLeaf: state.isLeaf,
        isFirstLeaf: state.isFirstLeaf,
        rows: [],
      }

      // Process each child state
      state.rows.forEach((childState) => {
        cleanState.rows.push(processState(childState, level + 1))
      })

      return cleanState
    }

    // Process the root state
    return processState(this.root)
  }

  /**
   * Saves the current stepper state to the store
   * @param {string} [page] - Optional page name to save under. If not provided, uses the stepper's name
   * @returns {boolean} True if save was successful, false otherwise
   */
  save(page = null) {
    if (!this._store) {
      this._log.warn('Stepper: Cannot save state - no store reference available')
      return false
    }

    const targetPage = page || this.name
    if (!targetPage) {
      this._log.warn('Stepper: Cannot save state - no page name provided and stepper has no name')
      return false
    }

    // Get current localStorage data
    const existingLocalStorage = JSON.parse(localStorage.getItem(this._store.config.localStorageKey) || '{}')

    // Update the viewSteppers in the localStorage data
    if (!existingLocalStorage.viewSteppers) {
      existingLocalStorage.viewSteppers = {}
    }
    existingLocalStorage.viewSteppers[targetPage] = {
      data: {
        stepperState: this.json,
      },
    }

    // Save back to localStorage
    localStorage.setItem(this._store.config.localStorageKey, JSON.stringify(existingLocalStorage))

    // Also update the store for consistency
    this._store.browserPersisted.viewSteppers[targetPage] = {
      data: {
        stepperState: this.json,
      },
    }

    return true
  }

  /**
   * Completely clears all states and resets to initial condition
   * Removes all child states and resets all internal properties
   * does _not_ clear the data from the current node
   */
  clearSubTree() {
    super.clearSubTree()

    this._shuffled = false
  }

  /**
   * Clears all data from the current step by calling clearData()
   * Does not affect child nodes or the structure of the state tree
   * @returns {void}
   */
  clearCurrentStepData() {
    // Get the current leaf node
    let current = this._root
    while (current._states.length > 0) {
      current = current._states[current._currentIndex]
    }
    // Clear data on the current leaf node
    current.clearData()
  }
}

export default Stepper
