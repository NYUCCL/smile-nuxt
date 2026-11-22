import { randomUUID } from 'node:crypto'
import { defineEventHandler } from 'h3'
import { useDB } from '../../utils/db'
import { getAuthSecret } from '../../utils/dev-auth'
import { participants, projects } from '../../database/schema'
import { buildProjectId, getCurrentProjectInfo } from '../../utils/project'
import { parseDataBody, statusFromData } from '../../utils/participant-save'
import { readBodyText, throwRefusal } from '../../utils/read-body'
import { setParticipantCookie } from '../../utils/participant-token'

export default defineEventHandler(async (event) => {
  const parsed = parseDataBody(await readBodyText(event))
  if (!parsed.ok) throwRefusal(parsed)
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
    data: parsed.data,
    ...statusFromData(parsed.data),
    dataBytes: Buffer.byteLength(JSON.stringify(parsed.data), 'utf8'),
    createdAt: now,
    updatedAt: now,
  })

  setParticipantCookie(event, id, getAuthSecret())

  return { id, rev: 0 }
})
