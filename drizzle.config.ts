import { defineConfig } from 'drizzle-kit'
import { loadEnv } from 'vite'

// Load .env and .env.local so drizzle-kit can target either local or Turso
const env = loadEnv('production', '.', '')

const url = process.env.TURSO_DATABASE_URL || env.TURSO_DATABASE_URL || ''
const authToken = process.env.TURSO_AUTH_TOKEN || env.TURSO_AUTH_TOKEN || ''
const isTurso = url.startsWith('libsql://') || url.startsWith('https://')

export default defineConfig({
  schema: './src/runtime/server/database/schema.ts',
  out: './drizzle',
  dialect: isTurso ? 'turso' : 'sqlite',
  dbCredentials: {
    url: url || 'file:.data/experiment.db',
    ...(isTurso && { authToken }),
  },
})
