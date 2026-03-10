import { eq } from 'drizzle-orm'
import { defineEventHandler, createError, getRouterParam } from 'h3'
import { useDB } from '../../../utils/db'
import { participants, projects } from '../../../database/schema'
import { requireDevAuth } from '../../../utils/dev-auth'
import { getCurrentProjectScope } from '../../../utils/project'

/**
 * GET /api/projects/:id/participants
 * List participants for a specific project.
 * The project must belong to the current owner/repo scope.
 * Requires dev auth.
 */
export default defineEventHandler(async (event) => {
  await requireDevAuth(event)

  const projectId = getRouterParam(event, 'id', { decode: true })
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }

  const db = useDB()
  const scope = getCurrentProjectScope()

  // Verify the project exists and belongs to the current owner/repo
  const project = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .get()

  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  if (project.owner !== scope.owner || project.repo !== scope.repo) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: project belongs to a different owner/repo' })
  }

  const rows = await db
    .select({
      id: participants.id,
      projectId: participants.projectId,
      createdAt: participants.createdAt,
      updatedAt: participants.updatedAt,
    })
    .from(participants)
    .where(eq(participants.projectId, projectId))
    .all()

  return rows
})
