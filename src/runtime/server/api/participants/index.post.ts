import { randomUUID, createHmac } from 'node:crypto'
import { defineEventHandler, readBody, setCookie } from 'h3'
import { useDB } from '../../utils/db'
import { getAuthSecret } from '../../utils/dev-auth'
import { participants, projects } from '../../database/schema'
import { buildProjectId, getCurrentProjectInfo } from '../../utils/project'

function signParticipantToken(id: string, secret: string): string {
  const issuedAt = Math.floor(Date.now() / 1000)
  const sig = createHmac('sha256', secret).update(`${id}.${issuedAt}`).digest('hex')
  return `${id}.${issuedAt}.${sig}`
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const db = useDB()
  const id = randomUUID()
  const now = new Date()

  // Determine project identity from server config (not client)
  const info = getCurrentProjectInfo()
  const projectId = buildProjectId(info.owner, info.repo, info.branch, info.mode)

  // Upsert the project record
  await db.insert(projects).values({
    id: projectId,
    owner: info.owner,
    repo: info.repo,
    branch: info.branch,
    mode: info.mode,
    createdAt: now,
  }).onConflictDoNothing()

  await db.insert(participants).values({
    id,
    projectId,
    data: body.data || {},
    createdAt: now,
    updatedAt: now,
  })

  const signedToken = signParticipantToken(id, getAuthSecret())

  setCookie(event, 'smile_participant', signedToken, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 86400 * 7,
  })

  return { id }
})
