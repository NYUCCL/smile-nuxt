import { test, expect } from '@playwright/test'
import { clearState, fillDemographicsPage1, fillDemographicsPage2, fillDemographicsPage3 } from './helpers'

test.describe('Full experiment flow', () => {
  const readyButton = page => page.getByRole('button', { name: /I'm ready/i })

  test.beforeEach(async ({ page }) => {
    await page.goto('/welcome')
    await clearState(page)
    await page.goto('/welcome')
    await expect(readyButton(page)).toBeVisible({ timeout: 10_000 })
  })

  test('renders the welcome/advertisement page on first visit', async ({ page }) => {
    await expect(readyButton(page)).toBeVisible()
    await expect(page.getByText(/Please help us/i)).toBeVisible()
  })

  test('navigates through welcome -> consent -> demographics', async ({ page }) => {
    // Welcome
    await readyButton(page).click()

    // Should arrive at consent
    await expect(page).toHaveURL(/\/consent/)
    await expect(page.getByRole('heading', { name: /Informed Consent/i })).toBeVisible()

    // Toggle consent switch
    await page.getByRole('switch').click()

    // "Let's start" button should appear
    const startBtn = page.getByRole('button', { name: /Let's start/i })
    await expect(startBtn).toBeVisible()
    await startBtn.click()

    // Should arrive at demographics
    await expect(page).toHaveURL(/\/demograph/)
  })

  test('blocks skipping ahead without consent', async ({ page }) => {
    await page.goto('/demograph')
    await page.waitForTimeout(500)
    expect(page.url()).not.toContain('/demograph')
  })

  test('completes welcome through demographics', async ({ page }) => {
    test.setTimeout(60_000)

    // === Welcome ===
    await readyButton(page).click()
    await expect(page).toHaveURL(/\/consent/)

    // === Consent ===
    await page.getByRole('switch').click()
    await page.getByRole('button', { name: /Let's start/i }).click()
    await expect(page).toHaveURL(/\/demograph/)

    // === Demographics (3 pages) ===
    await fillDemographicsPage1(page)
    await fillDemographicsPage2(page)
    await fillDemographicsPage3(page)

    // Should land on window sizer
    await expect(page).toHaveURL(/\/windowsizer/)
  })

  test('completes welcome through instructions quiz with correct answers', async ({ page }) => {
    test.setTimeout(90_000)

    // === Welcome -> Consent ===
    await readyButton(page).click()
    await page.getByRole('switch').click()
    await page.getByRole('button', { name: /Let's start/i }).click()

    // === Demographics ===
    await fillDemographicsPage1(page)
    await fillDemographicsPage2(page)
    await fillDemographicsPage3(page)

    // === Window Sizer ===
    await expect(page).toHaveURL(/\/windowsizer/)
    await page.getByRole('button', { name: /visible now.*ready/i }).click()

    // === Instructions ===
    await expect(page).toHaveURL(/\/instructions/)
    await page.getByRole('button', { name: /next/i }).click()

    // === Instructions Quiz ===
    await expect(page).toHaveURL(/\/quiz/)

    // Correct answers for the quiz (questions are randomized within each page)
    // Page 1: two single-select combobox questions
    //   "What color is the sky?" → "blue"
    //   "How many days are in a non-leap year?" → "365"
    // Page 2: two single-select + one multi-select
    //   "What comes next: North, South, East, ___" → "West"
    //   "What's 7 x 7?" → "49"
    //   "Who is in Todd's lab?" → check "Pat" and "Ellen" only

    // Helper: select a correct answer for a single-select question by finding
    // the label with the question text, going to its parent div, and clicking the combobox
    const answerSelect = async (questionText: string | RegExp, answer: string) => {
      const label = page.locator('label').filter({ hasText: questionText })
      const combobox = label.locator('..').locator('[role="combobox"]')
      await combobox.click()
      await page.getByRole('option', { name: answer, exact: true }).click()
      await page.waitForTimeout(200)
    }

    // Helper: check specific checkboxes for a multi-select question
    const answerMultiSelect = async (answers: string[]) => {
      for (const answer of answers) {
        await page.getByRole('checkbox', { name: answer, exact: true }).check()
      }
    }

    // --- Page 1 ---
    await answerSelect(/What color is the sky/, 'blue')
    await answerSelect(/How many days/, '365')

    // Click "Next page"
    const nextPageBtn = page.getByRole('button', { name: /Next page/i })
    await expect(nextPageBtn).toBeEnabled()
    await nextPageBtn.click()

    // --- Page 2 ---
    // Wait for page 2 content to render
    await expect(page.getByText(/Who is in Todd's lab/)).toBeVisible()

    await answerSelect(/What comes next/, 'West')
    await answerSelect(/7 x 7/, '49')
    await answerMultiSelect(['Pat', 'Ellen'])

    // Submit
    const submitBtn = page.getByRole('button', { name: /Submit/i })
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // Should see "Congrats! You passed." since we gave correct answers
    await expect(page.getByText(/Congrats/i)).toBeVisible({ timeout: 5000 })
  })

  test('loops back to instructions on wrong quiz answers', async ({ page }) => {
    test.setTimeout(90_000)

    // === Welcome -> Consent ===
    await readyButton(page).click()
    await page.getByRole('switch').click()
    await page.getByRole('button', { name: /Let's start/i }).click()

    // === Demographics ===
    await fillDemographicsPage1(page)
    await fillDemographicsPage2(page)
    await fillDemographicsPage3(page)

    // === Window Sizer ===
    await expect(page).toHaveURL(/\/windowsizer/)
    await page.getByRole('button', { name: /visible now.*ready/i }).click()

    // === Instructions ===
    await expect(page).toHaveURL(/\/instructions/)
    await page.getByRole('button', { name: /next/i }).click()

    // === Instructions Quiz ===
    await expect(page).toHaveURL(/\/quiz/)

    // Helper: pick first available option (likely wrong) for a combobox question
    const answerSelectWrong = async (questionText: string | RegExp) => {
      const label = page.locator('label').filter({ hasText: questionText })
      const combobox = label.locator('..').locator('[role="combobox"]')
      await combobox.click()
      await page.getByRole('option').first().click()
      await page.waitForTimeout(200)
    }

    // --- Page 1: give wrong answers ---
    await answerSelectWrong(/What color is the sky/)
    await answerSelectWrong(/How many days/)

    const nextPageBtn = page.getByRole('button', { name: /Next page/i })
    await expect(nextPageBtn).toBeEnabled()
    await nextPageBtn.click()

    // --- Page 2: give wrong answers ---
    await expect(page.getByText(/Who is in Todd's lab/)).toBeVisible()
    await answerSelectWrong(/What comes next/)
    await answerSelectWrong(/7 x 7/)
    // Check wrong checkboxes
    await page.getByRole('checkbox', { name: 'Jimbo', exact: true }).check()
    await page.getByRole('checkbox', { name: 'Roger', exact: true }).check()

    const submitBtn = page.getByRole('button', { name: /Submit/i })
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // Should see "Sorry" message and "Back to Instructions" button
    await expect(page.getByText(/Sorry/i)).toBeVisible({ timeout: 5000 })
    const backBtn = page.getByRole('button', { name: /Back to Instructions/i })
    await expect(backBtn).toBeVisible()
    await backBtn.click()

    // Should be sent back to instructions
    await expect(page).toHaveURL(/\/instructions/)
  })
})
