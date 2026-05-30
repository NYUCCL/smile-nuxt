import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@libsql/client'
import { clearState } from './helpers'

function getDB() {
  return createClient({ url: 'file:.data/experiment.db' })
}

async function cleanupParticipants(db: ReturnType<typeof createClient>, ids: string[]) {
  for (const id of ids) {
    await db.execute({ sql: 'DELETE FROM private_data WHERE participant_id = ?', args: [id] })
    await db.execute({ sql: 'DELETE FROM participants WHERE id = ?', args: [id] })
  }
}

async function cleanupProjects(db: ReturnType<typeof createClient>, ids: string[]) {
  for (const id of ids) {
    // Delete any remaining participants first (FK constraint)
    await db.execute({ sql: 'DELETE FROM private_data WHERE participant_id IN (SELECT id FROM participants WHERE project_id = ?)', args: [id] })
    await db.execute({ sql: 'DELETE FROM participants WHERE project_id = ?', args: [id] })
    await db.execute({ sql: 'DELETE FROM projects WHERE id = ?', args: [id] })
  }
}

// ---------------------------------------------------------------------------
// Project creation and structure
// ---------------------------------------------------------------------------

test.describe('Project creation on participant consent', () => {
  const readyButton = (page: Page) => page.getByRole('button', { name: /I'm ready/i })
  let db: ReturnType<typeof createClient>
  const createdParticipantIds: string[] = []
  const createdProjectIds: string[] = []

  test.beforeAll(() => {
    db = getDB()
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/welcome')
    await clearState(page)
    await page.goto('/welcome')
    await expect(readyButton(page)).toBeVisible({ timeout: 10_000 })
  })

  test.afterAll(async () => {
    await cleanupParticipants(db, createdParticipantIds)
    await cleanupProjects(db, createdProjectIds)
    db.close()
  })

  test('consent creates a project record in the database', async ({ page }) => {
    await readyButton(page).click()
    await page.getByRole('switch').click()
    await page.getByRole('button', { name: /Let's start/i }).click()
    await expect(page).toHaveURL(/\/demograph/)
    await page.waitForTimeout(1000)

    // Get the participant that was just created
    const participantResult = await db.execute(
      'SELECT * FROM participants ORDER BY created_at DESC LIMIT 1',
    )
    expect(participantResult.rows.length).toBe(1)
    const participant = participantResult.rows[0]!
    createdParticipantIds.push(participant.id as string)

    // The participant should reference a project
    const projectId = participant.project_id as string
    expect(projectId).toBeTruthy()
    createdProjectIds.push(projectId)

    // The project should exist in the projects table
    const projectResult = await db.execute({
      sql: 'SELECT * FROM projects WHERE id = ?',
      args: [projectId],
    })
    expect(projectResult.rows.length).toBe(1)
    const project = projectResult.rows[0]!
    expect(project.owner).toBeTruthy()
    expect(project.repo).toBeTruthy()
    expect(project.branch).toBeTruthy()
    expect(project.mode).toBeTruthy()
  })

  test('project ID has format owner:repo:branch:mode', async ({ page }) => {
    await readyButton(page).click()
    await page.getByRole('switch').click()
    await page.getByRole('button', { name: /Let's start/i }).click()
    await expect(page).toHaveURL(/\/demograph/)
    await page.waitForTimeout(1000)

    const participantResult = await db.execute(
      'SELECT * FROM participants ORDER BY created_at DESC LIMIT 1',
    )
    const participant = participantResult.rows[0]!
    createdParticipantIds.push(participant.id as string)
    const projectId = participant.project_id as string
    createdProjectIds.push(projectId)

    // Project ID should be colon-separated: owner:repo:branch:mode
    const parts = projectId.split(':')
    expect(parts.length).toBe(4)
    const [owner, repo, branch, mode] = parts

    // Verify they match the project record
    const projectResult = await db.execute({
      sql: 'SELECT * FROM projects WHERE id = ?',
      args: [projectId],
    })
    const project = projectResult.rows[0]!
    expect(project.owner).toBe(owner)
    expect(project.repo).toBe(repo)
    expect(project.branch).toBe(branch)
    expect(project.mode).toBe(mode)
  })

  test('dev server creates project with mode "test"', async ({ page }) => {
    await readyButton(page).click()
    await page.getByRole('switch').click()
    await page.getByRole('button', { name: /Let's start/i }).click()
    await expect(page).toHaveURL(/\/demograph/)
    await page.waitForTimeout(1000)

    const participantResult = await db.execute(
      'SELECT * FROM participants ORDER BY created_at DESC LIMIT 1',
    )
    const participant = participantResult.rows[0]!
    createdParticipantIds.push(participant.id as string)
    const projectId = participant.project_id as string
    createdProjectIds.push(projectId)

    const projectResult = await db.execute({
      sql: 'SELECT * FROM projects WHERE id = ?',
      args: [projectId],
    })
    const project = projectResult.rows[0]!

    // In dev mode (pnpm run dev), mode should be 'test'
    expect(project.mode).toBe('test')
  })

  test('multiple participants share the same project record', async ({ page, context }) => {
    // First participant
    await readyButton(page).click()
    await page.getByRole('switch').click()
    await page.getByRole('button', { name: /Let's start/i }).click()
    await expect(page).toHaveURL(/\/demograph/)
    await page.waitForTimeout(1000)

    const firstResult = await db.execute(
      'SELECT * FROM participants ORDER BY created_at DESC LIMIT 1',
    )
    const firstParticipant = firstResult.rows[0]!
    createdParticipantIds.push(firstParticipant.id as string)
    const firstProjectId = firstParticipant.project_id as string
    createdProjectIds.push(firstProjectId)

    // Second participant in a fresh page
    const page2 = await context.newPage()
    await page2.goto('/welcome')
    await clearState(page2)
    await page2.goto('/welcome')
    await expect(readyButton(page2)).toBeVisible({ timeout: 10_000 })

    await readyButton(page2).click()
    await page2.getByRole('switch').click()
    await page2.getByRole('button', { name: /Let's start/i }).click()
    await expect(page2).toHaveURL(/\/demograph/)
    await page2.waitForTimeout(1000)

    const secondResult = await db.execute(
      'SELECT * FROM participants ORDER BY created_at DESC LIMIT 1',
    )
    const secondParticipant = secondResult.rows[0]!
    createdParticipantIds.push(secondParticipant.id as string)
    const secondProjectId = secondParticipant.project_id as string

    // Both participants should share the same project
    expect(firstProjectId).toBe(secondProjectId)

    // There should still be only one project row with this ID
    const projectCount = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM projects WHERE id = ?',
      args: [firstProjectId],
    })
    expect(Number(projectCount.rows[0]!.count)).toBe(1)

    await page2.close()
  })
})

// ---------------------------------------------------------------------------
// Project API routes (direct fetch, no browser UI)
// ---------------------------------------------------------------------------

test.describe('Project API auth and scoping', () => {
  let db: ReturnType<typeof createClient>
  const createdParticipantIds: string[] = []
  const createdProjectIds: string[] = []

  test.beforeAll(() => {
    db = getDB()
  })

  test.afterAll(async () => {
    await cleanupParticipants(db, createdParticipantIds)
    await cleanupProjects(db, createdProjectIds)
    db.close()
  })

  test('GET /api/projects returns projects for the current owner/repo', async ({ request }) => {
    // Create a participant to ensure at least one project exists
    const createRes = await request.post('/api/participants', {
      data: { data: { test: true } },
    })
    const { id } = await createRes.json()
    createdParticipantIds.push(id)

    // Get the project ID from the DB
    const participantResult = await db.execute({
      sql: 'SELECT project_id FROM participants WHERE id = ?',
      args: [id],
    })
    createdProjectIds.push(participantResult.rows[0]!.project_id as string)

    // In dev mode, no auth needed — should succeed
    const res = await request.get('/api/projects')
    expect(res.ok()).toBe(true)

    const projects = await res.json()
    expect(Array.isArray(projects)).toBe(true)
    expect(projects.length).toBeGreaterThanOrEqual(1)

    // Every returned project should have the expected fields
    for (const project of projects) {
      expect(project).toHaveProperty('id')
      expect(project).toHaveProperty('owner')
      expect(project).toHaveProperty('repo')
      expect(project).toHaveProperty('branch')
      expect(project).toHaveProperty('mode')
      expect(project).toHaveProperty('createdAt')
    }
  })

  test('GET /api/projects/:id/participants lists participants for a project', async ({ request }) => {
    // Create two participants (same request context is fine — each POST creates a new one)
    const res1 = await request.post('/api/participants', {
      data: { data: { user: 'p1' } },
    })
    const { id: id1 } = await res1.json()
    createdParticipantIds.push(id1)

    const res2 = await request.post('/api/participants', {
      data: { data: { user: 'p2' } },
    })
    const { id: id2 } = await res2.json()
    createdParticipantIds.push(id2)

    // Get the project ID
    const participantResult = await db.execute({
      sql: 'SELECT project_id FROM participants WHERE id = ?',
      args: [id1],
    })
    const projectId = participantResult.rows[0]!.project_id as string
    createdProjectIds.push(projectId)

    // List participants for this project
    const listRes = await request.get(`/api/projects/${encodeURIComponent(projectId)}/participants`)
    expect(listRes.ok()).toBe(true)

    const participants = await listRes.json()
    expect(Array.isArray(participants)).toBe(true)

    // Both participants should be in the list
    const participantIds = participants.map((p: { id: string }) => p.id)
    expect(participantIds).toContain(id1)
    expect(participantIds).toContain(id2)
  })

  test('GET /api/projects/:id/participants/:participantId returns full participant data', async ({ request }) => {
    const createRes = await request.post('/api/participants', {
      data: { data: { myField: 'hello' } },
    })
    const { id } = await createRes.json()
    createdParticipantIds.push(id)

    const participantResult = await db.execute({
      sql: 'SELECT project_id FROM participants WHERE id = ?',
      args: [id],
    })
    const projectId = participantResult.rows[0]!.project_id as string
    createdProjectIds.push(projectId)

    const res = await request.get(
      `/api/projects/${encodeURIComponent(projectId)}/participants/${id}`,
    )
    expect(res.ok()).toBe(true)

    const participant = await res.json()
    expect(participant.id).toBe(id)
    expect(participant.projectId).toBe(projectId)
    expect(participant.data).toBeDefined()
    expect(participant.data.myField).toBe('hello')
  })

  test('GET /api/projects/:id/participants returns 404 for nonexistent project', async ({ request }) => {
    const res = await request.get('/api/projects/nonexistent:project:id:test/participants')
    expect(res.status()).toBe(404)
  })

  test('GET /api/projects/:id/participants returns 403 for project from different owner/repo', async ({ request }) => {
    // Manually insert a project from a different owner/repo
    await db.execute({
      sql: 'INSERT OR IGNORE INTO projects (id, owner, repo, branch, mode, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: ['other-lab:other-exp:main:live', 'other-lab', 'other-exp', 'main', 'live', Date.now()],
    })
    createdProjectIds.push('other-lab:other-exp:main:live')

    const res = await request.get(
      `/api/projects/${encodeURIComponent('other-lab:other-exp:main:live')}/participants`,
    )
    expect(res.status()).toBe(403)
  })

  test('GET /api/projects/:id/participants/:participantId returns 403 for project from different owner/repo', async ({ request }) => {
    // The other-lab project was created in the previous test
    const res = await request.get(
      `/api/projects/${encodeURIComponent('other-lab:other-exp:main:live')}/participants/any-id`,
    )
    expect(res.status()).toBe(403)
  })

  test('GET /api/projects does not include projects from other owner/repo', async ({ request }) => {
    // Ensure the other-lab project exists
    await db.execute({
      sql: 'INSERT OR IGNORE INTO projects (id, owner, repo, branch, mode, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: ['foreign-lab:foreign-exp:main:live', 'foreign-lab', 'foreign-exp', 'main', 'live', Date.now()],
    })
    createdProjectIds.push('foreign-lab:foreign-exp:main:live')

    const res = await request.get('/api/projects')
    expect(res.ok()).toBe(true)

    const projects = await res.json()
    const foreignProjects = projects.filter(
      (p: { owner: string, repo: string }) => p.owner === 'foreign-lab' && p.repo === 'foreign-exp',
    )
    expect(foreignProjects.length).toBe(0)
  })

  test('GET /api/db-info returns current project info', async ({ request }) => {
    const res = await request.get('/api/db-info')
    expect(res.ok()).toBe(true)

    const info = await res.json()
    expect(info).toHaveProperty('type')
    expect(info).toHaveProperty('url')
    expect(info).toHaveProperty('project')
    expect(info.project).toHaveProperty('id')
    expect(info.project).toHaveProperty('owner')
    expect(info.project).toHaveProperty('repo')
    expect(info.project).toHaveProperty('branch')
    expect(info.project).toHaveProperty('mode')
    expect(info.project.mode).toBe('test')
  })
})
