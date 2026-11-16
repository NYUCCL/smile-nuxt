import { randomUUID, createHmac } from 'node:crypto'
import { defineEventHandler, setCookie, getRequestProtocol } from 'h3'
import { useDB } from '../../utils/db'
import { getAuthSecret } from '../../utils/dev-auth'
import { participants, projects } from '../../database/schema'
import { buildProjectId, getCurrentProjectInfo } from '../../utils/project'
import { parseDataBody, statusFromData } from '../../utils/participant-save'
import { readBodyText, throwRefusal } from '../../utils/read-body'

function signParticipantToken(id: string, secret: string): string {
  const issuedAt = Math.floor(Date.now() / 1000)
  const sig = createHmac('sha256', secret).update(`${id}.${issuedAt}`).digest('hex')
  return `${id}.${issuedAt}.${sig}`
}

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

  const signedToken = signParticipantToken(id, getAuthSecret())

  setCookie(event, 'smile_participant', signedToken, {
    httpOnly: true,
    secure: getRequestProtocol(event, { xForwardedProto: true }) === 'https', // HTTPS-only on deploys; plain HTTP still works locally
    sameSite: 'lax',
    path: '/',
    maxAge: 86400 * 7,
  })

  return { id, rev: 0 }
})
