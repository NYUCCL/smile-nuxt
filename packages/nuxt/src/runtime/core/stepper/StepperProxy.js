/**
 * @class StepperProxy
 * @description Proxy handler for TableAPI objects that handles array-like access
 */
class StepperProxy {
  /**
   * Creates a new StepperProxy instance and returns a proxy
   * @param {TableAPI} target - The target TableAPI object
   * @returns {Proxy} A proxy for the target object
   */
  constructor(target) {
    this.target = target
    return new Proxy(target, this)
  }

  /**
   * Handles property access through the proxy
   * @param {TableAPI} target - The target TableAPI object
   * @param {string|number} prop - The property being accessed
   * @returns {*} The value of the property
   */
  get(target, prop) {
    //console.log('get', prop)
    // Handle array/object access
    if (typeof prop === 'string' || typeof prop === 'number') {
      // Convert string numbers to actual numbers
      if (typeof prop === 'string' && /^-?\d+$/.test(prop)) {
        prop = parseInt(prop)
      }

      // Handle negative indices first
      if (typeof prop === 'number') {
        if (prop < 0) {
          prop = target._states.length + prop
          // If still negative after adjustment, return undefined
          if (prop < 0) return undefined
        }
      }

      // IMPORTANT: We first try to get a child node by id before checking properties/methods
      // This ensures that child nodes with ids matching getter names (like 'parent')
      // take precedence over the getter methods
      const node = target.getNode(prop)
      if (node) {
        return node
      }
      // If no child node found, then check for properties/methods
      if (prop in target) {
        return target[prop]
      }
      return undefined
    }
    return target[prop]
  }
}

export default StepperProxy
