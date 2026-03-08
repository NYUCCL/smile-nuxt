import { execSync } from 'node:child_process'
import { loadEnv } from 'vite'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Components from 'unplugin-vue-components/vite'
import IconsResolver from 'unplugin-icons/resolver'

// Auto-generate git env vars before loading config
const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  execSync('bash scripts/generate_git_env.sh', { cwd: resolve(__dirname, '..'), stdio: 'inherit' })
}
catch {
  console.warn('[SMILE] Could not generate git env — scripts/generate_git_env.sh failed')
}

// Load all env layers from repo root, matching the old Vite setup
const rootDir = resolve(__dirname, '..')
const env = {
  ...loadEnv('production', rootDir, ''),
  ...loadEnv('deploy', rootDir, ''),
  ...loadEnv('git', rootDir, ''),
}

// Inject non-VITE env vars into process.env for server-side use
// (Nuxt only auto-loads .env from rootDir, which is playground/)
const serverEnvKeys = ['SMILE_DEV_PASSWORD', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN']
for (const key of serverEnvKeys) {
  if (env[key] && !process.env[key]) {
    process.env[key] = env[key]
  }
}

// Read package version
let smileVersion = '0.0.0'
try {
  const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'))
  smileVersion = pkg.version
}
catch { /* ignored */ }

export default defineNuxtConfig({
  modules: ['@pinia/nuxt', '../src/module'],
  // Merge git/deploy env vars into Vite's env so import.meta.env picks them up
  $development: {
    vite: {
      define: Object.fromEntries(
        Object.entries(env)
          .filter(([k]) => k.startsWith('VITE_'))
          .map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)]),
      ),
    },
  },
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  vite: {
    envDir: '..',
    define: {
      'import.meta.env.VITE_SMILE_VERSION': JSON.stringify(smileVersion),
    },
    plugins: [
      Components({
        resolvers: [IconsResolver()],
      }),
    ],
  },
  smile: {},
})
