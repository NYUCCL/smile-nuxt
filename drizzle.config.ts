import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/runtime/server/database/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL || 'file:.data/experiment.db',
  },
})
