import Components from 'unplugin-vue-components/vite'
import IconsResolver from 'unplugin-icons/resolver'

export default defineNuxtConfig({
  modules: ['@pinia/nuxt', '@nyuccl/smile'],

  // SMILE module options (all optional — defaults are sensible)
  smile: {},

  // Load env vars from project root
  vite: {
    envDir: '.',
    plugins: [
      // Auto-resolve <i-*> icon components (e.g. <i-lucide-heart />)
      // Icon data comes from @iconify/json; the Icons() vite plugin
      // is already registered by the SMILE module.
      Components({
        resolvers: [IconsResolver()],
      }),
    ],
  },

  compatibilityDate: 'latest',
})
