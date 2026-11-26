/**
 * @fileoverview composables/useColorMode.js: resolving a color mode setting,
 * the participant's mode, and the dev tools' two modes (global and
 * experiment) with the classes they put on the page.
 *
 * The composable keeps module state (it is set up once), so each test
 * imports a fresh copy.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref, reactive, nextTick, effectScope } from 'vue'

const preferredDark = ref(false)
let store

vi.mock('@vueuse/core', () => ({ usePreferredDark: () => preferredDark }))
vi.mock('../../../src/runtime/composables/useAPI', () => ({ default: () => ({ store }) }))

/** Waits for the watcher and the nextTick inside it. */
const settle = async () => {
  await nextTick()
  await nextTick()
}

describe('useColorMode', () => {
  let mod, scope

  /** Runs a composable in an effect scope that the test stops afterwards. */
  const run = fn => scope.run(fn)

  beforeEach(async () => {
    vi.resetModules()
    preferredDark.value = false
    store = reactive({
      dev: { globalColorMode: 'auto', experimentColorMode: null },
      config: { colorMode: 'light' },
    })
    document.documentElement.className = ''
    document.body.innerHTML = ''
    scope = effectScope()
    mod = await import('../../../src/runtime/composables/useColorMode.js')
  })

  afterEach(() => {
    scope.stop()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('resolveColorMode', () => {
    it('returns light and dark as they are', () => {
      expect(mod.resolveColorMode('light', true)).toBe('light')
      expect(mod.resolveColorMode('dark', false)).toBe('dark')
    })

    it('follows the browser for "system" and "auto"', () => {
      expect(mod.resolveColorMode('system', true)).toBe('dark')
      expect(mod.resolveColorMode('system', false)).toBe('light')
      expect(mod.resolveColorMode('auto', true)).toBe('dark')
    })

    it('ignores case and surrounding spaces', () => {
      expect(mod.resolveColorMode(' DARK ', false)).toBe('dark')
      expect(mod.resolveColorMode('System', true)).toBe('dark')
    })

    it('is light for a missing or unknown setting, whatever the browser prefers', () => {
      expect(mod.resolveColorMode(undefined, true)).toBe('light')
      expect(mod.resolveColorMode(null, true)).toBe('light')
      expect(mod.resolveColorMode('sepia', true)).toBe('light')
    })
  })

  describe('useParticipantColorMode', () => {
    it('is the configured mode', () => {
      store.config.colorMode = 'dark'
      expect(run(() => mod.useParticipantColorMode()).value).toBe('dark')
    })

    it('follows the browser while the setting is "system", and updates when it changes', () => {
      store.config.colorMode = 'system'
      const mode = run(() => mod.useParticipantColorMode())
      expect(mode.value).toBe('light')
      preferredDark.value = true
      expect(mode.value).toBe('dark')
    })

    it('updates when the setting changes', () => {
      const mode = run(() => mod.useParticipantColorMode())
      expect(mode.value).toBe('light')
      store.config.colorMode = 'dark'
      expect(mode.value).toBe('dark')
    })

    it('does not read the dev tools\' modes', () => {
      store.dev.experimentColorMode = 'dark'
      store.dev.globalColorMode = 'dark'
      expect(run(() => mod.useParticipantColorMode()).value).toBe('light')
    })
  })

  describe('getColorMode and setColorMode', () => {
    it('read and write the global mode', () => {
      expect(mod.getColorMode('global')).toBe('auto')
      mod.setColorMode('global', 'dark')
      expect(store.dev.globalColorMode).toBe('dark')
      expect(mod.getColorMode('global')).toBe('dark')
    })

    it('read and write the experiment mode (the default scope)', () => {
      mod.setColorMode('experiment', 'dark')
      expect(store.dev.experimentColorMode).toBe('dark')
      expect(mod.getColorMode()).toBe('dark')
      expect(store.dev.globalColorMode).toBe('auto')
    })

    it('the experiment mode shows the study\'s own setting until the dev tools pick one', () => {
      store.config.colorMode = 'dark'
      expect(mod.getColorMode('experiment')).toBe('dark')
      store.config.colorMode = 'light'
      expect(mod.getColorMode('experiment')).toBe('light')
      store.dev.experimentColorMode = 'dark'
      expect(mod.getColorMode('experiment')).toBe('dark')
    })

    it('the study\'s "system" setting reads as "auto" in the dev tools', () => {
      store.config.colorMode = 'system'
      expect(mod.getColorMode('experiment')).toBe('auto')
    })
  })

  describe('useSmileColorMode: global scope', () => {
    it('puts the resolved mode on <html> and on .global-color-mode', async () => {
      document.body.innerHTML = '<div class="global-color-mode"></div><div class="device-container"></div>'
      store.dev.globalColorMode = 'dark'
      run(() => mod.useSmileColorMode('global'))
      await settle()
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(document.querySelector('.global-color-mode').classList.contains('dark')).toBe(true)
      // The experiment's container is not touched
      expect(document.querySelector('.device-container').className).toBe('device-container')
    })

    it('replaces the old class when the mode changes', async () => {
      const cm = run(() => mod.useSmileColorMode('global'))
      await settle()
      expect(document.documentElement.classList.contains('light')).toBe(true)
      cm.setDark()
      await settle()
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(document.documentElement.classList.contains('light')).toBe(false)
    })

    it('"auto" resolves to the browser\'s preference and follows it', async () => {
      const cm = run(() => mod.useSmileColorMode('global'))
      expect(cm.mode.value).toBe('auto')
      expect(cm.system.value).toBe('light')
      expect(cm.state.value).toBe('light')
      preferredDark.value = true
      expect(cm.system.value).toBe('dark')
      expect(cm.state.value).toBe('dark')
      await settle()
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })

    it('the setters write the dev setting', () => {
      const cm = run(() => mod.useSmileColorMode('global'))
      cm.setLight()
      expect(store.dev.globalColorMode).toBe('light')
      cm.setDark()
      expect(store.dev.globalColorMode).toBe('dark')
      cm.setAuto()
      expect(store.dev.globalColorMode).toBe('auto')
    })

    it('toggle goes auto → light → dark → auto', () => {
      const cm = run(() => mod.useSmileColorMode('global'))
      cm.toggle()
      expect(cm.mode.value).toBe('light')
      cm.toggle()
      expect(cm.mode.value).toBe('dark')
      cm.toggle()
      expect(cm.mode.value).toBe('auto')
    })

    it('does nothing when an element it styles is not on the page', async () => {
      // no .global-color-mode element
      store.dev.globalColorMode = 'dark'
      expect(() => run(() => mod.useSmileColorMode('global'))).not.toThrow()
      await settle()
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })

    it('a mode that is neither light nor dark removes the classes and adds none', async () => {
      document.documentElement.classList.add('dark')
      store.dev.globalColorMode = 'sepia'
      run(() => mod.useSmileColorMode('global'))
      await settle()
      expect(document.documentElement.classList.contains('dark')).toBe(false)
      expect(document.documentElement.classList.contains('sepia')).toBe(false)
    })
  })

  describe('useSmileColorMode: experiment scope', () => {
    const containers = '<div class="device-container"></div><div class="dev-color-mode"></div><div class="device-wrapper"></div>'

    it('puts the mode on the experiment\'s containers and not on <html>', async () => {
      document.body.innerHTML = containers
      store.dev.experimentColorMode = 'dark'
      run(() => mod.useSmileColorMode())
      await settle()
      for (const selector of ['.device-container', '.dev-color-mode', '.device-wrapper']) {
        expect(document.querySelector(selector).classList.contains('dark'), selector).toBe(true)
      }
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })

    it('the two scopes are independent', async () => {
      document.body.innerHTML = containers
      const global = run(() => mod.useSmileColorMode('global'))
      const experiment = run(() => mod.useSmileColorMode('experiment'))
      global.setDark()
      experiment.setLight()
      await settle()
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(document.querySelector('.device-container').classList.contains('light')).toBe(true)
      expect(store.dev.globalColorMode).toBe('dark')
      expect(store.dev.experimentColorMode).toBe('light')
    })

    it('toggle starts from the study\'s setting when the dev tools have not picked a mode', () => {
      store.config.colorMode = 'system'
      const cm = run(() => mod.useSmileColorMode('experiment'))
      expect(cm.mode.value).toBe('auto')
      cm.toggle()
      expect(store.dev.experimentColorMode).toBe('light')
    })

    it('styles open popovers and menus that are marked as the experiment\'s, and no others', async () => {
      document.body.innerHTML = containers
        + '<div data-slot="popover-content" data-experiment-portal="true" class="light" id="exp"></div>'
        + '<div data-slot="select-content" id="dev"></div>'
      store.dev.experimentColorMode = 'dark'
      run(() => mod.useSmileColorMode('experiment'))
      await settle()
      expect(document.getElementById('exp').className).toBe('dark')
      expect(document.getElementById('dev').className).toBe('')
    })

    it('a mode that is neither light nor dark clears a marked popover\'s classes', async () => {
      document.body.innerHTML = '<div data-slot="dialog-content" data-experiment-portal="true" class="dark" id="exp"></div>'
      store.dev.experimentColorMode = 'sepia'
      run(() => mod.useSmileColorMode('experiment'))
      await settle()
      expect(document.getElementById('exp').className).toBe('')
    })

    describe('popovers added later', () => {
      /** Starts the experiment scope and waits for its observer to be set up. */
      async function startExperiment(mode) {
        store.dev.experimentColorMode = mode
        run(() => mod.useSmileColorMode('experiment'))
        await settle()
      }
      /** Waits for the MutationObserver to deliver. */
      const observed = () => new Promise(resolve => setTimeout(resolve, 0))

      it('get the experiment\'s mode when a control inside the experiment is open', async () => {
        document.body.innerHTML = '<div data-experiment-scope><button aria-expanded="true"></button></div>'
        await startExperiment('dark')
        const popover = document.createElement('div')
        popover.setAttribute('data-slot', 'popover-content')
        popover.className = 'light'
        document.body.appendChild(popover)
        await observed()
        expect(popover.getAttribute('data-experiment-portal')).toBe('true')
        expect(popover.className).toBe('dark')
      })

      it('are found when they are inside the element that was added', async () => {
        document.body.innerHTML = '<div data-experiment-scope><button data-state="open"></button></div>'
        await startExperiment('light')
        const wrapper = document.createElement('div')
        wrapper.innerHTML = '<div data-slot="select-content" id="inner"></div>'
        document.body.appendChild(wrapper)
        await observed()
        expect(document.getElementById('inner').className).toBe('light')
        expect(wrapper.hasAttribute('data-experiment-portal')).toBe(false)
      })

      it('follow the browser when the experiment mode is "auto"', async () => {
        document.body.innerHTML = '<div data-experiment-scope><button aria-expanded="true"></button></div>'
        preferredDark.value = true
        await startExperiment('auto')
        const menu = document.createElement('div')
        menu.setAttribute('data-slot', 'dropdown-menu-content')
        document.body.appendChild(menu)
        await observed()
        expect(menu.className).toBe('dark')
      })

      it('are left alone when no control inside the experiment is open (a dev tools popover)', async () => {
        document.body.innerHTML = '<div data-experiment-scope><button aria-expanded="false"></button></div>'
        await startExperiment('dark')
        const popover = document.createElement('div')
        popover.setAttribute('data-slot', 'popover-content')
        document.body.appendChild(popover)
        await observed()
        expect(popover.hasAttribute('data-experiment-portal')).toBe(false)
        expect(popover.className).toBe('')
      })

      it('are left alone when the page has no experiment container', async () => {
        await startExperiment('dark')
        const popover = document.createElement('div')
        popover.setAttribute('data-slot', 'tooltip-content')
        document.body.appendChild(popover)
        await observed()
        expect(popover.hasAttribute('data-experiment-portal')).toBe(false)
      })

      it('other elements and text nodes are ignored', async () => {
        document.body.innerHTML = '<div data-experiment-scope><button aria-expanded="true"></button></div>'
        await startExperiment('dark')
        const plain = document.createElement('div')
        document.body.appendChild(plain)
        document.body.appendChild(document.createTextNode('text'))
        await observed()
        expect(plain.hasAttribute('data-experiment-portal')).toBe(false)
        expect(plain.className).toBe('')
      })

      it('a mode that is neither light nor dark marks the popover and clears its classes', async () => {
        document.body.innerHTML = '<div data-experiment-scope><button aria-expanded="true"></button></div>'
        await startExperiment('sepia')
        const popover = document.createElement('div')
        popover.setAttribute('data-slot', 'popover-content')
        popover.className = 'dark'
        document.body.appendChild(popover)
        await observed()
        expect(popover.getAttribute('data-experiment-portal')).toBe('true')
        expect(popover.className).toBe('')
      })
    })

    it('a click inside or outside the experiment does not throw', async () => {
      vi.useFakeTimers()
      document.body.innerHTML = '<div data-experiment-scope><button id="in"></button></div><button id="out"></button>'
      store.dev.experimentColorMode = 'dark'
      run(() => mod.useSmileColorMode('experiment'))
      await settle()
      expect(() => {
        document.getElementById('in').click()
        document.getElementById('out').click()
        vi.advanceTimersByTime(1500)
      }).not.toThrow()
    })
  })
})
