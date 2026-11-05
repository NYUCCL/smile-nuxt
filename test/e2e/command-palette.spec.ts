import { test, expect, type Page } from '@playwright/test'
import { clearState } from './helpers'

/**
 * The `:` command palette (dev server only): opens on `:`, runs commands,
 * and leaves a `:` typed in a text field alone.
 */

const palette = (page: Page) => page.getByTestId('command-palette')
const paletteInput = (page: Page) => palette(page).locator('input')

/** Press `:` once the palette (an async component) has mounted */
async function openPalette(page: Page) {
  await page.locator('.sd-palette-scope').waitFor({ state: 'attached' })
  await page.locator('body').press(':')
  await expect(palette(page)).toBeVisible()
  await expect(paletteInput(page)).toBeFocused() // keys typed before this are lost
}

/** Read the dev store's main view */
function mainView(page: Page) {
  return page.evaluate(() => {
    type NuxtRoot = Element & { __vue_app__: { config: { globalProperties: { $pinia: { _s: Map<string, { dev: { mainView: string } }> } } } } }
    // undefined while the app is still loading
    const app = (document.querySelector('#__nuxt') as NuxtRoot | null)?.__vue_app__
    return app?.config.globalProperties.$pinia._s.get('smilestore')?.dev.mainView
  })
}

test.describe('Command palette', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/welcome')
    await clearState(page)
    await page.goto('/dev/welcome')
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 })
  })

  test('opens on :, switches mode, closes', async ({ page }) => {
    await openPalette(page)
    await expect(paletteInput(page)).toBeFocused()
    // Grouped list on an empty line
    await expect(palette(page).getByText('Modes', { exact: true })).toBeVisible()

    await page.keyboard.type('pres')
    await expect(palette(page).locator('[role="option"]').first()).toHaveAttribute('data-command', 'pres')
    await page.keyboard.press('Enter')
    await expect(palette(page)).toBeHidden()
    await expect.poll(() => mainView(page)).toBe('presentation')

    // A unique prefix, and `:` + Enter repeats the last command
    await openPalette(page)
    await page.keyboard.type('d')
    await expect(palette(page).locator('[role="option"]').first()).toHaveAttribute('data-command', 'dev')
    await page.keyboard.press('Enter')
    await expect.poll(() => mainView(page)).toBe('devmode')

    await openPalette(page)
    await expect(palette(page).locator('[role="option"]').first()).toHaveAttribute('data-command', 'dev')
    await page.keyboard.press('Escape')
    await expect(palette(page)).toBeHidden()
  })

  test('keys typed in the palette do not reach the page', async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as { seen: string[] }).seen = []
      window.addEventListener('keydown', e => (window as unknown as { seen: string[] }).seen.push(e.key))
    })
    await openPalette(page)
    await page.keyboard.type('side')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Escape')
    expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual([])
  })

  test('go lists views and goes to one', async ({ page }) => {
    await openPalette(page)
    await page.keyboard.type('go ')
    await expect(palette(page).locator('[data-command="go consent"]')).toBeVisible()
    await page.keyboard.type('cons')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/dev\/consent/)
  })

  test('the rail button opens it', async ({ page }) => {
    await page.getByTestId('open-command-palette').click()
    await expect(palette(page)).toBeVisible()
    await expect(paletteInput(page)).toBeFocused()
  })

  test('a tab command opens its panel on that tab', async ({ page }) => {
    await openPalette(page)
    await page.keyboard.type('random')
    await page.keyboard.press('Enter')
    await expect(page.locator('.sidebar')).toBeVisible()
    await expect(page.locator('.sidebar [role="tab"][data-state="active"]')).toContainText('Random')
  })

  test('/words searches the docs and opens the result', async ({ page }) => {
    await openPalette(page)
    await page.keyboard.type('/autofill')
    const first = palette(page).locator('[role="option"]').first()
    await expect(first).toContainText('Autofill')
    await page.keyboard.press('Enter')
    await expect(palette(page)).toBeHidden()
    await expect.poll(() => mainView(page)).toBe('docs')
    await expect(page.locator('.docs-view h1').first()).toContainText('Autofill')
  })

  test('/words opens the result while Docs mode is already open', async ({ page }) => {
    await openPalette(page)
    await page.keyboard.type('/autofill')
    await expect(palette(page).locator('[role="option"]').first()).toContainText('Autofill')
    await page.keyboard.press('Enter')
    const title = page.locator('.docs-view h1').first()
    await expect(title).toContainText('Autofill')
    await expect(palette(page)).toBeHidden() // it fades out

    // A second search from inside Docs mode goes to the new page
    await openPalette(page)
    await page.keyboard.type('/leveraging agents')
    await expect(palette(page).locator('[role="option"]').first()).toContainText('Leveraging agents')
    await page.keyboard.press('Enter')
    await expect(title).toContainText('Leveraging agents')
  })

  test('a failed command says why and stays open', async ({ page }) => {
    await openPalette(page)
    await page.keyboard.type('go nowhere')
    await page.keyboard.press('Enter')
    await expect(palette(page)).toBeVisible()
    await expect(page.getByTestId('command-palette-error')).toContainText('No view "nowhere"')
    // Editing clears it; a success closes with no toast
    await page.keyboard.press('Control+u')
    await expect(page.getByTestId('command-palette-error')).toBeHidden()
    await page.keyboard.type('side')
    await page.keyboard.press('Enter')
    await expect(palette(page)).toBeHidden()
    await expect(page.locator('.sidebar')).toBeVisible()
    await expect(page.locator('.notification')).toHaveCount(0)
  })

  test('vim keys: Ctrl-j/k, then normal mode j/k/gg/G and q', async ({ page }) => {
    const selected = () => palette(page).locator('[role="option"][aria-selected="true"]')
    await openPalette(page)
    await page.keyboard.type('s')
    const first = await palette(page).locator('[role="option"]').first().getAttribute('data-command')
    await page.keyboard.press('Control+j')
    await expect(selected()).not.toHaveAttribute('data-command', first!)
    await page.keyboard.press('Control+k')
    await expect(selected()).toHaveAttribute('data-command', first!)

    // Esc with text: normal mode; j/k move and type nothing
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('command-palette-normal')).toBeVisible()
    await page.keyboard.press('j')
    await expect(paletteInput(page)).toHaveValue('s')
    await expect(selected()).not.toHaveAttribute('data-command', first!)
    await page.keyboard.press('g')
    await page.keyboard.press('g')
    await expect(selected()).toHaveAttribute('data-command', first!)
    await page.keyboard.press('Shift+G')
    await expect(selected()).toHaveAttribute('data-command', (await palette(page).locator('[role="option"]').last().getAttribute('data-command'))!)

    // i types again; Ctrl-u clears
    await page.keyboard.press('i')
    await expect(page.getByTestId('command-palette-normal')).toBeHidden()
    await page.keyboard.type('x')
    await expect(paletteInput(page)).toHaveValue('sx')
    await page.keyboard.press('Control+u')
    await expect(paletteInput(page)).toHaveValue('')

    // q closes from normal mode
    await page.keyboard.type('dev')
    await page.keyboard.press('Escape')
    await page.keyboard.press('q')
    await expect(palette(page)).toBeHidden()
  })

  test('a : typed in a text field does not open it', async ({ page }) => {
    await page.evaluate(() => {
      const input = document.createElement('input')
      input.id = 'palette-test-field'
      input.style.cssText = 'position:fixed;top:200px;left:200px;z-index:99999'
      document.body.appendChild(input)
    })
    const field = page.locator('#palette-test-field')
    await page.locator('.sd-palette-scope').waitFor({ state: 'attached' }) // or this passes trivially
    await field.click()
    await page.keyboard.type('a:b')
    await expect(field).toHaveValue('a:b')
    await expect(palette(page)).toBeHidden()
  })

  test('opens in the participant view and goes to the dev tools', async ({ page }) => {
    await page.goto('/welcome')
    await expect(page.getByRole('button', { name: /I'm ready/i })).toBeVisible()
    await openPalette(page)
    // Dev-tools-only commands aren't offered here
    await page.keyboard.type('side')
    await expect(palette(page).locator('[data-command="side"]')).toHaveCount(0)
    await paletteInput(page).fill('config')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/dev\/?$/)
    await expect.poll(() => mainView(page)).toBe('config')
  })
})
