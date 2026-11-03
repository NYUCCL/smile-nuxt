import { describe, it, expect, vi, afterEach } from 'vitest'

// config.js reads import.meta.env when it's first imported, so each test stubs
// the env and imports a fresh copy.
async function loadConfig(env) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return (await import('../../src/runtime/core/config.js')).default
}

describe('config: data saving settings (#35)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('parses numbers and booleans from the env strings', async () => {
    const config = await loadConfig({
      VITE_AUTO_SAVE_DATA: 'true',
      VITE_MAX_WRITES: '250',
      VITE_MIN_WRITE_INTERVAL: '1500',
      VITE_MAX_STEPS: '42',
    })
    expect(config.autoSave).toBe(true)
    expect(config.maxWrites).toBe(250)
    expect(config.minWriteInterval).toBe(1500)
    expect(config.maxSteps).toBe(42)
  })

  it('turns auto-save off when set to "false"', async () => {
    // The raw string 'false' is truthy; it used to leave auto-save on.
    const config = await loadConfig({ VITE_AUTO_SAVE_DATA: 'false' })
    expect(config.autoSave).toBe(false)
  })

  it('falls back to the defaults when the settings are empty', async () => {
    // Without fallbacks the throttle and the write cap silently turned off.
    const config = await loadConfig({
      VITE_AUTO_SAVE_DATA: '',
      VITE_MAX_WRITES: '',
      VITE_MIN_WRITE_INTERVAL: 'not a number',
      VITE_MAX_STEPS: '',
    })
    expect(config.autoSave).toBe(true)
    expect(config.maxWrites).toBe(1000)
    expect(config.minWriteInterval).toBe(2000)
    expect(config.maxSteps).toBe(5000)
  })

  it('exposes the data size reference used by the dev tools', async () => {
    const config = await loadConfig({})
    expect(config.dataSizeReference).toBe(4_500_000)
  })
})

describe('config: color mode (#32)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
    ['system', 'system'],
    ['auto', 'system'],
    [' Dark ', 'dark'],
    ['', 'light'],
    ['purple', 'light'],
  ])('VITE_COLOR_MODE=%j gives %s', async (value, expected) => {
    const config = await loadConfig({ VITE_COLOR_MODE: value })
    expect(config.colorMode).toBe(expected)
  })

  it('resolves system against the browser preference', async () => {
    vi.resetModules()
    vi.doMock('../../src/runtime/composables/useAPI', () => ({ default: () => ({}) }))
    const { resolveColorMode } = await import('../../src/runtime/composables/useColorMode.js')
    expect(resolveColorMode('system', true)).toBe('dark')
    expect(resolveColorMode('system', false)).toBe('light')
    expect(resolveColorMode('auto', true)).toBe('dark')
    expect(resolveColorMode('light', true)).toBe('light')
    expect(resolveColorMode('dark', false)).toBe('dark')
    expect(resolveColorMode(undefined, true)).toBe('light')
  })
})
