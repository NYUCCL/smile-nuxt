/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, type Page, type Route } from '@playwright/test'
import {
  N_TRIALS, cleanupParticipant, consent, finishView, getDB, openStroop, savedStroopTrials, stroopTrials, getParticipant, type DB,
} from './db-helpers'

/**
 * Step 0 of plans/sync_engine.md: how saving behaves today under reloads,
 * network trouble and bad data, in the real app.
 *
 * Each test states what the sync engine must do. Tests today's code fails are
 * marked `test.fail()` with the reason; when a later step makes one pass,
 * Playwright reports it as an unexpected pass: remove the mark.
 *
 * All of them use the Stroop view (9 trials) and check the participants
 * table, which is what researchers analyze.
 */

/**
 * Known failures run as `test.fail()`. SHOW_KNOWN_FAILURES=1 runs them as
 * plain tests, to see why each one fails.
 */
const KNOWN = !process.env.SHOW_KNOWN_FAILURES

/** Run `body` inside the page with the smilestore */
function inStore<T>(page: Page, body: string): Promise<T> {
  return page.evaluate((src) => {
    const app = (document.querySelector('#__nuxt') as any).__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('smilestore')

    return new Function('store', src)(store)
  }, body)
}

/** Answer one trial and wait until the view has moved on */
async function answerOne(page: Page) {
  await page.keyboard.press('r')
  await page.waitForTimeout(250)
}

/** Answer until the summary screen shows (at most `max` presses) */
async function answerToEnd(page: Page, max = 2 * N_TRIALS) {
  for (let i = 0; i < max; i++) {
    if (await page.locator('#finish').isVisible()) return
    await answerOne(page)
  }
}

async function reloadStroop(page: Page) {
  await page.reload()
  await expect(page.locator('#prompt')).toBeVisible({ timeout: 15_000 })
}

/** Every Stroop trial is in the row exactly once */
async function expectEachTrialOnce(db: DB, id: string, timeout = 10_000) {
  const trials = await savedStroopTrials(db, id, timeout)
  const ids = trials.map(t => t.id).sort()
  expect(ids, 'each trial recorded exactly once').toEqual([...new Set(ids)].sort())
  expect(ids).toHaveLength(N_TRIALS)
}

/** Requests that save the participant's data (not the private record) */
const isDataSave = (id: string) => (url: URL) => url.pathname.endsWith(`/api/participants/${id}`)

test.describe('Sync characterization (plans/sync_engine.md, step 0)', () => {
  let db: DB
  let participantId: string | null = null

  test.beforeAll(async () => {
    db = await getDB()
  })

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await page.context().setOffline(false)
    if (participantId) await cleanupParticipant(db, participantId)
    participantId = null
  })

  test.afterAll(() => {
    db.close()
  })

  test.describe('reloads', () => {
    test('reloading at many points records every trial exactly once', async ({ page }) => {
      test.setTimeout(180_000)
      participantId = await consent(page, db)
      await openStroop(page)

      // After a trial
      await answerOne(page)
      await reloadStroop(page)
      // Twice in a row, with nothing done in between
      await reloadStroop(page)
      // Straight after a keypress, without waiting
      await page.keyboard.press('r')
      await reloadStroop(page)
      // After two trials
      await answerOne(page)
      await answerOne(page)
      await reloadStroop(page)
      // While the save that follows a reload is in flight
      const saving = page.waitForRequest(r => r.method() === 'PATCH' && isDataSave(participantId!)(new URL(r.url())))
      await page.reload()
      await saving
      await reloadStroop(page)
      // Again straight after a keypress
      await page.keyboard.press('r')
      await reloadStroop(page)

      await answerToEnd(page)
      await finishView(page)
      await expectEachTrialOnce(db, participantId)
    })
  })

  test.describe('network trouble', () => {
    test('trials reach the database during the view, without a view change', async ({ page }) => {
      test.fail(KNOWN, 'today data is saved only on a view change or an explicit saveData()')
      participantId = await consent(page, db)
      await openStroop(page)
      for (let i = 0; i < 3; i++) await answerOne(page)
      await expect.poll(async () => stroopTrials(await getParticipant(db, participantId!)).length, { timeout: 10_000 })
        .toBe(3)
    })

    test('a save that fails is retried without anything else happening', async ({ page }) => {
      test.fail(KNOWN, 'today a failed save is not retried; the data waits for the next save')
      participantId = await consent(page, db)
      await openStroop(page)
      await page.route(isDataSave(participantId), (route: Route) =>
        route.request().method() === 'PATCH' ? route.abort('connectionreset') : route.continue())
      await answerToEnd(page)
      await finishView(page)
      await page.waitForTimeout(1_000)
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await expectEachTrialOnce(db, participantId, 15_000)
    })

    test('a response lost after the server stored the save does no harm', async ({ page }) => {
      participantId = await consent(page, db)
      await openStroop(page)
      await page.route(isDataSave(participantId), async (route: Route) => {
        if (route.request().method() !== 'PATCH') return route.continue()
        await route.fetch() // the server gets it and stores it
        await route.abort('connectionreset') // the page never hears back
      })
      await answerToEnd(page)
      await finishView(page)
      await expectEachTrialOnce(db, participantId)
    })

    test('reloading while saves fail loses nothing once they work again', async ({ page }) => {
      test.setTimeout(90_000)
      participantId = await consent(page, db)
      await openStroop(page)
      await page.route(isDataSave(participantId), (route: Route) =>
        route.request().method() === 'PATCH' ? route.abort('connectionreset') : route.continue())
      for (let i = 0; i < 4; i++) await answerOne(page)
      await reloadStroop(page)
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await answerToEnd(page)
      await finishView(page)
      await expectEachTrialOnce(db, participantId)
    })

    test('offline mid-view, then online: the trials reach the database', async ({ page }) => {
      test.fail(KNOWN, 'today nothing is sent when the connection comes back')
      participantId = await consent(page, db)
      await openStroop(page)
      await page.context().setOffline(true)
      await answerToEnd(page)
      await page.context().setOffline(false)
      await expectEachTrialOnce(db, participantId, 15_000)
    })
  })

  test.describe('bad data from the page', () => {
    test('a BigInt in a window event does not stop saving', async ({ page }) => {
      participantId = await consent(page, db)
      await openStroop(page)
      await answerOne(page)
      await inStore(page, `store.recordWindowEvent('custom', { n: BigInt(1) })`)
      await answerToEnd(page)
      await finishView(page)
      await expectEachTrialOnce(db, participantId)
    })

    test('a circular value in persist does not stop the task or saving', async ({ page }) => {
      participantId = await consent(page, db)
      await openStroop(page)
      await answerOne(page)
      await inStore(page, `
        const loop = { name: 'loop' }
        loop.self = loop
        store.browserEphemeral.steppers.stroop.root.data.gvars.loop = loop
      `)
      await answerToEnd(page)
      await finishView(page)
      await expectEachTrialOnce(db, participantId)
    })
  })

  test.describe('bad requests to the save endpoint', () => {
    // A save the server can't use is refused with a 4xx that says why, and
    // the stored row is left as it was. Never a 500.
    const BAD_BODIES: { name: string, body: string }[] = [
      { name: 'invalid JSON', body: '{"data": {"a": 1' },
      { name: 'no data field', body: '{}' },
      { name: 'data is null', body: '{"data": null}' },
      { name: 'data is a string', body: '{"data": "text"}' },
      { name: 'data is an array', body: '{"data": [1, 2]}' },
      { name: 'data is a number', body: '{"data": 5}' },
      { name: 'body is an array', body: '[1, 2]' },
      { name: 'a 6 MB body', body: JSON.stringify({ data: { big: 'x'.repeat(6_000_000) } }) },
    ]

    for (const bad of BAD_BODIES) {
      test(`${bad.name}: refused with a 4xx, row unchanged`, async ({ page }) => {
        participantId = await consent(page, db)
        const before = await getParticipant(db, participantId)
        const res = await page.request.patch(`/api/participants/${participantId}`, {
          data: bad.body,
          headers: { 'Content-Type': 'application/json' },
          failOnStatusCode: false,
        })
        expect(res.status(), await res.text()).toBeGreaterThanOrEqual(400)
        expect(res.status()).toBeLessThan(500)
        expect(await getParticipant(db, participantId)).toEqual(before)
      })
    }
  })
})
