/**
 * Sets what import.meta.dev, import.meta.client and import.meta.server read
 * as in the module's code under test (vitest.config.js puts a global in
 * their place). Unset, each is undefined, as in a test that sets nothing.
 *
 * A flag read when a module or a component's setup runs (`const isDev =
 * import.meta.dev`) has to be set before the import or the mount.
 *
 *   beforeEach(() => setFlags({ dev: true }))
 *   afterEach(resetFlags)
 */
const NAMES = { dev: 'SDEV', client: 'SCLIENT', server: 'SSERVER' }

/**
 * @param {{ dev?: boolean, client?: boolean, server?: boolean }} flags - The flags to set
 */
export function setFlags(flags) {
  for (const [key, value] of Object.entries(flags)) {
    if (!(key in NAMES)) throw new Error(`Unknown flag: ${key}`)
    globalThis[NAMES[key]] = value
  }
}

/** Back to all three unset. */
export function resetFlags() {
  for (const name of Object.values(NAMES)) delete globalThis[name]
}
