/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, type Browser, type Page } from '@playwright/test'
import {
  N_TRIALS, answerTrials, cleanupParticipant, consent, finishView, getDB, openStroop, readSnapshot, savedStroopTrials, type DB,
} from './db-helpers'

/**
 * Step 3 of plans/sync_engine.md: the snapshot and resume, in the real app.
 *
 * The record and the position are one value in localStorage. When a page
 * loads, the copy with the higher rev is used, local or server. A copy that
 * is missing, damaged, from another participant or in the format the code
 * before this wrote must not stop the participant: they come back to the same
 * trial, and every trial is in the database exactly once at the end.
 */

/** The word on screen identifies the trial the participant is on */
const currentWord = async (page: Page) => ((await page.locator('h1.text-6xl').first().textContent()) ?? '').trim()

function inStore<T>(page: Page, body: string): Promise<T> {
  return page.evaluate((src) => {
    const app = (document.querySelector('#__nuxt') as any).__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('smilestore')

    return new Function('store', src)(store)
  }, body)
}

async function serverRow(db: DB, id: string) {
  const result = await db.execute({ sql: 'SELECT rev, resume, data FROM participants WHERE id = ?', args: [id] })
  const row = result.rows[0]!
  return { rev: Number(row.rev), resume: row.resume ? JSON.parse(row.resume as string) : null, data: JSON.parse(row.data as string) }
}

/** Save now and wait until the server has this rev */
async function saveNow(page: Page, db: DB, id: string) {
  await inStore(page, 'return store.saveData(true)')
  const rev = await inStore<number>(page, 'return store.browserEphemeral.savedRev')
  expect(rev).toBeGreaterThan(0)
  await expect.poll(async () => (await serverRow(db, id)).rev, { message: 'the server should have the saved rev' }).toBe(rev)
}

async function answerRest(page: Page) {
  for (let i = 0; i < 2 * N_TRIALS; i++) {
    if (await page.locator('#finish').isVisible()) return
    await page.keyboard.press('r')
    await page.waitForTimeout(250)
  }
}

async function expectEachTrialOnce(db: DB, id: string) {
  const trials = await savedStroopTrials(db, id, 15_000)
  const ids = trials.map(t => t.id).sort()
  expect(ids, 'each trial recorded exactly once').toEqual([...new Set(ids)].sort())
  expect(ids).toHaveLength(N_TRIALS)
}

test.describe('Snapshot and resume (plans/sync_engine.md, step 3)', () => {
  let db: DB
  let participantId: string | null = null
  const opened: Array<{ close: () => Promise<void> }> = []

  test.beforeAll(async () => {
    db = await getDB()
  })

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    for (const context of opened.splice(0)) await context.close()
    if (participantId) await cleanupParticipant(db, participantId)
    participantId = null
  })

  test.afterAll(() => {
    db.close()
  })

  /**
   * The same participant in a browser whose localStorage holds only what
   * `entries` says: a new context with the first one's cookies. The values
   * are written on a page of the same origin that doesn't run the app.
   */
  async function sameParticipant(browser: Browser, page: Page, baseURL: string, entries: Record<string, string> = {}) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1200, height: 900 } })
    opened.push(context)
    await context.addCookies(await page.context().cookies())
    const other = await context.newPage()
    await other.goto(`/api/participants/${participantId}`)
    await other.evaluate((values) => {
      localStorage.clear()
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value)
    }, entries)
    return other
  }

  async function snapshotKey(page: Page): Promise<string> {
    return page.evaluate(() => Object.keys(localStorage).find(k => k.startsWith('smilestore-'))!)
  }

  test('the record and the position are one value in localStorage', async ({ page }) => {
    participantId = await consent(page, db)
    await openStroop(page)
    await answerTrials(page, 2)

    const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('smilestore-')))
    expect(keys).toHaveLength(1)

    const snapshot = await readSnapshot(page)
    expect(snapshot.v).toBe(1)
    expect(snapshot.participantId).toBe(participantId)
    expect(snapshot.rev).toBeGreaterThan(0)
    expect(snapshot.resume.view).toBe('stroop')
    expect(snapshot.resume.viewSteppers.stroop.data.stepperState).toBeTruthy()
    const trials = Object.values(snapshot.data.pageData_stroop).flatMap((visit: any) => visit.data)
    expect(trials).toHaveLength(2)
  })

  test('a save carries the rev, the record and the position of the current View only', async ({ page }) => {
    participantId = await consent(page, db)
    await openStroop(page)
    await answerTrials(page, 3)
    await saveNow(page, db, participantId)

    const row = await serverRow(db, participantId)
    expect(row.rev).toBeGreaterThan(0)
    expect(row.resume.view).toBe('stroop')
    expect(Object.keys(row.resume.viewSteppers)).toEqual(['stroop'])
    expect(row.data.resume).toBeUndefined() // the position is not part of the record
  })

  test('with no local copy, the participant resumes from the server copy at the same trial', async ({ page, browser, baseURL }) => {
    test.setTimeout(90_000)
    participantId = await consent(page, db)
    await openStroop(page)
    await answerTrials(page, 3)
    await saveNow(page, db, participantId)
    const word = await currentWord(page)

    const other = await sameParticipant(browser, page, baseURL!)
    await other.goto('/stroop')
    await expect(other.locator('#prompt')).toBeVisible({ timeout: 15_000 })
    expect(await currentWord(other)).toBe(word)

    await answerRest(other)
    await finishView(other)
    await expectEachTrialOnce(db, participantId)
  })

  for (const [name, raw] of [
    ['text that is not JSON', '{not json'],
    ['a JSON array', '[1,2,3]'],
    ['a snapshot with every field of the wrong type', '{"v":1,"participantId":7,"rev":"x","data":[],"resume":"x","local":3}'],
  ] as const) {
    test(`a damaged local copy (${name}) does not stop the page: the server copy is used`, async ({ page, browser, baseURL }) => {
      test.setTimeout(90_000)
      participantId = await consent(page, db)
      await openStroop(page)
      await answerTrials(page, 2)
      await saveNow(page, db, participantId)
      const word = await currentWord(page)

      const other = await sameParticipant(browser, page, baseURL!, { [await snapshotKey(page)]: raw })
      await other.goto('/stroop')
      await expect(other.locator('#prompt')).toBeVisible({ timeout: 15_000 })
      expect(await currentWord(other)).toBe(word)

      await answerRest(other)
      await finishView(other)
      await expectEachTrialOnce(db, participantId)
      expect((await readSnapshot(other)).participantId).toBe(participantId)
    })
  }

  test('a local copy from another participant is not used', async ({ page, browser, baseURL }) => {
    test.setTimeout(90_000)
    participantId = await consent(page, db)
    await openStroop(page)
    await answerTrials(page, 2)
    await saveNow(page, db, participantId)
    const word = await currentWord(page)

    const snapshot = await readSnapshot(page)
    snapshot.participantId = 'someone-else'
    snapshot.rev = 9999
    snapshot.data.fromSomeoneElse = true
    snapshot.resume.conditions = { leaked: 'yes' }
    const other = await sameParticipant(browser, page, baseURL!, { [await snapshotKey(page)]: JSON.stringify(snapshot) })
    await other.goto('/stroop')
    await expect(other.locator('#prompt')).toBeVisible({ timeout: 15_000 })

    expect(await currentWord(other)).toBe(word)
    expect(await inStore(other, 'return store.data.fromSomeoneElse')).toBeUndefined()
    expect(await inStore(other, 'return store.localState.conditions.leaked')).toBeUndefined()

    await answerRest(other)
    await finishView(other)
    await expectEachTrialOnce(db, participantId)
    expect((await serverRow(db, participantId)).data.fromSomeoneElse).toBeUndefined()
  })

  test('a participant saved by the code before this resumes, with the trials that were not saved yet', async ({ page, browser, baseURL }) => {
    test.setTimeout(90_000)
    participantId = await consent(page, db)
    await openStroop(page)
    await answerTrials(page, 3) // not saved: the old code saved on a view change
    const word = await currentWord(page)

    // What the old code kept: localState under the key, the data backup
    // beside it, and a server row with no rev and no resume
    const snapshot = await readSnapshot(page)
    const key = await snapshotKey(page)
    const { view: _view, ...oldLocalState } = snapshot.resume
    const entries = {
      [key]: JSON.stringify({ ...oldLocalState, ...snapshot.local, routes: [], seqtimeline: [] }),
      [`${key}-data`]: JSON.stringify({ participantId, rev: 6, savedRev: 1, data: snapshot.data }),
    }
    await db.execute({ sql: 'UPDATE participants SET rev = 0, resume = NULL WHERE id = ?', args: [participantId] })

    const other = await sameParticipant(browser, page, baseURL!, entries)
    await other.goto('/stroop')
    await expect(other.locator('#prompt')).toBeVisible({ timeout: 15_000 })
    expect(await currentWord(other)).toBe(word)

    // The three trials came from the old backup and are saved at once
    await expect.poll(async () => Object.values((await serverRow(db, participantId!)).data.pageData_stroop ?? {})
      .flatMap((visit: any) => visit.data).length).toBe(3)

    await answerRest(other)
    await finishView(other)
    await expectEachTrialOnce(db, participantId)

    // Afterwards there is one value, in the new format
    const keys = await other.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('smilestore-')))
    expect(keys).toEqual([key])
    expect((await readSnapshot(other)).v).toBe(1)
    expect((await serverRow(db, participantId)).resume).toBeTruthy()
  })

  test('when the server cannot be reached at load, the local copy is used and saved later', async ({ page }) => {
    test.setTimeout(90_000)
    participantId = await consent(page, db)
    await openStroop(page)
    await answerTrials(page, 3)
    const word = await currentWord(page)

    await page.route(url => url.pathname.endsWith(`/api/participants/${participantId}`), route =>
      route.request().method() === 'GET' ? route.abort('connectionfailed') : route.continue())
    await page.reload()
    await expect(page.locator('#prompt')).toBeVisible({ timeout: 15_000 })
    expect(await currentWord(page)).toBe(word)
    await page.unrouteAll({ behavior: 'ignoreErrors' })

    await answerRest(page)
    await finishView(page)
    await expectEachTrialOnce(db, participantId)
  })

  test('the last route in the snapshot wins over the cookie', async ({ page }) => {
    participantId = await consent(page, db)
    await openStroop(page)
    await answerTrials(page, 1)

    // The cookie falls behind (it is written separately from the snapshot)
    const cookies = await page.context().cookies()
    const lastRoute = cookies.find(c => /^smile_.*_lastRoute$/.test(c.name))!
    await page.context().addCookies([{ ...lastRoute, value: lastRoute.value.replace('stroop', 'demograph') }])

    await page.goto('/demograph')
    await expect(page).toHaveURL(/\/stroop$/)
    await expect(page.locator('#prompt')).toBeVisible({ timeout: 15_000 })
  })
})
