/**
 * @fileoverview Creates and exports the Pinia store instance for state management
 * @module createpinia
 */

/**
 * Pinia store factory function
 * @external createPinia
 */
import { createPinia } from 'pinia'

/**
 * Global Pinia store instance
 * @const {import('pinia').Pinia}
 */
export const pinia = createPinia()

export default pinia
