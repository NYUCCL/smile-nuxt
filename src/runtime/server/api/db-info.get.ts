import { defineEventHandler } from 'h3'
import { requireDevAuth } from '../utils/dev-auth'
import { getCurrentProjectInfo, buildProjectId } from '../utils/project'

export default defineEventHandler(async (event) => {
  await requireDevAuth(event)

  const url = process.env.TURSO_DATABASE_URL || 'file:.data/experiment.db'
  const isTurso = url.startsWith('libsql://') || url.startsWith('https://')
  const isLocal = url.startsWith('file:')

  const info = getCurrentProjectInfo()

  return {
    type: isTurso ? 'Turso' : isLocal ? 'Local SQLite' : 'LibSQL',
    url: isTurso ? url.replace(/\/\/.*@/, '//***@') : url,
    project: {
      id: buildProjectId(info.owner, info.repo, info.branch, info.mode),
      ...info,
    },
  }
})
