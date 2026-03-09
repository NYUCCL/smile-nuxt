import { execSync } from 'node:child_process'
import Icons from 'unplugin-icons/vite'
import Components from 'unplugin-vue-components/vite'
import IconsResolver from 'unplugin-icons/resolver'

// Auto-generate git env vars before loading config
try {
  execSync('bash scripts/generate_git_env.sh', { stdio: 'inherit' })
}
catch {
  console.warn('[SMILE] Could not generate git env — scripts/generate_git_env.sh failed')
}

export default defineNuxtConfig({
  modules: ['@pinia/nuxt', '@nyuccl/smile'],

  // SMILE module options (all optional — defaults are sensible)
  smile: {},

  // Project-level CSS (Tailwind plugins, custom styles)
  css: ['~/assets/css/app.css'],

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
