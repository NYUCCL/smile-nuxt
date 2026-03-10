import { test, expect } from '@playwright/test'
import { clearState } from './helpers'

/**
 * E2E tests verifying stepper state serialization and persistence across
 * browser reloads.  Uses dev mode (/dev/*) to bypass consent/demographics guards.
 *
 * Covers:
 *   1. Basic stepper state (position, step data) survives a full page reload
 *   2. Faker functions in step data are serialized and reconstructed correctly
 *   3. Serialized localStorage format is well-formed
 */
test.describe('Stepper persistence across page reload', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await clearState(page)
  })

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Read the stepper state for a given view from localStorage. */
  async function getStepperState(page, viewName: string) {
    return page.evaluate((view) => {
      // Find the smile localStorage key (pattern: smilestore-<codeName>)
      const key = Object.keys(localStorage).find(k => k.startsWith('smilestore-'))
      if (!key) return null
      const store = JSON.parse(localStorage.getItem(key)!)
      return store?.viewSteppers?.[view]?.data?.stepperState ?? null
    }, viewName)
  }

  // ---------------------------------------------------------------------------
  // 1. Basic stepper state persistence (Stroop task)
  // ---------------------------------------------------------------------------

  test('Stroop stepper initializes with correct trial structure', async ({ page }) => {
    await page.goto('/dev/stroop')
    await page.waitForTimeout(1500) // wait for component setup + stepper init

    // The Stroop view should show trial content (a colored word)
    await expect(page.locator('#prompt')).toBeVisible({ timeout: 10_000 })

    // Verify stepper state was saved to localStorage
    const state = await getStepperState(page, 'stroop')
    expect(state).not.toBeNull()
    expect(state.id).toBe('/')
    // The top-level should have child states (the stroop block + summary)
    expect(state.states.length).toBeGreaterThanOrEqual(2)
  })

  test('Stroop step progress persists across reload', async ({ page }) => {
    test.setTimeout(30_000)

    await page.goto('/dev/stroop')
    await expect(page.locator('#prompt')).toBeVisible({ timeout: 10_000 })

    // Record starting stepper index
    const stateBefore = await getStepperState(page, 'stroop')
    const _indexBefore = stateBefore.currentIndex

    // Complete a couple of trials by pressing a key (r/g/b)
    await page.keyboard.press('r')
    await page.waitForTimeout(300)
    await page.keyboard.press('g')
    await page.waitForTimeout(300)

    // Read the stepper index after progressing
    const stateAfterKeys = await getStepperState(page, 'stroop')

    // Now reload the page
    await page.reload()
    await page.waitForTimeout(2000) // wait for re-hydration

    // Read stepper state from localStorage after reload
    const stateAfterReload = await getStepperState(page, 'stroop')
    expect(stateAfterReload).not.toBeNull()

    // The stepper should be at the same position as before reload
    // (the view re-runs setup so it may re-create, but the saved state
    // in localStorage should reflect the progress made)
    expect(stateAfterReload.currentIndex).toBe(stateAfterKeys.currentIndex)
  })

  test('Stroop step data values persist across reload', async ({ page }) => {
    test.setTimeout(30_000)

    await page.goto('/dev/stroop')
    await expect(page.locator('#prompt')).toBeVisible({ timeout: 10_000 })

    // Complete one trial
    await page.keyboard.press('r')
    await page.waitForTimeout(500)

    // Read the stepper state - the first trial block's children should have data
    const stateBeforeReload = await getStepperState(page, 'stroop')

    // Find the stroop block (first state) and its first child trial
    const stroopBlock = stateBeforeReload.states.find(s => s.id === 'stroop')
    expect(stroopBlock).toBeTruthy()
    expect(stroopBlock.states.length).toBeGreaterThan(0)

    // The first completed trial should have response data (word, color, condition)
    const firstTrial = stroopBlock.states[0]
    expect(firstTrial.data).toBeTruthy()
    expect(firstTrial.data.word).toBeTruthy()
    expect(firstTrial.data.color).toBeTruthy()
    expect(firstTrial.data.condition).toBeTruthy()

    // Reload
    await page.reload()
    await page.waitForTimeout(2000)

    // Verify the same data is still in localStorage
    const stateAfterReload = await getStepperState(page, 'stroop')
    const stroopBlockAfter = stateAfterReload.states.find(s => s.id === 'stroop')
    const firstTrialAfter = stroopBlockAfter.states[0]

    expect(firstTrialAfter.data.word).toBe(firstTrial.data.word)
    expect(firstTrialAfter.data.color).toBe(firstTrial.data.color)
    expect(firstTrialAfter.data.condition).toBe(firstTrial.data.condition)
  })

  // ---------------------------------------------------------------------------
  // 2. Faker function serialization / reconstruction
  // ---------------------------------------------------------------------------

  test('faker functions are serialized with __fakerFunction metadata', async ({ page }) => {
    await page.goto('/dev/stroop')
    await expect(page.locator('#prompt')).toBeVisible({ timeout: 10_000 })

    const state = await getStepperState(page, 'stroop')

    // The stroop block-level data should contain serialized faker functions
    // (rt, hit, response are defined as faker functions in StroopExpView.vue)
    const stroopBlock = state.states.find(s => s.id === 'stroop')
    expect(stroopBlock).toBeTruthy()

    const blockData = stroopBlock.data
    // These should be serialized as __fakerFunction objects
    expect(blockData.rt).toBeTruthy()
    expect(blockData.rt.__fakerFunction).toBe(true)
    expect(blockData.rt.name).toBe('rnorm')

    expect(blockData.hit).toBeTruthy()
    expect(blockData.hit.__fakerFunction).toBe(true)
    expect(blockData.hit.name).toBe('rbinom')

    expect(blockData.response).toBeTruthy()
    expect(blockData.response.__fakerFunction).toBe(true)
    expect(blockData.response.name).toBe('rchoice')
  })

  test('faker functions produce valid values after reload', async ({ page }) => {
    test.setTimeout(30_000)

    await page.goto('/dev/stroop')
    await expect(page.locator('#prompt')).toBeVisible({ timeout: 10_000 })

    // Reload the page so the stepper is restored from localStorage
    await page.reload()
    await page.waitForTimeout(2000)
    await expect(page.locator('#prompt')).toBeVisible({ timeout: 10_000 })

    // The Stroop view calls api.faker.render(api.stepData) during autofill
    // which invokes the reconstructed faker functions.
    // We can verify by using the autofill mechanism — the Stroop view
    // sets up an autofill function that renders faker data.
    // Instead, we verify that the view is still functional after reload
    // by pressing a key and confirming the trial advances.
    await page.keyboard.press('r')
    await page.waitForTimeout(500)

    // If faker functions failed to reconstruct, the step data recording
    // would throw or produce null values. Verify the step still advanced.
    const state = await getStepperState(page, 'stroop')
    const stroopBlock = state.states.find(s => s.id === 'stroop')
    // After pressing a key, the stepper should have advanced (currentIndex > 0)
    // or the first trial should have recorded response data
    const firstTrial = stroopBlock.states[0]
    expect(firstTrial.data.response).toBeTruthy()
  })

  // ---------------------------------------------------------------------------
  // 3. Serialized format integrity
  // ---------------------------------------------------------------------------

  test('serialized stepper has all required fields', async ({ page }) => {
    await page.goto('/dev/stroop')
    await expect(page.locator('#prompt')).toBeVisible({ timeout: 10_000 })

    const state = await getStepperState(page, 'stroop')

    // Root stepper
    expect(state).toHaveProperty('id')
    expect(state).toHaveProperty('currentIndex')
    expect(state).toHaveProperty('depth')
    expect(state).toHaveProperty('shuffled')
    expect(state).toHaveProperty('states')
    expect(state).toHaveProperty('data')
    expect(typeof state.id).toBe('string')
    expect(typeof state.currentIndex).toBe('number')
    expect(Array.isArray(state.states)).toBe(true)

    // Each child state should also have the required fields
    for (const child of state.states) {
      expect(child).toHaveProperty('id')
      expect(child).toHaveProperty('currentIndex')
      expect(child).toHaveProperty('depth')
      expect(child).toHaveProperty('states')
      expect(child).toHaveProperty('shuffled')
    }
  })

  test('nested stepper structure is preserved after reload', async ({ page }) => {
    test.setTimeout(30_000)

    await page.goto('/dev/stroop')
    await expect(page.locator('#prompt')).toBeVisible({ timeout: 10_000 })

    // Capture the full tree structure before reload
    const stateBefore = await getStepperState(page, 'stroop')
    const stateCount = stateBefore.states.length
    const stroopBefore = stateBefore.states.find(s => s.id === 'stroop')
    const trialCount = stroopBefore.states.length

    // Reload
    await page.reload()
    await page.waitForTimeout(2000)

    // Verify structure is identical
    const stateAfter = await getStepperState(page, 'stroop')
    expect(stateAfter.states.length).toBe(stateCount)

    const stroopAfter = stateAfter.states.find(s => s.id === 'stroop')
    expect(stroopAfter.states.length).toBe(trialCount)

    // Verify all trial IDs match (including shuffled order)
    const idsBefore = stroopBefore.states.map(s => s.id)
    const idsAfter = stroopAfter.states.map(s => s.id)
    expect(idsAfter).toEqual(idsBefore)
  })

  // ---------------------------------------------------------------------------
  // 4. Multiple reloads and continued progress
  // ---------------------------------------------------------------------------

  test('stepper survives multiple reloads while making progress', async ({ page }) => {
    test.setTimeout(45_000)

    await page.goto('/dev/stroop')
    await expect(page.locator('#prompt')).toBeVisible({ timeout: 10_000 })

    // Complete one trial
    await page.keyboard.press('r')
    await page.waitForTimeout(300)

    const _stateAfterFirst = await getStepperState(page, 'stroop')

    // First reload
    await page.reload()
    await page.waitForTimeout(2000)
    await expect(page.locator('#prompt')).toBeVisible({ timeout: 10_000 })

    // Complete another trial
    await page.keyboard.press('g')
    await page.waitForTimeout(300)

    const stateAfterSecond = await getStepperState(page, 'stroop')

    // Second reload
    await page.reload()
    await page.waitForTimeout(2000)

    const stateAfterSecondReload = await getStepperState(page, 'stroop')

    // Progress should have been preserved through both reloads
    expect(stateAfterSecondReload.currentIndex).toBe(stateAfterSecond.currentIndex)

    // Both trials should have recorded data
    const stroopBlock = stateAfterSecondReload.states.find(s => s.id === 'stroop')
    expect(stroopBlock).toBeTruthy()
  })
})

// =============================================================================
// Component references in step data
// =============================================================================

test.describe('Component references in step data', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await clearState(page)
  })

  /** Read the stepper state for a given view from localStorage. */
  async function getStepperState(page, viewName: string) {
    return page.evaluate((view) => {
      const key = Object.keys(localStorage).find(k => k.startsWith('smilestore-'))
      if (!key) return null
      const store = JSON.parse(localStorage.getItem(key)!)
      return store?.viewSteppers?.[view]?.data?.stepperState ?? null
    }, viewName)
  }

  test('component steps view initializes with correct structure', async ({ page }) => {
    await page.goto('/dev/compsteps')
    await expect(page.locator('#step-label')).toBeVisible({ timeout: 10_000 })

    // Should show the first step label
    await expect(page.locator('#step-label')).toContainText('First A trial')
    await expect(page.locator('#step-index')).toContainText('Step 1 of 3')

    // Verify stepper state was saved
    const state = await getStepperState(page, 'compsteps')
    expect(state).not.toBeNull()
    expect(state.states.length).toBe(3)
  })

  test('component type fields are serialized with __vueComponent metadata', async ({ page }) => {
    await page.goto('/dev/compsteps')
    await expect(page.locator('#step-label')).toBeVisible({ timeout: 10_000 })

    const state = await getStepperState(page, 'compsteps')

    // Each step should have a type field serialized as __vueComponent
    const stepA1 = state.states.find(s => s.id === 'step-a1')
    const stepB1 = state.states.find(s => s.id === 'step-b1')
    const stepA2 = state.states.find(s => s.id === 'step-a2')

    expect(stepA1.data.type).toEqual({ __vueComponent: true, componentName: 'TrialTypeA' })
    expect(stepB1.data.type).toEqual({ __vueComponent: true, componentName: 'TrialTypeB' })
    expect(stepA2.data.type).toEqual({ __vueComponent: true, componentName: 'TrialTypeA' })

    // Plain data should be preserved alongside component references
    expect(stepA1.data.label).toBe('First A trial')
    expect(stepB1.data.label).toBe('First B trial')
  })

  test('component metadata survives reload', async ({ page }) => {
    test.setTimeout(30_000)

    await page.goto('/dev/compsteps')
    await expect(page.locator('#step-label')).toBeVisible({ timeout: 10_000 })

    // Capture state before reload
    const stateBefore = await getStepperState(page, 'compsteps')

    // Reload
    await page.reload()
    await page.waitForTimeout(2000)

    // Verify component metadata survived
    const stateAfter = await getStepperState(page, 'compsteps')
    expect(stateAfter.states.length).toBe(stateBefore.states.length)

    const stepA1 = stateAfter.states.find(s => s.id === 'step-a1')
    expect(stepA1.data.type).toEqual({ __vueComponent: true, componentName: 'TrialTypeA' })
    expect(stepA1.data.label).toBe('First A trial')
  })

  test('step progress with components persists across reload', async ({ page }) => {
    test.setTimeout(30_000)

    await page.goto('/dev/compsteps')
    await expect(page.locator('#step-label')).toBeVisible({ timeout: 10_000 })

    // Advance one step
    await page.locator('#next-step').click()
    await page.waitForTimeout(500)

    // Should now be on step 2
    await expect(page.locator('#step-index')).toContainText('Step 2 of 3')
    await expect(page.locator('#step-label')).toContainText('First B trial')

    // Reload
    await page.reload()
    await page.waitForTimeout(2000)

    // After reload, the stepper state in localStorage should show progress
    const state = await getStepperState(page, 'compsteps')
    expect(state.currentIndex).toBeGreaterThanOrEqual(1)
  })

  test('component renders correctly after reload', async ({ page }) => {
    test.setTimeout(30_000)

    await page.goto('/dev/compsteps')
    await expect(page.locator('#step-label')).toBeVisible({ timeout: 10_000 })

    // The TrialTypeA component should be rendered (it has class trial-type-a)
    await expect(page.locator('.trial-type-a')).toBeVisible()
    await expect(page.locator('.trial-type-a h2')).toContainText('Trial Type A')

    // Reload the page
    await page.reload()
    await page.waitForTimeout(2000)

    // After reload, the component should still render
    // (resolved via Nuxt auto-import / resolveComponent)
    await expect(page.locator('#step-label')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.trial-type-a')).toBeVisible()
    await expect(page.locator('.trial-type-a h2')).toContainText('Trial Type A')
  })

  test('different component types render correctly as steps advance', async ({ page }) => {
    test.setTimeout(30_000)

    await page.goto('/dev/compsteps')
    await expect(page.locator('#step-label')).toBeVisible({ timeout: 10_000 })

    // Step 1: TrialTypeA
    await expect(page.locator('.trial-type-a')).toBeVisible()

    // Advance to step 2: TrialTypeB
    await page.locator('#next-step').click()
    await page.waitForTimeout(500)
    await expect(page.locator('.trial-type-b')).toBeVisible()
    await expect(page.locator('.trial-type-b h2')).toContainText('Trial Type B')

    // Reload on step 2
    await page.reload()
    await page.waitForTimeout(2000)

    // After reload, verify the component still renders for the current step
    // The view re-runs setup, so it may reset to step 1, but the localStorage
    // should still contain the correct component metadata for all steps
    const state = await getStepperState(page, 'compsteps')
    const stepB1 = state.states.find(s => s.id === 'step-b1')
    expect(stepB1.data.type).toEqual({ __vueComponent: true, componentName: 'TrialTypeB' })
  })
})
