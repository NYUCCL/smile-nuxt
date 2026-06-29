// Project-level composable. Nuxt should auto-import this alongside the module's
// composables with no collision; the AdvertisementView override calls it
// without an explicit import.
export function useOverrideProbe() {
  return 'PROBE_OK_42'
}
