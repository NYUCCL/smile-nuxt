import { describe, it, expect, afterEach, vi } from 'vitest'
import { copyText } from '../../../src/runtime/utils/clipboard.js'

describe('copyText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete document.execCommand
    document.body.innerHTML = ''
  })

  function stubExecCommand(result = true) {
    const seen = []
    document.execCommand = vi.fn(() => {
      const el = document.activeElement
      seen.push({ command: 'copy', value: document.querySelector('textarea')?.value, active: el })
      return result
    })
    return seen
  }

  it('uses navigator.clipboard.writeText when the page has it', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    document.execCommand = vi.fn()

    expect(await copyText('abc123')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('abc123')
    expect(document.execCommand).not.toHaveBeenCalled()
  })

  it('selects the given field and uses execCommand when there is no navigator.clipboard', async () => {
    vi.stubGlobal('navigator', {})
    document.execCommand = vi.fn(() => true)
    const input = document.createElement('input')
    input.value = 'abc123'
    document.body.appendChild(input)
    const select = vi.spyOn(input, 'select')

    expect(await copyText('abc123', input)).toBe(true)
    expect(select).toHaveBeenCalledTimes(1)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
    expect(input.isConnected).toBe(true)
  })

  it('uses a temporary textarea when no field is given, and removes it', async () => {
    vi.stubGlobal('navigator', {})
    const seen = stubExecCommand()

    expect(await copyText('some text')).toBe(true)
    expect(seen).toHaveLength(1)
    expect(seen[0].value).toBe('some text')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('uses a temporary textarea when the field holds different text', async () => {
    vi.stubGlobal('navigator', {})
    const seen = stubExecCommand()
    const input = document.createElement('input')
    input.value = 'other'
    document.body.appendChild(input)

    expect(await copyText('wanted', input)).toBe(true)
    expect(seen[0].value).toBe('wanted')
    expect(input.value).toBe('other')
  })

  it('falls back to execCommand when writeText is refused', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('NotAllowedError')))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const seen = stubExecCommand()

    expect(await copyText('abc')).toBe(true)
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(seen[0].value).toBe('abc')
  })

  it('returns false, without throwing, when neither way works', async () => {
    vi.stubGlobal('navigator', {})
    document.execCommand = vi.fn(() => false)
    expect(await copyText('abc')).toBe(false)

    document.execCommand = vi.fn(() => {
      throw new Error('not supported')
    })
    expect(await copyText('abc')).toBe(false)
    expect(document.querySelector('textarea')).toBeNull()

    delete document.execCommand
    document.execCommand = undefined
    expect(await copyText('abc')).toBe(false)
  })
})
