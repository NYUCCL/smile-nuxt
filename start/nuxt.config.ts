import { execSync } from 'node:child_process'
import { loadEnv } from 'vite'
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

// Load all env layers (.env, .env.local, .env.git.local, etc.)
const env = {
  ...loadEnv('production', '.', ''),
  ...loadEnv('git', '.', ''),
}

// Inject non-VITE env vars into process.env for server-side use
// (Nuxt auto-loads VITE_ vars for the client, but server-only vars
//  like TURSO_DATABASE_URL need manual injection)
const serverEnvKeys = ['SMILE_DEV_PASSWORD', 'SMILE_PUBLIC_PRESENTATION', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN']
for (const key of serverEnvKeys) {
  if (env[key] && !process.env[key]) {
    process.env[key] = env[key]
  }
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
