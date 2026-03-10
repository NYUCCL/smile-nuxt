import { eq, and } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { useDB } from '../../utils/db'
import { projects } from '../../database/schema'
import { requireDevAuth } from '../../utils/dev-auth'
import { getCurrentProjectScope } from '../../utils/project'

/**
 * GET /api/projects
 * List all projects scoped to the current owner/repo.
 * Returns all branches and modes for this owner/repo.
 * Requires dev auth.
 */
export default defineEventHandler(async (event) => {
  await requireDevAuth(event)

  const scope = getCurrentProjectScope()
  const db = useDB()

  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.owner, scope.owner), eq(projects.repo, scope.repo)))
    .all()

  return rows.map(row => ({
    id: row.id,
    owner: row.owner,
    repo: row.repo,
    branch: row.branch,
    mode: row.mode,
    createdAt: row.createdAt,
  }))
})
