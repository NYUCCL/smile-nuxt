// Stub for #imports — provides Nuxt auto-imports for unit tests outside the Nuxt context.
// vi.mock('#imports') in mocks.js overrides these with spies.
export const defineNuxtPlugin = fn => fn
export const defineNuxtRouteMiddleware = fn => fn
export const useNuxtApp = () => ({ $timeline: null })
export const useRoute = () => ({ path: '/', name: 'index', query: {}, params: {} })
export const useRouter = () => ({ push: () => {}, replace: () => {}, getRoutes: () => [] })
export const navigateTo = (path, opts) => ({ __navigateTo: true, path, opts })
export const abortNavigation = () => ({ __abortNavigation: true })
export const useCookie = (name, opts) => {
  const val = opts?.default?.() ?? null
  return { value: val }
}
export const useRuntimeConfig = () => ({
  public: {
    smile: { codeName: 'test', projectRef: 'test-project' },
    deployBasePath: '/test/',
  },
})
