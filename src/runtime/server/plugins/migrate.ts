import { defineNitroPlugin } from 'nitropack/runtime'
import { databaseReady } from '../utils/db'

/**
 * Starts the migrations when the server starts. Nitro doesn't wait for an
 * async plugin, so API requests wait for the same promise in
 * middleware/00.database-ready.ts.
 */
export default defineNitroPlugin(() => {
  databaseReady().catch((err) => {
    console.error('[SMILE] Database setup failed:', err)
  })
})
