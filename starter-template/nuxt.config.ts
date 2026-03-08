export default defineNuxtConfig({
  modules: ['@pinia/nuxt', '@nyuccl/smile'],

  // SMILE module options (all optional — defaults are sensible)
  smile: {},

  // Load env vars from project root
  vite: {
    envDir: '.',
  },

  compatibilityDate: 'latest',
})
