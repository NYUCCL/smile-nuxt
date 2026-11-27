/**
 * Preload lists: paths, patterns and full URLs (#30).
 */
import { describe, it, expect } from 'vitest'
import { expandList, isFullUrl, isPattern, patternToRegExp } from '../../../src/runtime/core/preload/patterns.js'

const FILES = [
  'logo.png',
  'stimuli/a.png',
  'stimuli/b.png',
  'stimuli/c.jpg',
  'stimuli/set1/d.png',
  'stimuli/set1/deep/e.png',
  'video/intro.mp4',
  'video/intro.webm',
  'data/trials (1).json',
]
const match = pattern => FILES.filter(file => patternToRegExp(pattern).test(file))

describe('isPattern', () => {
  it.each(['a/*.png', 'a/**', 'a/img?.png', 'a/*.{png,jpg}', 'a/{x,y}.png'])('%s is a pattern', (path) => {
    expect(isPattern(path)).toBe(true)
  })

  it.each(['a/b.png', 'trials (1).json', 'a/{only}.png', 'a/b+c.png'])('%s is a plain path', (path) => {
    expect(isPattern(path)).toBe(false)
  })
})

describe('isFullUrl', () => {
  it.each(['https://cdn.example.org/a.mp4', 'http://x/a.png', '//cdn.example.org/a.png', 'blob:http://x/1', 'data:image/png;base64,AA'])('%s is used as it is', (url) => {
    expect(isFullUrl(url)).toBe(true)
  })

  it.each(['a.png', '/a.png', 'stimuli/a:b.png', 'c/d.mp4'])('%s is a path in public/', (path) => {
    expect(isFullUrl(path)).toBe(false)
  })
})

describe('patternToRegExp', () => {
  it('* matches within one folder', () => {
    expect(match('stimuli/*.png')).toEqual(['stimuli/a.png', 'stimuli/b.png'])
    expect(match('*.png')).toEqual(['logo.png'])
  })

  it('** matches across folders', () => {
    expect(match('stimuli/**')).toEqual(['stimuli/a.png', 'stimuli/b.png', 'stimuli/c.jpg', 'stimuli/set1/d.png', 'stimuli/set1/deep/e.png'])
  })

  it('**/ also matches no folder', () => {
    expect(match('stimuli/**/*.png')).toEqual(['stimuli/a.png', 'stimuli/b.png', 'stimuli/set1/d.png', 'stimuli/set1/deep/e.png'])
    expect(match('**/*.png')).toContain('logo.png')
  })

  it('? matches one character, not a slash', () => {
    expect(match('stimuli/?.png')).toEqual(['stimuli/a.png', 'stimuli/b.png'])
    expect(match('stimuli?a.png')).toEqual([])
  })

  it('{a,b} matches either', () => {
    expect(match('stimuli/*.{png,jpg}')).toEqual(['stimuli/a.png', 'stimuli/b.png', 'stimuli/c.jpg'])
    expect(match('video/intro.{mp4,webm}')).toEqual(['video/intro.mp4', 'video/intro.webm'])
  })

  it('other characters match themselves', () => {
    expect(match('data/trials (1).*')).toEqual(['data/trials (1).json'])
    expect(match('logoXpng')).toEqual([])
    expect(patternToRegExp('a+b[1]$.png').test('a+b[1]$.png')).toBe(true)
  })

  it('a brace that is not closed, and a comma outside braces, match themselves', () => {
    expect(patternToRegExp('a,b}*.png').test('a,b}c.png')).toBe(true)
  })
})

describe('expandList', () => {
  it('keeps plain paths, without the leading slash', () => {
    expect(expandList(['/stimuli/a.png', 'logo.png']).paths).toEqual(['stimuli/a.png', 'logo.png'])
  })

  it('a plain path is kept even when no such file is listed', () => {
    expect(expandList(['not/there.png'], FILES)).toEqual({ paths: ['not/there.png'], unmatched: [] })
  })

  it('keeps full URLs as they are', () => {
    expect(expandList(['https://cdn.example.org/a b.mp4?x=*']).paths).toEqual(['https://cdn.example.org/a b.mp4?x=*'])
  })

  it('replaces a pattern with the files it matches, sorted', () => {
    expect(expandList(['/stimuli/*.png', 'video/*'], FILES).paths).toEqual(['stimuli/a.png', 'stimuli/b.png', 'video/intro.mp4', 'video/intro.webm'])
  })

  it('lists a file once, at its first place', () => {
    expect(expandList(['stimuli/b.png', 'stimuli/*.png', 'stimuli/b.png'], FILES).paths).toEqual(['stimuli/b.png', 'stimuli/a.png'])
  })

  it('reports a pattern that matched nothing', () => {
    expect(expandList(['stimuli/*.gif', 'logo.png'], FILES)).toEqual({ paths: ['logo.png'], unmatched: ['stimuli/*.gif'] })
    expect(expandList(['stimuli/*.png'])).toEqual({ paths: [], unmatched: ['stimuli/*.png'] })
  })

  it('skips what is not a non-empty string', () => {
    expect(expandList(['', null, undefined, 3, 'a.png']).paths).toEqual(['a.png'])
  })
})
