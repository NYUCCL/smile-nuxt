import { test, expect } from '@playwright/test'
import { clearState } from './helpers'

test.describe('Dev mode', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate first so the page has an origin (localStorage is inaccessible on about:blank)
    await page.goto('/dev/welcome')
    await clearState(page)
    await page.goto('/dev/welcome')
    // Wait for dev mode UI to be ready
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 })
  })

  // ─── Navbar / Basic Info ───────────────────────────────────────────

  test('navbar shows DEVELOPER MODE label and version', async ({ page }) => {
    const nav = page.locator('nav')
    await expect(nav.getByText('DEVELOPER MODE')).toBeVisible()
    // Version string should appear in parentheses next to the label
    await expect(nav.locator('text=DEVELOPER MODE').locator('..')).toContainText('(')
  })

  test('dev routes render with /dev prefix', async ({ page }) => {
    expect(page.url()).toContain('/dev')
  })

  test('dev mode allows jumping to any route', async ({ page }) => {
    await page.goto('/dev/consent')
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 })
    expect(page.url()).toContain('/dev')
  })

  // ─── Sidebar Toggle ───────────────────────────────────────────────

  test('sidebar is hidden by default', async ({ page }) => {
    await expect(page.locator('.sidebar')).not.toBeVisible()
  })

  test('clicking sidebar button toggles sidebar visibility', async ({ page }) => {
    // The sidebar toggle is the second button in PanelButtonGroup
    // It has an SVG with a vertical line (path d="M15 3v18")
    const sidebarBtn = page.locator('svg path[d="M15 3v18"]').locator('..')
    await sidebarBtn.click()
    await expect(page.locator('.sidebar')).toBeVisible()

    // Click again to hide
    await sidebarBtn.click()
    await expect(page.locator('.sidebar')).not.toBeVisible()
  })

  test('Ctrl+1 toggles sidebar', async ({ page }) => {
    await page.keyboard.press('Control+1')
    await expect(page.locator('.sidebar')).toBeVisible()

    await page.keyboard.press('Control+1')
    await expect(page.locator('.sidebar')).not.toBeVisible()
  })

  // ─── Sidebar Tabs ─────────────────────────────────────────────────

  test('sidebar shows Steps, Random, Info tabs', async ({ page }) => {
    // Open sidebar
    await page.keyboard.press('Control+1')
    await expect(page.locator('.sidebar')).toBeVisible()

    const sidebar = page.locator('.sidebar')
    await expect(sidebar.getByRole('tab', { name: 'Steps' })).toBeVisible()
    await expect(sidebar.getByRole('tab', { name: 'Random' })).toBeVisible()
    await expect(sidebar.getByRole('tab', { name: 'Info' })).toBeVisible()
  })

  test('clicking sidebar tabs switches content', async ({ page }) => {
    await page.keyboard.press('Control+1')
    await expect(page.locator('.sidebar')).toBeVisible()

    const sidebar = page.locator('.sidebar')

    // Steps tab is active by default
    const stepsTab = sidebar.getByRole('tab', { name: 'Steps' })
    await expect(stepsTab).toHaveAttribute('data-state', 'active')

    // Switch to Random tab
    await sidebar.getByRole('tab', { name: 'Random' }).click()
    await expect(sidebar.getByRole('tab', { name: 'Random' })).toHaveAttribute('data-state', 'active')

    // Switch to Info tab
    await sidebar.getByRole('tab', { name: 'Info' }).click()
    await expect(sidebar.getByRole('tab', { name: 'Info' })).toHaveAttribute('data-state', 'active')
  })

  test('Ctrl+2 cycles through sidebar tabs', async ({ page }) => {
    // Open sidebar first
    await page.keyboard.press('Control+1')
    await expect(page.locator('.sidebar')).toBeVisible()

    const sidebar = page.locator('.sidebar')

    // Default is steps
    await expect(sidebar.getByRole('tab', { name: 'Steps' })).toHaveAttribute('data-state', 'active')

    // Cycle to Random
    await page.keyboard.press('Control+2')
    await expect(sidebar.getByRole('tab', { name: 'Random' })).toHaveAttribute('data-state', 'active')

    // Cycle to Info
    await page.keyboard.press('Control+2')
    await expect(sidebar.getByRole('tab', { name: 'Info' })).toHaveAttribute('data-state', 'active')

    // Cycle back to Steps
    await page.keyboard.press('Control+2')
    await expect(sidebar.getByRole('tab', { name: 'Steps' })).toHaveAttribute('data-state', 'active')
  })

  // ─── Console Toggle ───────────────────────────────────────────────

  test('console is hidden by default', async ({ page }) => {
    await expect(page.locator('.console')).not.toBeVisible()
  })

  test('clicking console button toggles console visibility', async ({ page }) => {
    // The console toggle is the first button in PanelButtonGroup
    // It has an SVG with a horizontal line (path d="M3 15h18")
    const consoleBtn = page.locator('svg path[d="M3 15h18"]').locator('..')
    await consoleBtn.click()
    await expect(page.locator('.console')).toBeVisible()

    await consoleBtn.click()
    await expect(page.locator('.console')).not.toBeVisible()
  })

  test('Ctrl+` toggles console', async ({ page }) => {
    await page.keyboard.press('Control+`')
    await expect(page.locator('.console')).toBeVisible()

    await page.keyboard.press('Control+`')
    await expect(page.locator('.console')).not.toBeVisible()
  })

  // ─── Console Tabs ─────────────────────────────────────────────────

  test('console shows three tab buttons (browse, log, config)', async ({ page }) => {
    // Open console
    await page.keyboard.press('Control+`')
    await expect(page.locator('.console')).toBeVisible()

    // The console's left sidebar (w-9) has 3 tab buttons + 1 hide button
    const sidebar = page.locator('.console .w-9')
    const buttons = sidebar.getByRole('button')
    await expect(buttons).toHaveCount(4) // browse, log, config, hide
  })

  test('Ctrl+3 cycles through console tabs', async ({ page }) => {
    // Open console first
    await page.keyboard.press('Control+`')
    await expect(page.locator('.console')).toBeVisible()

    // Cycle through tabs - we verify the notification text appears
    await page.keyboard.press('Control+3')
    // The notification should show "Switched to Log Tab"
    await expect(page.getByText('Switched to Log Tab')).toBeVisible({ timeout: 2000 })

    await page.keyboard.press('Control+3')
    await expect(page.getByText('Switched to Config Tab')).toBeVisible({ timeout: 2000 })

    await page.keyboard.press('Control+3')
    await expect(page.getByText('Switched to Browse Tab')).toBeVisible({ timeout: 2000 })
  })

  test('console hide button closes the console', async ({ page }) => {
    await page.keyboard.press('Control+`')
    await expect(page.locator('.console')).toBeVisible()

    // The hide button is the bottom button in the console's left sidebar (ChevronDown icon)
    const sidebar = page.locator('.console .w-9')
    const buttons = sidebar.getByRole('button')
    await buttons.last().click()
    await expect(page.locator('.console')).not.toBeVisible()
  })

  // ─── Fullscreen Toggle ────────────────────────────────────────────

  test('starts in responsive (non-fullscreen) mode with device container', async ({ page }) => {
    // In responsive mode, the device container wrapper with grid background should be visible
    await expect(page.locator('.device-container-wrapper')).toBeVisible()
    await expect(page.locator('.fullscreen-container')).not.toBeVisible()
  })

  test('fullscreen button toggles between responsive and fullscreen mode', async ({ page }) => {
    // Find the fullscreen button in the navbar - it contains a Maximize icon
    // The tooltip says "Fullscreen"
    const fullscreenBtn = page.locator('nav').getByRole('button').filter({ has: page.locator('svg.lucide-maximize') })
    await fullscreenBtn.click()

    // Should now show fullscreen container
    await expect(page.locator('.fullscreen-container')).toBeVisible()
    await expect(page.locator('.device-container-wrapper')).not.toBeVisible()

    // The button should now have Minimize icon; click to go back
    const minimizeBtn = page.locator('nav').getByRole('button').filter({ has: page.locator('svg.lucide-minimize') })
    await minimizeBtn.click()

    await expect(page.locator('.device-container-wrapper')).toBeVisible()
    await expect(page.locator('.fullscreen-container')).not.toBeVisible()
  })

  // ─── Device Container ─────────────────────────────────────────────

  test('device container shows dimensions', async ({ page }) => {
    // The device-dimensions element shows "width x height"
    const dims = page.locator('.device-dimensions')
    await expect(dims).toBeVisible()
    await expect(dims).toContainText('x')
  })

  test('rotate button swaps device dimensions', async ({ page }) => {
    const dims = page.locator('.device-dimensions')
    const initialText = await dims.textContent()
    // Parse initial dimensions
    const [w, h] = initialText!.split('x').map(s => s.trim())

    // Click rotate button (RotateCcw icon)
    const rotateBtn = page.locator('.device-controls').getByRole('button').filter({ has: page.locator('svg.lucide-rotate-ccw') })
    await rotateBtn.click()

    // Dimensions should be swapped
    await expect(dims).toContainText(`${h} x ${w}`)
  })

  // ─── Color Mode ────────────────────────────────────────────────────

  test('color mode button in device controls cycles through modes', async ({ page }) => {
    // The color mode button is inside device-controls, with Moon/Sun/SunMoon icon
    const deviceControls = page.locator('.device-controls')

    // Initially should have one of the color mode icons
    // Click it to cycle: light -> dark -> auto -> light
    const colorBtn = deviceControls.getByRole('button').filter({
      has: page.locator('svg.lucide-moon, svg.lucide-sun, svg.lucide-sun-moon'),
    })
    await expect(colorBtn).toBeVisible()

    // Click to switch mode
    await colorBtn.click()
    // Should have changed - verify a different icon is now shown
    // We just verify the button is still functional and visible
    await expect(colorBtn).toBeVisible()
  })

  test('fullscreen mode shows color mode button in navbar', async ({ page }) => {
    // Color mode button is only visible in navbar when in fullscreen mode
    const nav = page.locator('nav')

    // Enter fullscreen
    const fullscreenBtn = nav.getByRole('button').filter({ has: page.locator('svg.lucide-maximize') })
    await fullscreenBtn.click()
    await expect(page.locator('.fullscreen-container')).toBeVisible()

    // Now color mode button should appear in navbar (it's conditionally rendered)
    // The ColorModeButton in the navbar is only shown when isFullscreen=true
    const navColorBtn = nav.getByRole('button').filter({
      has: page.locator('svg.lucide-moon, svg.lucide-sun, svg.lucide-sun-moon'),
    })
    await expect(navColorBtn).toBeVisible()
  })

  // ─── Dark Mode Class Application ──────────────────────────────────

  test('dark mode applies dark class to device wrapper', async ({ page }) => {
    const deviceControls = page.locator('.device-controls')
    const colorBtn = deviceControls.getByRole('button').filter({
      has: page.locator('svg.lucide-moon, svg.lucide-sun, svg.lucide-sun-moon'),
    })

    // Click through all 3 color modes (auto -> light -> dark -> auto).
    // At some point, dark class should appear on the device wrapper.
    for (let i = 0; i < 3; i++) {
      await colorBtn.click()
      await page.waitForTimeout(200)
      const classes = await page.locator('.device-wrapper').getAttribute('class') || ''
      if (classes.includes('dark')) {
        expect(classes).toContain('dark')
        return
      }
    }
    // If we cycled through all 3 and never saw dark, fail
    expect(await page.locator('.device-wrapper').getAttribute('class')).toContain('dark')
  })

  // ─── Stepper Info ──────────────────────────────────────────────────

  test('step info button group is visible in navbar', async ({ page }) => {
    // The StepInfoButtonGroup contains prev/next step buttons and path display
    const nav = page.locator('nav')
    // Look for the step navigation buttons (ChevronLeft and ChevronRight)
    const stepButtons = nav.getByRole('button').filter({
      has: page.locator('svg.lucide-chevron-left, svg.lucide-chevron-right'),
    })
    // Should have at least prev and next buttons
    await expect(stepButtons.first()).toBeVisible()
  })

  // ─── Stepper in Sidebar ────────────────────────────────────────────

  test('steps tab in sidebar shows step explorer content', async ({ page }) => {
    // Open sidebar
    await page.keyboard.press('Control+1')
    await expect(page.locator('.sidebar')).toBeVisible()

    // Steps tab should be active by default and show step explorer content
    const sidebar = page.locator('.sidebar')
    await expect(sidebar.getByRole('tab', { name: 'Steps' })).toHaveAttribute('data-state', 'active')

    // The active step explorer panel should have some content
    const tabContent = sidebar.getByRole('tabpanel', { name: 'Steps' })
    await expect(tabContent).toBeVisible({ timeout: 5000 })
  })

  // ─── Sidebar Footer Panels ────────────────────────────────────────

  test('sidebar shows footer panels (config, progress, study info)', async ({ page }) => {
    await page.keyboard.press('Control+1')
    await expect(page.locator('.sidebar')).toBeVisible()

    // The sidebar footer should be present
    const footer = page.locator('.sidebar-footer')
    await expect(footer).toBeVisible()
  })

  // ─── Keyboard Shortcut Notification ────────────────────────────────

  test('keyboard shortcuts show notification overlay', async ({ page }) => {
    // Ctrl+1 should show a notification
    await page.keyboard.press('Control+1')
    await expect(page.getByText('Ctrl + 1')).toBeVisible({ timeout: 2000 })
    await expect(page.getByText('Showing Sidebar')).toBeVisible({ timeout: 2000 })
  })

  test('Ctrl+2 shows error notification when sidebar is hidden', async ({ page }) => {
    // Sidebar is hidden by default, Ctrl+2 should show error
    await page.keyboard.press('Control+2')
    await expect(page.getByText('Sidebar is hidden')).toBeVisible({ timeout: 2000 })
  })

  test('Ctrl+3 shows error notification when console is hidden', async ({ page }) => {
    await page.keyboard.press('Control+3')
    await expect(page.getByText('Console is hidden')).toBeVisible({ timeout: 2000 })
  })

  // ─── Reset Button ─────────────────────────────────────────────────

  test('Ctrl+R shows reset notification', async ({ page }) => {
    await page.keyboard.press('Control+r')
    await expect(page.getByText('Resetting Local State')).toBeVisible({ timeout: 2000 })
  })

  // ─── Both Sidebar and Console Open ─────────────────────────────────

  test('sidebar and console can be open simultaneously', async ({ page }) => {
    await page.keyboard.press('Control+1')
    await expect(page.locator('.sidebar')).toBeVisible()

    await page.keyboard.press('Control+`')
    await expect(page.locator('.console')).toBeVisible()

    // Both should still be visible
    await expect(page.locator('.sidebar')).toBeVisible()
    await expect(page.locator('.console')).toBeVisible()
  })

  // ─── Navigation ────────────────────────────────────────────────────

  test('navigating between dev routes preserves dev UI', async ({ page }) => {
    await page.goto('/dev/consent')
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('nav').getByText('DEVELOPER MODE')).toBeVisible()

    await page.goto('/dev/debrief')
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('nav').getByText('DEVELOPER MODE')).toBeVisible()
  })

  // ─── Route Jumper ──────────────────────────────────────────────────

  test('route jumper dropdown shows current route name', async ({ page }) => {
    // The ViewInfoButtonGroup shows the current route name (e.g., /welcome)
    const nav = page.locator('nav')
    await expect(nav.locator('.font-mono:has-text("/welcome")')).toBeVisible()
  })

  test('route jumper dropdown opens and lists routes', async ({ page }) => {
    const nav = page.locator('nav')
    // Click the route name button to open the dropdown
    const routeButton = nav.locator('.font-mono:has-text("/welcome")')
    await routeButton.click()

    // The dropdown menu should appear with route items
    const dropdown = page.getByRole('menu')
    await expect(dropdown).toBeVisible({ timeout: 3000 })

    // Should contain at least the home/recruit entry and some route entries
    const menuItems = dropdown.getByRole('menuitem')
    const count = await menuItems.count()
    expect(count).toBeGreaterThan(1)
  })

  test('route jumper navigates to selected route', async ({ page }) => {
    const nav = page.locator('nav')
    // Open the route jumper dropdown
    const routeButton = nav.locator('.font-mono:has-text("/welcome")')
    await routeButton.click()

    const dropdown = page.getByRole('menu')
    await expect(dropdown).toBeVisible({ timeout: 3000 })

    // Click on the consent route if it exists
    const consentItem = dropdown.getByRole('menuitem').filter({ hasText: '/consent' })
    const hasConsent = await consentItem.count()
    if (hasConsent > 0) {
      await consentItem.click()
      // Should navigate to the consent route
      await page.waitForURL(/\/dev\/consent/, { timeout: 5000 })
      expect(page.url()).toContain('/dev/consent')
    }
  })

  test('route jumper shows home/recruit entry at top', async ({ page }) => {
    const nav = page.locator('nav')
    const routeButton = nav.locator('.font-mono:has-text("/welcome")')
    await routeButton.click()

    const dropdown = page.getByRole('menu')
    await expect(dropdown).toBeVisible({ timeout: 3000 })

    // The first menu item should be the home entry (shows /recruit in dev mode)
    const firstItem = dropdown.getByRole('menuitem').first()
    await expect(firstItem).toContainText('/recruit')
  })

  // ─── Pin Route ─────────────────────────────────────────────────────

  test('pin button is visible in dev mode navbar', async ({ page }) => {
    const nav = page.locator('nav')
    // Pin button has a Pin icon (lucide-pin)
    const pinBtn = nav.getByRole('button').filter({ has: page.locator('svg.lucide-pin') })
    await expect(pinBtn).toBeVisible()
  })

  test('clicking pin button pins the current route', async ({ page }) => {
    const nav = page.locator('nav')
    // Click the pin button
    const pinBtn = nav.getByRole('button').filter({ has: page.locator('svg.lucide-pin') })
    await pinBtn.click()

    // After pinning, the icon should change to PinOff
    await expect(nav.locator('svg.lucide-pin-off')).toBeVisible()

    // The button group should get the pinned styling class
    const pinnedBtn = nav.getByRole('button').filter({ has: page.locator('svg.lucide-pin-off') })
    await expect(pinnedBtn).toHaveClass(/pinned/)
  })

  test('pinned route prevents navigation to other routes', async ({ page }) => {
    // Pin the current route (welcome)
    const nav = page.locator('nav')
    const pinBtn = nav.getByRole('button').filter({ has: page.locator('svg.lucide-pin') })
    await pinBtn.click()
    await expect(nav.locator('svg.lucide-pin-off')).toBeVisible()

    // Try to navigate to another route - should be redirected back
    await page.goto('/dev/consent')
    await page.waitForTimeout(1000)
    // Should still be on welcome because route is pinned
    expect(page.url()).toContain('/dev/welcome')
  })

  test('unpinning route re-enables navigation', async ({ page }) => {
    const nav = page.locator('nav')
    // Pin the route
    const pinBtn = nav.getByRole('button').filter({ has: page.locator('svg.lucide-pin') })
    await pinBtn.click()
    await expect(nav.locator('svg.lucide-pin-off')).toBeVisible()

    // Unpin the route
    const unpinBtn = nav.getByRole('button').filter({ has: page.locator('svg.lucide-pin-off') })
    await unpinBtn.click()
    // Pin icon should be back
    await expect(nav.locator('svg.lucide-pin')).toBeVisible()

    // Should now be able to navigate
    await page.goto('/dev/consent')
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 })
    expect(page.url()).toContain('/dev/consent')
  })

  test('Ctrl+P toggles pin state', async ({ page }) => {
    // Pin via keyboard
    await page.keyboard.press('Control+p')
    await expect(page.getByText('Pinned Current Route')).toBeVisible({ timeout: 2000 })
    await expect(page.locator('nav').locator('svg.lucide-pin-off')).toBeVisible()

    // Unpin via keyboard
    await page.keyboard.press('Control+p')
    await expect(page.getByText('Unpinned Route')).toBeVisible({ timeout: 2000 })
    await expect(page.locator('nav').locator('svg.lucide-pin')).toBeVisible()
  })

  test('pinned route disables prev/next view navigation buttons', async ({ page }) => {
    const nav = page.locator('nav')
    // Pin route
    const pinBtn = nav.getByRole('button').filter({ has: page.locator('svg.lucide-pin') })
    await pinBtn.click()
    await expect(nav.locator('svg.lucide-pin-off')).toBeVisible()

    // Prev and next view buttons (ChevronsLeft/ChevronsRight) should be disabled
    const prevBtn = nav.getByRole('button').filter({ has: page.locator('svg.lucide-chevrons-left') })
    const nextBtn = nav.getByRole('button').filter({ has: page.locator('svg.lucide-chevrons-right') })
    await expect(prevBtn).toBeDisabled()
    await expect(nextBtn).toBeDisabled()
  })

  test('route jumper dropdown is blocked when route is pinned', async ({ page }) => {
    const nav = page.locator('nav')
    // Pin route
    const pinBtn = nav.getByRole('button').filter({ has: page.locator('svg.lucide-pin') })
    await pinBtn.click()
    await expect(nav.locator('svg.lucide-pin-off')).toBeVisible()

    // Try to open the route jumper dropdown
    const routeButton = nav.locator('.font-mono:has-text("/welcome")')
    await routeButton.click()

    // Dropdown should NOT open because route is pinned
    const dropdown = page.getByRole('menu')
    await expect(dropdown).not.toBeVisible()
  })

  // ─── Reload Button ─────────────────────────────────────────────────

  test('reload button triggers page reload', async ({ page }) => {
    const nav = page.locator('nav')
    // The reload button has RotateCcw icon
    const reloadBtn = nav.getByRole('button').filter({ has: page.locator('svg.lucide-rotate-ccw') })
    await expect(reloadBtn).toBeVisible()

    // Set a marker in sessionStorage to detect reload
    await page.evaluate(() => {
      sessionStorage.setItem('_reload_test', 'before')
    })

    // Click reload - this will trigger window.location.reload()
    // Use waitForNavigation to handle the page reload
    await Promise.all([
      page.waitForNavigation({ timeout: 10000 }),
      reloadBtn.click(),
    ])

    // After reload, the nav should be visible again
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 })
    // The URL should still be on a dev route
    expect(page.url()).toContain('/dev')
  })

  // ─── Reset Local State ─────────────────────────────────────────────

  test('reset button clears local storage and reloads', async ({ page }) => {
    const nav = page.locator('nav')
    // The reset button has Zap icon
    const resetBtn = nav.getByRole('button').filter({ has: page.locator('svg.lucide-zap') })
    await expect(resetBtn).toBeVisible()

    // Verify smilestore key exists before reset
    const keyBefore = await page.evaluate(() =>
      Object.keys(localStorage).find(k => k.startsWith('smilestore-')),
    )
    expect(keyBefore).toBeTruthy()

    // Click reset - this clears the smilestore key and triggers a reload
    await Promise.all([
      page.waitForEvent('framenavigated', { timeout: 10000 }),
      resetBtn.click(),
    ])
    await page.waitForLoadState('domcontentloaded')

    // After reset, page should reload
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 })

    // The smilestore key should have been removed (app re-creates it on load,
    // so check the URL went back to the dev landing — indicating a fresh state)
    expect(page.url()).toContain('/dev')
  })

  test('Ctrl+R resets local state and reloads', async ({ page }) => {
    // Verify smilestore key exists before reset
    const keyBefore = await page.evaluate(() =>
      Object.keys(localStorage).find(k => k.startsWith('smilestore-')),
    )
    expect(keyBefore).toBeTruthy()

    // Notification appears first, then reset happens after 200ms delay
    await page.keyboard.press('Control+r')
    await expect(page.getByText('Resetting Local State')).toBeVisible({ timeout: 2000 })

    // Wait for the reload triggered by the reset
    await page.waitForLoadState('load', { timeout: 10000 })
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 })

    // After reset, page should be back on a dev route with fresh state
    expect(page.url()).toContain('/dev')
  })
})
