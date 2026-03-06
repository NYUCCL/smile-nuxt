/**
 * @class StepperSerializer
 * @description Handles serialization and deserialization of Stepper objects
 */
export class StepperSerializer {
  /**
   * Serializes a Stepper object to a JSON-compatible format
   * @param {Stepper} Stepper - The Stepper instance to serialize
   * @returns {Object} A JSON-compatible representation of the Stepper object
   */
  static serialize(Stepper) {
    /**
     * Helper function to clean non-serializable data from a Stepper object
     * @private
     * @param {Object} data - The data object to clean
     * @returns {Object} A cleaned data object with non-serializable values removed or transformed
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
      for (const [key, value] of Object.entries(data)) {
        // Skip functions unless they are faker functions
        if (typeof value === 'function') {
          // Get the function body as string
          const funcStr = value.toString()
          // Check if it's a faker function call
          if (funcStr.includes('api.faker.')) {
            // Extract the faker function name and parameters
            const match = funcStr.match(/api\.faker\.(\w+)\((.*)\)/)
            if (match) {
              const [_, fakerName, params] = match
              cleaned[key] = {
                __fakerFunction: true,
                name: fakerName,
                params: params.split(',').map((p) => p.trim()),
              }
            }
          }
          // Skip all other functions
          continue
        }

        // Check if it's a Vue component
        if (value && typeof value === 'object' && value.name && (value.template || value.render)) {
          cleaned[key] = {
            __vueComponent: true,
            componentName: value.name,
          }
          continue
        }

        // Handle data objects that might contain component references
        if (key === 'type' && value?.name && (value.template || value.render)) {
          cleaned[key] = {
            __vueComponent: true,
            componentName: value.name,
          }
          continue
        }

        if (
          typeof value === 'undefined' ||
          value instanceof RegExp ||
          (value instanceof Object && 'nodeType' in value)
        ) {
          // Skip undefined values, RegExp, and DOM elements entirely
          continue
        } else {
          cleaned[key] = value
        }
      }
      return cleaned
    }

    return {
      id: Stepper.id,
      currentIndex: Stepper._currentIndex,
      depth: Stepper._depth,
      shuffled: Stepper._shuffled,
      states: Stepper._states.map((state) => StepperSerializer.serialize(state)),
      data: cleanData(Stepper.data),
      // Note: We don't serialize _parent or _root as they are circular references
      // and will be re-established during deserialization
    }
  }

  /**
   * Deserializes a JSON object into a Stepper instance
   * @param {Object} data - The JSON data to deserialize
   * @param {Stepper} target - The target Stepper instance to populate
   * @param {Stepper} root - The root Stepper instance (for faker function reconstruction)
   * @throws {Error} If required data fields are missing or invalid
   */
  static deserialize(data, target, root) {
    // Validate input data
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data: Expected an object but received ' + typeof data)
    }

    // Validate required fields
    const requiredFields = ['id', 'currentIndex', 'depth', 'states', 'shuffled']
    const missingFields = requiredFields.filter((field) => !(field in data))
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields in data: ${missingFields.join(', ')}`)
    }

    // Validate field types
    if (typeof data.id !== 'string') {
      throw new Error('Invalid id: Expected string but received ' + typeof data.id)
    }
    if (typeof data.currentIndex !== 'number') {
      throw new Error('Invalid currentIndex: Expected number but received ' + typeof data.currentIndex)
    }
    if (typeof data.depth !== 'number') {
      throw new Error('Invalid depth: Expected number but received ' + typeof data.depth)
    }
    if (!Array.isArray(data.states)) {
      throw new Error('Invalid states: Expected array but received ' + typeof data.states)
    }
    if (typeof data.shuffled !== 'boolean') {
      throw new Error('Invalid shuffled: Expected boolean but received ' + typeof data.shuffled)
    }

    try {
      // Set basic properties for all nodes
      target._id = data.id
      target._currentIndex = data.currentIndex
      target._depth = data.depth
      target._shuffled = data.shuffled
      target._data = StepperSerializer._reconstructData(data.data, root)

      // Only set root-specific properties if this is the root node
      if (target._parent === null) {
        target._states = []
        target._parent = null
        target._root = target
      }

      // Create child states with proper parent references and load their data
      target._states = data.states.map((stateData) => {
        try {
          const state = target._createNew(stateData.id, target) // Pass target as parent
          StepperSerializer.deserialize(stateData, state, root) // Load child data while preserving parent reference
          state._root = target._root
          state._parent = target
          return state
        } catch (error) {
          throw new Error(`Error deserializing child state: ${error.message}`)
        }
      })
    } catch (error) {
      throw new Error(`Failed to deserialize stepper: ${error.message}`)
    }
  }

  /**
   * Reconstructs data objects, including faker functions
   * @private
   * @param {Object} data - The data object to reconstruct
   * @param {Stepper} root - The root Stepper instance (for faker function reconstruction)
   * @returns {Object} The reconstructed data object
   */
  static _reconstructData(data, root) {
    if (!data) return data

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map((item) => StepperSerializer._reconstructData(item, root))
    }

    // Handle objects
    if (typeof data === 'object') {
      const reconstructed = {}
      for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === 'object') {
          // Handle faker functions
          if (value.__fakerFunction) {
            reconstructed[key] = () => {
              const fakerFunc = root.api?.faker?.[value.name]
              if (!fakerFunc) {
                console.warn(`Faker function ${value.name} not found during reconstruction`)
                return null
              }
              // Convert string parameters to appropriate types
              const convertedParams = value.params.map((param) => {
                // Convert empty string to undefined
                if (param === '') return undefined
                // Try to convert to number if it looks like a number
                const num = Number(param)
                return isNaN(num) ? param : num
              })
              return fakerFunc(...convertedParams)
            }
            continue
          }

          // Handle Vue components
          if (value.__vueComponent) {
            reconstructed[key] = {
              name: value.componentName,
              __vueComponent: true,
            }
            continue
          }

          // Recursively reconstruct nested objects
          reconstructed[key] = StepperSerializer._reconstructData(value, root)
        } else {
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
