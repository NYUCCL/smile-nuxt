import type { Page } from '@playwright/test'

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
 * Select an option from a reka-ui Select component by its label text.
 * Clicks the trigger, waits for the listbox, then clicks the option.
 */
export async function selectOption(page: Page, triggerLocator: ReturnType<Page['locator']>, optionText: string) {
  await triggerLocator.click()
  // reka-ui renders options in a listbox role
  await page.getByRole('option', { name: optionText, exact: true }).click()
}

/**
 * Fill all required fields on demographic survey page 1.
 */
export async function fillDemographicsPage1(page: Page) {
  // Date of birth — click the popover trigger and pick a date
  await page.getByRole('button', { name: /Pick a date/i }).click()
  // The MonthYearDayPicker renders day buttons; click one
  // First set year/month if needed, then click a day
  // For simplicity, just click any available day number
  await page.locator('button:has-text("15")').first().click()

  // Gender
  const selects = page.locator('[role="combobox"]')
  await selectOption(page, selects.nth(0), 'Male')
  // Race
  await selectOption(page, selects.nth(1), 'Asian')
  // Hispanic
  await selectOption(page, selects.nth(2), 'No')
  // English fluency
  await selectOption(page, selects.nth(3), 'Yes')

  // Click Continue
  await page.getByRole('button', { name: /Continue/i }).click()
}

/**
 * Fill all required fields on demographic survey page 2.
 */
export async function fillDemographicsPage2(page: Page) {
  const selects = page.locator('[role="combobox"]')
  await selectOption(page, selects.nth(0), 'Yes') // normal vision
  await selectOption(page, selects.nth(1), 'No') // color blind
  await selectOption(page, selects.nth(2), 'No') // learning disability
  await selectOption(page, selects.nth(3), 'No') // neurodevelopmental
  await selectOption(page, selects.nth(4), 'No') // psychiatric

  await page.getByRole('button', { name: /Continue/i }).click()
}

/**
 * Fill all required fields on demographic survey page 3.
 */
export async function fillDemographicsPage3(page: Page) {
  const selects = page.locator('[role="combobox"]')
  await selectOption(page, selects.nth(0), 'United States') // country
  // Zipcode (optional text input)
  await page.locator('input[placeholder*="zip"]').fill('10003')
  await selectOption(page, selects.nth(1), 'Doctorate Degree (PhD/Other)') // education
  await selectOption(page, selects.nth(2), 'Less than $20,000') // income

  await page.getByRole('button', { name: /That was easy/i }).click()
}
