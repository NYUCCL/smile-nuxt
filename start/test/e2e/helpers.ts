import { type Page } from '@playwright/test'

/**
 * Clear all browser state so each test starts as a fresh user.
 */
export async function clearState(page: Page) {
  await page.context().clearCookies()
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
}

/**
 * Select an option from a reka-ui Select/Combobox component.
 */
export async function selectOption(page: Page, triggerLocator: ReturnType<Page['locator']>, optionText: string) {
  await triggerLocator.click()
  await page.getByRole('option', { name: optionText, exact: true }).click()
}

/**
 * Fill all required fields on demographic survey page 1.
 */
export async function fillDemographicsPage1(page: Page) {
  await page.getByRole('button', { name: /Pick a date/i }).click()
  await page.locator('button:has-text("15")').first().click()

  const selects = page.locator('[role="combobox"]')
  await selectOption(page, selects.nth(0), 'Male')
  await selectOption(page, selects.nth(1), 'Asian')
  await selectOption(page, selects.nth(2), 'No')
  await selectOption(page, selects.nth(3), 'Yes')

  await page.getByRole('button', { name: /Continue/i }).click()
}

/**
 * Fill all required fields on demographic survey page 2.
 */
export async function fillDemographicsPage2(page: Page) {
  const selects = page.locator('[role="combobox"]')
  await selectOption(page, selects.nth(0), 'Yes')
  await selectOption(page, selects.nth(1), 'No')
  await selectOption(page, selects.nth(2), 'No')
  await selectOption(page, selects.nth(3), 'No')
  await selectOption(page, selects.nth(4), 'No')

  await page.getByRole('button', { name: /Continue/i }).click()
}

/**
 * Fill all required fields on demographic survey page 3.
 */
export async function fillDemographicsPage3(page: Page) {
  const selects = page.locator('[role="combobox"]')
  await selectOption(page, selects.nth(0), 'United States')
  await page.locator('input[placeholder*="zip"]').fill('10003')
  await selectOption(page, selects.nth(1), 'Doctorate Degree (PhD/Other)')
  await selectOption(page, selects.nth(2), 'Less than $20,000')

  await page.getByRole('button', { name: /That was easy/i }).click()
}
