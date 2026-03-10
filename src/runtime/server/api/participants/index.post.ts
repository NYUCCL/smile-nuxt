import { randomUUID, createHmac } from 'node:crypto'
import { defineEventHandler, readBody, setCookie } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { useDB } from '../../utils/db'
import { participants } from '../../database/schema'

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

  await db.insert(participants).values({
    id,
    projectRef: body.projectRef || 'unknown',
    data: body.data || {},
    createdAt: now,
    updatedAt: now,
  })

  const config = useRuntimeConfig()
  const secret = config.smile?.tursoAuthToken || config.smile?.devPassword || 'smile-local-dev-key'
  const signedToken = signParticipantToken(id, secret)

  setCookie(event, 'smile_participant', signedToken, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 86400 * 7,
  })

  return { id }
})
