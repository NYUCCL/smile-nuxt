/**
 * usePreload: the page's one preloader, and a preload list turned into URLs
 * (#30). The list of public files is test/setup/public-files-stub.js here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useRuntimeConfig } from '#imports'
import usePreload, { _resetPreload, assetUrl, getPreloader, loadPublicFiles } from '../../../src/runtime/composables/usePreload.js'
import publicFiles from '../../setup/public-files-stub.js'

const api = { log: { warn: vi.fn() }, conditions: { set: 'b' } }

beforeEach(() => {
  _resetPreload()
  api.log.warn.mockClear()
  vi.mocked(useRuntimeConfig).mockReturnValue({ app: { baseURL: '/study/' }, public: { smile: {} } })
})
afterEach(() => _resetPreload())

describe('the preloader', () => {
  it('is one per page', () => {
    expect(getPreloader()).toBe(getPreloader())
    expect(usePreload().preloader).toBe(getPreloader())
  })

  it('can be replaced for a test', () => {
    const preloader = { mine: true }
    _resetPreload({ preloader })
    expect(usePreload().preloader).toBe(preloader)
  })
})

describe('assetUrl', () => {
  it('puts a path in public/ under the base URL', () => {
    expect(assetUrl('stimuli/a.png', '/study/')).toBe('/study/stimuli/a.png')
    expect(assetUrl('/stimuli/a.png', '/')).toBe('/stimuli/a.png')
    expect(assetUrl('a.png')).toBe('/a.png')
  })

  it('leaves a full URL as it is', () => {
    expect(assetUrl('https://cdn.example.org/a.mp4', '/study/')).toBe('https://cdn.example.org/a.mp4')
  })
})

describe('urlOf', () => {
  it('uses the runtime config\'s base URL, or the one given', () => {
    expect(usePreload().urlOf('a.png')).toBe('/study/a.png')
    expect(usePreload('/other/').urlOf('a.png')).toBe('/other/a.png')
  })

  it('works without a runtime config', () => {
    vi.mocked(useRuntimeConfig).mockReturnValue(undefined)
    expect(usePreload().urlOf('a.png')).toBe('/a.png')
  })
})

describe('urlsOf', () => {
  it('turns paths and full URLs into URLs without loading the list of public files', async () => {
    const { urlsOf, urlsOfNow } = usePreload()
    expect(await urlsOf(['a.png', '/b/c.mp4', 'https://x.org/d.mp4'], api)).toEqual(['/study/a.png', '/study/b/c.mp4', 'https://x.org/d.mp4'])
    // Still not loaded: a pattern can't be worked out at once
    expect(urlsOfNow(['stimuli/*.png'], api)).toBeNull()
  })

  it('takes one path, nothing, or a function of the API', async () => {
    const { urlsOf } = usePreload()
    expect(await urlsOf('a.png', api)).toEqual(['/study/a.png'])
    expect(await urlsOf(undefined, api)).toEqual([])
    expect(await urlsOf(null, api)).toEqual([])
    expect(await urlsOf(given => [`set-${given.conditions.set}/1.png`], api)).toEqual(['/study/set-b/1.png'])
    expect(await urlsOf(() => 'one.png', api)).toEqual(['/study/one.png'])
    expect(await urlsOf(() => undefined, api)).toEqual([])
  })

  it('expands a pattern against the project\'s public files', async () => {
    const { urlsOf } = usePreload()
    expect(await urlsOf(['stimuli/*.png', 'video/**'], api)).toEqual(['/study/stimuli/a.png', '/study/stimuli/b.png', '/study/video/intro.mp4'])
  })

  it('a pattern in a full URL is not a pattern', async () => {
    const { urlsOf, urlsOfNow } = usePreload()
    expect(urlsOfNow(['https://x.org/a.mp4?size=*'], api)).toEqual(['https://x.org/a.mp4?size=*'])
    expect(await urlsOf(['https://x.org/a.mp4?size=*'], api)).toEqual(['https://x.org/a.mp4?size=*'])
  })

  it('warns once about a pattern that matches no file', async () => {
    const { urlsOf } = usePreload()
    expect(await urlsOf(['stimuli/*.gif'], api)).toEqual([])
    await urlsOf(['stimuli/*.gif'], api)
    expect(api.log.warn).toHaveBeenCalledTimes(1)
    expect(api.log.warn).toHaveBeenCalledWith('PRELOAD: the pattern \'stimuli/*.gif\' matches no file in public/')
  })

  it('works without an API (no function, no log)', async () => {
    expect(await usePreload().urlsOf(['stimuli/*.gif', 'a.png'])).toEqual(['/study/a.png'])
  })

  it('skips what is not a string', async () => {
    expect(await usePreload().urlsOf([null, 3, 'a.png'], api)).toEqual(['/study/a.png'])
    expect(usePreload().urlsOfNow([null, 3, 'a.png'], api)).toEqual(['/study/a.png'])
  })
})

describe('urlsOfNow', () => {
  it('gives the URLs at once when the list has no pattern', () => {
    expect(usePreload().urlsOfNow(['a.png', given => given], api)).toEqual(['/study/a.png'])
    expect(usePreload().urlsOfNow(() => ['x.mp4'], api)).toEqual(['/study/x.mp4'])
    expect(usePreload().urlsOfNow(undefined, api)).toEqual([])
  })

  it('gives a pattern\'s URLs at once after the list of public files has loaded', async () => {
    const { urlsOfNow } = usePreload()
    expect(urlsOfNow(['stimuli/*.png'], api)).toBeNull()
    expect(await loadPublicFiles()).toEqual(publicFiles)
    expect(urlsOfNow(['stimuli/*.png'], api)).toEqual(['/study/stimuli/a.png', '/study/stimuli/b.png'])
  })

  it('loads the list of public files once', () => {
    expect(loadPublicFiles()).toBe(loadPublicFiles())
  })

  it('uses a list given for a test', () => {
    _resetPreload({ publicFiles: ['x/1.png'] })
    expect(usePreload().urlsOfNow(['x/*'], api)).toEqual(['/study/x/1.png'])
  })
})
