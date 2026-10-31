import { test, expect, type Page } from '@playwright/test'
import { clearState, fillDemographicsPage1, fillDemographicsPage2, fillDemographicsPage3 } from './helpers'

/**
 * Route guards for a *live, consented participant* partway through the study.
 *
 * Smile's promise: a participant can't skip ahead, can't go back, and always
 * lands on the page where they left off (reload, back button, typed URL, new
 * tab, returning later). guards.spec.ts covers unconsented visitors; these
 * tests cover someone mid-study, using the real (non-dev) routes.
 *
 * Every test starts with the participant on /instructions (playground timeline:
 * welcome → consent → demograph → windowsizer → instructions → quiz → experiment
 * → … → thanks), so there are routes both behind and ahead of them.
 */

const HOME = '/instructions'
// Soft assertions: report every URL that slips through, not just the first.
const softExpect = expect.configure({ soft: true })
const readyButton = (page: Page) => page.getByRole('button', { name: /I'm ready/i })
const instructionsNext = (page: Page) => page.getByRole('button', { name: /next/i })

/** Walk a fresh participant from welcome to /instructions through the real UI. */
async function advanceToInstructions(page: Page) {
  await page.goto('/welcome')
  await clearState(page)
  await page.goto('/welcome')
  await readyButton(page).click()
  await page.getByRole('switch').click()
  await page.getByRole('button', { name: /Let's start/i }).click()
  await expect(page).toHaveURL(/\/demograph$/)
  await fillDemographicsPage1(page)
  await fillDemographicsPage2(page)
  await fillDemographicsPage3(page)
  await expect(page).toHaveURL(/\/windowsizer$/)
  await page.getByRole('button', { name: /visible now.*ready/i }).click()
  await expectOnInstructions(page)
}

/** Assert the participant ended up on /instructions and the view rendered. */
async function expectOnInstructions(page: Page, context = '') {
  await expect.poll(() => new URL(page.url()).pathname, {
    message: `participant should be returned to ${HOME}${context ? ` (${context})` : ''}`,
    timeout: 10_000,
  }).toBe(HOME)
  await expect(instructionsNext(page)).toBeVisible({ timeout: 10_000 })
}

/** Soft-check one typed URL: the participant must be sent back to /instructions. */
async function tryUrl(page: Page, path: string) {
  await page.goto(path)
  await softExpect.poll(() => new URL(page.url()).pathname, {
    message: `typing ${path} should return the participant to ${HOME}`,
    timeout: 10_000,
  }).toBe(HOME)
}

test.describe('Route guards for a consented participant mid-study', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000)
    await advanceToInstructions(page)
  })

  test('reloading keeps the participant on their current page', async ({ page }) => {
    await page.reload()
    await expectOnInstructions(page, 'after reload')
    await page.reload()
    await expectOnInstructions(page, 'after second reload')
  })

  test('visiting the site root returns them to their current page', async ({ page }) => {
    await page.goto('/')
    await expectOnInstructions(page, 'after visiting /')
  })

  test('typing a later route cannot skip ahead', async ({ page }) => {
    // /quiz is the immediate next route; the others are further ahead.
    for (const path of ['/quiz', '/experiment', '/stroop', '/debrief', '/thanks']) {
      await tryUrl(page, path)
    }
  })

  test('typing an earlier route cannot go back', async ({ page }) => {
    for (const path of ['/demograph', '/consent']) {
      await tryUrl(page, path)
    }
  })

  test('typing the immediately previous route cannot go back', async ({ page }) => {
    // Known bug: fails today, the participant is left on /windowsizer.
    // Guard 18 redirects to lastRoute (instructions), but during that redirect
    // `from` is windowsizer, whose meta.next is instructions and which isn't
    // done, so Guard 16 redirects to instructions again, looping ~30 times
    // until the router gives up. Guard 16 runs before Guard 17 ("going to
    // lastRoute is always allowed"). Earlier routes are unaffected because
    // their `next` isn't the current page. Remove test.fail() when fixed.
    test.fail()
    await page.goto('/windowsizer')
    await expectOnInstructions(page, 'typed /windowsizer')
  })

  test('typing a welcome route cannot go back to the start', async ({ page }) => {
    for (const path of ['/welcome', '/welcome/prolific']) {
      await tryUrl(page, path)
    }
  })

  test('opening an allowAlways page (/mturk) does not take over their place', async ({ page }) => {
    // Known bug: fails today, and the participant is locked out of the study.
    // Guard 8 lets anyone onto an allowAlways route, and the post-guard then
    // sets lastRoute = 'mturk'. Afterwards every study route (and /) redirects
    // to /mturk. Whether a mid-study participant may *view* /mturk is a design
    // choice; losing their place is not. Remove test.fail() when fixed.
    test.fail()
    await page.goto('/mturk')
    // Stay on the page briefly, like a real visitor; the lastRoute cookie is
    // written by the client after navigation, not synchronously.
    await page.waitForTimeout(2_000)
    await page.goto('/')
    await expectOnInstructions(page, 'visited /mturk, then /')
  })

  test('an unknown path returns them to their current page', async ({ page }) => {
    await tryUrl(page, '/not-a-real-route')
  })

  test('the browser back button cannot go back', async ({ page }) => {
    await page.goBack()
    await expectOnInstructions(page, 'after one back')
    await page.goBack()
    await expectOnInstructions(page, 'after two backs')
  })

  test('a new tab opens on their current page', async ({ context }) => {
    const tab = await context.newPage()
    await tab.goto('/consent')
    await expectOnInstructions(tab, 'new tab opened at /consent')
    await tab.close()
  })

  test('returning later (new page, same browser) resumes where they left off', async ({ page, context }) => {
    await page.close()
    const later = await context.newPage()
    await later.goto('/')
    await expectOnInstructions(later, 'returning via /')
  })

  test('blocked navigation attempts do not lose their place', async ({ page }) => {
    // Try going back to the start, then reload: they should still be on
    // /instructions, and still able to continue forward normally.
    await page.goto('/welcome')
    await page.goto('/consent')
    await page.reload()
    await expectOnInstructions(page, 'after attempts + reload')

    await instructionsNext(page).click()
    await expect.poll(() => new URL(page.url()).pathname, {
      message: 'participant should still be able to continue to /quiz',
      timeout: 10_000,
    }).toBe('/quiz')
  })
})
