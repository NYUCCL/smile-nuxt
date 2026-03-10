import { defineEventHandler } from 'h3'

export default defineEventHandler(() => {
  const url = process.env.TURSO_DATABASE_URL || 'file:.data/experiment.db'
  const isTurso = url.startsWith('libsql://') || url.startsWith('https://')
  const isLocal = url.startsWith('file:')

  return {
    type: isTurso ? 'Turso' : isLocal ? 'Local SQLite' : 'LibSQL',
    url: isTurso ? url.replace(/\/\/.*@/, '//***@') : url,
  }
})
