import { fakerDistributions } from '../../utils/randomization.js'
import useLog from '../../stores/log.js'

/**
 * @class StepperSerializer
 * @description Handles serialization and deserialization of Stepper objects
 */
export class StepperSerializer {
  /**
   * Serializes a Stepper object to a JSON-compatible format
   * @param {Stepper} Stepper - The Stepper instance to serialize
   * @returns {object} A JSON-compatible representation of the Stepper object
   */
  static serialize(Stepper) {
    /**
     * Helper function to clean non-serializable data from a Stepper object
     * @private
     * @param {object} data - The data object to clean
     * @returns {object} A cleaned data object with non-serializable values removed or transformed
     *
     * Handles:
     * - Faker functions (preserved as special objects with __fakerFunction flag)
     * - Vue components (preserved as special objects with __vueComponent flag)
     * - Functions (removed unless they are faker functions)
     * - DOM elements (removed)
     * - RegExp objects (removed)
     * - Undefined values (removed)
     */
    const cleanData = (data) => {
      if (!data) return data
      const cleaned = {}
      let keys
      try {
        keys = Object.keys(data)
      }
      catch (err) {
        return { __error: `[Error: ${err?.message ?? err}]` }
      }
      for (const key of keys) {
        try {
          cleanEntry(cleaned, key, data[key])
        }
        catch (err) {
          // A value that throws when inspected (a hostile Proxy, a getter):
          // keep a marker so the rest of the step still saves
          cleaned[key] = `[Error: ${err?.message ?? err}]`
        }
      }
      return cleaned
    }

    const cleanEntry = (cleaned, key, value) => {
      // Skip functions unless they are faker functions
      if (typeof value === 'function') {
        // A faker function rebuilt by _reconstructData after a reload
        if (value.__fakerFunction && typeof value.__fakerFunction === 'object') {
          cleaned[key] = { __fakerFunction: true, ...value.__fakerFunction }
          return
        }
        // Get the function body as string
        const funcStr = value.toString()
        // Check if it's a faker function call
        if (funcStr.includes('api.faker.')) {
          // Extract the faker function name and parameters
          const match = funcStr.match(/api\.faker\.(\w+)\((.*)\)/)
          if (match) {
            const [, fakerName, paramsStr] = match
            let params
            try {
              // Parse params preserving types (numbers, arrays, strings)
              const jsonStr = '[' + paramsStr.replace(/'/g, '"') + ']'
              params = JSON.parse(jsonStr)
            }
            catch {
              // Fallback to string splitting for unparseable params
              params = paramsStr.split(',').map(p => p.trim())
            }
            cleaned[key] = {
              __fakerFunction: true,
              name: fakerName,
              params,
            }
          }
        }
        // Skip all other functions
        return
      }

      // Preserve existing __vueComponent markers (from previous serialization round-trips)
      if (value && typeof value === 'object' && value.__vueComponent && value.componentName) {
        cleaned[key] = {
          __vueComponent: true,
          componentName: value.componentName,
        }
        return
      }

      // Check if it's a Vue component (has name + template or render function)
      if (value && typeof value === 'object' && value.name && (value.template || value.render)) {
        // Register the component so it can be resolved during deserialization
        if (Stepper._componentRegistry) {
          Stepper._componentRegistry.set(value.name, value)
        }
        cleaned[key] = {
          __vueComponent: true,
          componentName: value.name,
        }
        return
      }

      // Handle data objects that might contain component references
      if (key === 'type' && value?.name && (value.template || value.render)) {
        if (Stepper._componentRegistry) {
          Stepper._componentRegistry.set(value.name, value)
        }
        cleaned[key] = {
          __vueComponent: true,
          componentName: value.name,
        }
        return
      }

      if (
        typeof value === 'undefined'
        || value instanceof RegExp
        || (value instanceof Object && 'nodeType' in value)
      ) {
        // Skip undefined values, RegExp, and DOM elements entirely
        return
      }
      cleaned[key] = value
    }

    return {
      id: Stepper.id,
      currentIndex: Stepper._currentIndex,
      depth: Stepper._depth,
      shuffled: Stepper._shuffled,
      states: Stepper._states.map(state => StepperSerializer.serialize(state)),
      data: cleanData(Stepper.data),
      // Note: We don't serialize _parent or _root as they are circular references
      // and will be re-established during deserialization
    }
  }

  /**
   * Deserializes a JSON object into a Stepper instance
   * @param {object} data - The JSON data to deserialize
   * @param {Stepper} target - The target Stepper instance to populate
   * @param {Stepper} root - The root Stepper instance (for faker function reconstruction)
   * @throws {Error} If `data` isn't an object with a `states` array. Other
   *   damage (a bad index, a missing id, a child that isn't an object) is repaired.
   */
  static deserialize(data, target, root) {
    // The whole state must at least be an object; anything else (null, a
    // string, an array) is refused and the caller starts the view over.
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Invalid data: Expected an object but received ' + (Array.isArray(data) ? 'an array' : typeof data))
    }
    // Without a list of steps it isn't stepper state at all (an old format,
    // something else saved under the key): nothing to salvage.
    if (!Array.isArray(data.states)) {
      throw new TypeError('Missing required fields in data: states (expected an array of steps)')
    }
    StepperSerializer._load(data, target, root, '')
  }

  /**
   * Loads one node, salvaging what it can from damaged state (plans/sync_engine.md,
   * "Loading"): a bad field gets a default, a bad child becomes an empty step at
   * the same index (so positions after it still line up), and the index is
   * clamped to the children there are. What was repaired is logged.
   * @private
   */
  static _load(data, target, root, path) {
    const where = path || '/'
    const repaired = []

    let id = data.id
    if (typeof id !== 'string' && typeof id !== 'number') {
      id = target._parent === null ? '/' : target._id
      repaired.push('id')
    }

    let states = data.states
    if (!Array.isArray(states)) {
      if (states !== undefined) repaired.push('states')
      states = []
    }

    let currentIndex = data.currentIndex
    if (typeof currentIndex === 'string' && /^-?\d+$/.test(currentIndex.trim())) {
      currentIndex = Number(currentIndex)
      repaired.push('currentIndex (a string)')
    }
    if (typeof currentIndex !== 'number' || !Number.isInteger(currentIndex)) {
      currentIndex = 0
      if (data.currentIndex !== undefined) repaired.push('currentIndex')
    }
    // A leaf's index is unused and always 0. State saved before shuffle()
    // stopped setting it to the leaf's position can hold other values.
    if (states.length === 0) {
      currentIndex = 0
    }
    else if (currentIndex < 0 || currentIndex > states.length - 1) {
      currentIndex = Math.min(Math.max(currentIndex, 0), Math.max(0, states.length - 1))
      repaired.push('currentIndex (out of range)')
    }

    let depth = data.depth
    if (typeof depth !== 'number' || !Number.isInteger(depth) || depth < 0) {
      depth = target._parent ? (target._parent._depth ?? 0) + 1 : 0
      if (data.depth !== undefined) repaired.push('depth')
    }

    const shuffled = typeof data.shuffled === 'boolean' ? data.shuffled : false

    target._id = id
    target._currentIndex = currentIndex
    target._depth = depth
    target._shuffled = shuffled
    let stepData
    try {
      stepData = StepperSerializer._reconstructData(data.data, root)
    }
    catch {
      stepData = {}
      repaired.push('data')
    }
    target._data = stepData

    if (target._parent === null) {
      target._states = []
      target._parent = null
      target._root = target
    }

    target._states = states.map((stateData, i) => {
      let childData = stateData
      if (!childData || typeof childData !== 'object' || Array.isArray(childData)) {
        repaired.push(`child ${i} (replaced with an empty step)`)
        childData = { id: i, currentIndex: 0, depth: depth + 1, shuffled: false, states: [], data: {} }
      }
      const childId = typeof childData.id === 'string' || typeof childData.id === 'number' ? childData.id : i
      const state = target._createNew(childId, target)
      state._parent = target
      state._root = target._root
      StepperSerializer._load(childData, state, root, `${path}/${childId}`)
      return state
    })

    if (repaired.length) {
      try {
        useLog().warn(`Stepper: repaired saved state at ${where}: ${repaired.join(', ')}`)
      }
      catch {
        console.warn(`Stepper: repaired saved state at ${where}: ${repaired.join(', ')}`)
      }
    }
  }

  /**
   * Reconstructs data objects, including faker functions
   * @private
   * @param {object} data - The data object to reconstruct
   * @param {Stepper} root - The root Stepper instance (for faker function reconstruction)
   * @returns {object} The reconstructed data object
   */
  static _reconstructData(data, root) {
    if (!data) return data

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map(item => StepperSerializer._reconstructData(item, root))
    }

    // Handle objects
    if (typeof data === 'object') {
      const reconstructed = {}
      for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === 'object') {
          // Handle faker functions
          if (value.__fakerFunction) {
            const fn = () => {
              const fakerFunc = Object.hasOwn(fakerDistributions, value.name) ? fakerDistributions[value.name] : null
              if (!fakerFunc) {
                console.warn(`Faker function ${value.name} not found during reconstruction`)
                return null
              }
              const params = Array.isArray(value.params) ? value.params : []
              try {
                return fakerFunc(...params).val
              }
              catch (err) {
                console.warn(`Faker function ${value.name} failed during reconstruction: ${err?.message ?? err}`)
                return null
              }
            }
            // Keep what it was, so the next save writes the same marker
            fn.__fakerFunction = { name: value.name, params: value.params }
            reconstructed[key] = fn
            continue
          }

          // Handle Vue components — preserve the serialized format
          if (value.__vueComponent) {
            reconstructed[key] = {
              __vueComponent: true,
              componentName: value.componentName,
            }
            continue
          }

          // Recursively reconstruct nested objects
          reconstructed[key] = StepperSerializer._reconstructData(value, root)
        }
        else {
          reconstructed[key] = value
        }
      }
      return reconstructed
    }

    // Return primitive values as is
    return data
  }
}

export default StepperSerializer
