/**
 * @fileoverview Small dev tools modules: the palette's bus, the docs search
 * command from the participant view, the device presets, and the class-name
 * helper the UI components use.
 */
import { describe, it, expect, vi } from 'vitest'
import { paletteRequests, openCommandPalette, docsJump } from '../../src/runtime/components/dev/palette/bus.js'
import { findCommand } from '../../src/runtime/components/dev/palette/commands.js'
import { devicePresets } from '../../src/runtime/components/dev/devicePresets.js'
import { initDev } from '../../src/runtime/stores/smilestore'
import { cn } from '../../src/runtime/lib/utils.js'

describe('palette bus', () => {
  it('openCommandPalette adds one request each time', () => {
    const before = paletteRequests.value
    openCommandPalette()
    openCommandPalette()
    expect(paletteRequests.value).toBe(before + 2)
  })
})

describe('docs search from the participant view', () => {
  it('sets Docs mode and the page, then loads /dev/ and shows no message', async () => {
    const api = { store: { dev: { mainView: 'devmode', docsPage: null } } }
    const env = {
      api,
      context: 'participant',
      navigate: vi.fn(),
      nextTick: vi.fn(() => Promise.resolve()),
      searchDocs: vi.fn(async () => [{ path: 'coding/steps.md', hash: 'steps', title: 'Steps' }]),
    }
    const result = await findCommand('search').run(env, 'steps')
    expect(result).toBeNull()
    expect(api.store.dev.mainView).toBe('docs')
    expect(api.store.dev.docsPage).toBe('coding/steps.md')
    expect(docsJump.value).toEqual({ path: 'coding/steps.md', hash: 'steps' })
    expect(env.nextTick).toHaveBeenCalled()
    expect(env.navigate).toHaveBeenCalledWith('/dev/')
  })

  it('a result without a heading jumps to the top of the page', async () => {
    const api = { store: { dev: {} } }
    const env = { api, context: 'dev', navigate: vi.fn(), nextTick: vi.fn(), searchDocs: vi.fn() }
    await findCommand('search').run(env, '', { path: 'api.md', title: 'API' })
    expect(docsJump.value).toEqual({ path: 'api.md', hash: '' })
    expect(env.searchDocs).not.toHaveBeenCalled()
  })
})

describe('device presets', () => {
  it('every preset has a name and a positive width and height', () => {
    for (const [key, preset] of Object.entries(devicePresets)) {
      expect(typeof preset.name, key).toBe('string')
      expect(preset.width, key).toBeGreaterThan(0)
      expect(preset.height, key).toBeGreaterThan(0)
    }
  })

  it('the dev tools\' default device is a preset, with the default size', () => {
    const preset = devicePresets[initDev.selectedDevice]
    expect(preset).toBeDefined()
    expect(preset.width).toBe(initDev.deviceWidth)
    expect(preset.height).toBe(initDev.deviceHeight)
  })
})

describe('cn', () => {
  it('joins class names and leaves out false values', () => {
    expect(cn('a', false, null, undefined, 'b', { c: true, d: false }, ['e'])).toBe('a b c e')
  })

  it('the later of two conflicting Tailwind classes wins', () => {
    expect(cn('p-2 text-sm', 'p-4')).toBe('text-sm p-4')
  })
})
