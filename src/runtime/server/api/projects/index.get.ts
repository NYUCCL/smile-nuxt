import { eq, and, sql } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { useDB } from '../../utils/db'
import { projects, participants } from '../../database/schema'
import { requireDevAuth } from '../../utils/dev-auth'
import { getCurrentProjectScope } from '../../utils/project'

/**
 * GET /api/projects
 * List all projects scoped to the current owner/repo, with the number of
 * participant records and the most recent record update per project.
 * Returns all branches and modes for this owner/repo.
 * Requires dev auth.
 */
export default defineEventHandler(async (event) => {
  await requireDevAuth(event)

  const scope = getCurrentProjectScope()
  const db = useDB()

  const rows = await db
    .select({
      id: projects.id,
      owner: projects.owner,
      repo: projects.repo,
      branch: projects.branch,
      mode: projects.mode,
      createdAt: projects.createdAt,
      // Aggregates over the joined participants. `updatedAt` is stored as
      // unix seconds (drizzle timestamp mode), so max() returns raw seconds.
      recordCount: sql<number>`count(${participants.id})`,
      lastUpdatedSec: sql<number | null>`max(${participants.updatedAt})`,
    })
    .from(projects)
    .leftJoin(participants, eq(participants.projectId, projects.id))
    .where(and(eq(projects.owner, scope.owner), eq(projects.repo, scope.repo)))
    .groupBy(projects.id)
    .all()

  return rows.map(row => ({
    id: row.id,
    owner: row.owner,
    repo: row.repo,
    branch: row.branch,
    mode: row.mode,
    createdAt: row.createdAt,
    recordCount: Number(row.recordCount) || 0,
    lastUpdated: row.lastUpdatedSec
      ? new Date(Number(row.lastUpdatedSec) * 1000).toISOString()
      : null,
  }))
})
