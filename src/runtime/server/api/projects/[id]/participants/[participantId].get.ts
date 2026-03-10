import { eq, and } from 'drizzle-orm'
import { defineEventHandler, createError, getRouterParam } from 'h3'
import { useDB } from '../../../../utils/db'
import { participants, projects } from '../../../../database/schema'
import { requireDevAuth } from '../../../../utils/dev-auth'
import { getCurrentProjectScope } from '../../../../utils/project'

/**
 * GET /api/projects/:id/participants/:participantId
 * Get a specific participant's data through the project scope.
 * Requires dev auth. Project must belong to the current owner/repo.
 */
export default defineEventHandler(async (event) => {
  await requireDevAuth(event)

  const projectId = getRouterParam(event, 'id', { decode: true })
  const participantId = getRouterParam(event, 'participantId', { decode: true })

  if (!projectId || !participantId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id or participant id' })
  }

  const db = useDB()
  const scope = getCurrentProjectScope()

  // Verify project belongs to current owner/repo
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

  // Get participant, verifying it belongs to this project
  const participant = await db
    .select()
    .from(participants)
    .where(and(eq(participants.id, participantId), eq(participants.projectId, projectId)))
    .get()

  if (!participant) {
    throw createError({ statusCode: 404, statusMessage: 'Participant not found in this project' })
  }

  return {
    id: participant.id,
    projectId: participant.projectId,
    data: participant.data,
    createdAt: participant.createdAt,
    updatedAt: participant.updatedAt,
  }
})
