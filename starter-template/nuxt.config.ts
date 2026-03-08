import Icons from 'unplugin-icons/vite'
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
      // Enable <i-*> icon components (e.g. <i-lucide-heart />)
      // Icon data comes from @iconify/json devDependency
      Icons({ compiler: 'vue3' }),
      Components({ resolvers: [IconsResolver()] }),
    ],
  },

  compatibilityDate: 'latest',
})
