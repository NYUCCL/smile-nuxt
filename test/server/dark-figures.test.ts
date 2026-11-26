// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { darkColor, darkSvg, lightFigure, darkFigure } from '../../src/runtime/server/dev/darkFigures.js'

/**
 * Dark copies of the docs' diagrams (server/dev/darkFigures.js): the color
 * rule, and what darkSvg does with each way an SVG can carry a color.
 */

const BG = '#1b1b1f' // the dark page
const FG = '#e6e6e6' // the light ink

/** Lightness of '#rrggbb' as the mean of its channels, 0 to 255 */
const lightness = (hex: string) => [1, 3, 5].reduce((sum, i) => sum + Number.parseInt(hex.slice(i, i + 2), 16), 0) / 3

describe('darkColor', () => {
  it('turns white into the dark page and black into the light ink', () => {
    expect(darkColor('#ffffff')).toBe(BG)
    expect(darkColor('#000000')).toBe(FG)
    expect(darkColor('#050505')).toBe(FG)
  })

  it('reads the short, named and upper-case forms as the same colors', () => {
    expect(darkColor('#fff')).toBe(BG)
    expect(darkColor('#000')).toBe(FG)
    expect(darkColor('white')).toBe(BG)
    expect(darkColor('Black')).toBe(FG)
    expect(darkColor('#FFFFFF')).toBe(BG)
    expect(darkColor(' #abc ')).toBe(darkColor('#aabbcc'))
  })

  it('reads rgb() and keeps the alpha of rgba()', () => {
    expect(darkColor('rgb(255, 255, 255)')).toBe(BG)
    expect(darkColor('rgb(0,0,0)')).toBe(FG)
    expect(darkColor('rgba(0, 0, 0, 0.5)')).toBe('rgba(230, 230, 230, 0.5)')
  })

  it('flips grays: a light gray comes out dark and a dark gray light', () => {
    expect(lightness(darkColor('#eeeeee'))).toBeLessThan(80)
    expect(lightness(darkColor('#333333'))).toBeGreaterThan(140)
    // order is reversed
    expect(lightness(darkColor('#cccccc'))).toBeLessThan(lightness(darkColor('#666666')))
  })

  it('makes a pale colored fill darker and keeps its hue', () => {
    const out = darkColor('#dbeafe') // pale blue
    expect(lightness(out)).toBeLessThan(lightness('#dbeafe'))
    const [r, , b] = [1, 3, 5].map(i => Number.parseInt(out.slice(i, i + 2), 16))
    expect(b).toBeGreaterThan(r!)
  })

  it('lifts a dark data color and keeps its hue', () => {
    const out = darkColor('#1e3a8a') // dark blue
    expect(lightness(out)).toBeGreaterThan(lightness('#1e3a8a'))
    const [r, , b] = [1, 3, 5].map(i => Number.parseInt(out.slice(i, i + 2), 16))
    expect(b).toBeGreaterThan(r!)
  })

  it('returns what it cannot read unchanged', () => {
    for (const value of ['none', 'currentColor', 'url(#grad)', 'var(--ink)', '#12', 'rgb(a, b, c)', '']) {
      expect(darkColor(value)).toBe(value)
    }
  })

  it('gives the same answer each time', () => {
    expect(darkColor('#3b82f6')).toBe(darkColor('#3b82f6'))
    expect(darkColor('#3b82f6')).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('darkSvg', () => {
  it('recolors fill, stroke and stop-color attributes', () => {
    const out = darkSvg('<svg><rect fill="#ffffff" stroke="#000000"/><stop stop-color="white"/></svg>')
    expect(out).toContain(`<rect fill="${BG}" stroke="${FG}"/>`)
    expect(out).toContain(`<stop stop-color="${BG}"/>`)
  })

  it('gives the root the light ink as its fill, unless it sets one', () => {
    expect(darkSvg('<svg viewBox="0 0 1 1"><text>a</text></svg>')).toContain(`<svg viewBox="0 0 1 1" fill="${FG}">`)
    expect(darkSvg('<svg fill="#000000"><text>a</text></svg>')).toContain(`<svg fill="${FG}">`)
  })

  it('recolors colors in style attributes and in a <style> element', () => {
    const out = darkSvg('<svg><text style="fill: #000000; stroke: white">a</text><style>.a { fill: #ffffff; color: black }</style></svg>')
    expect(out).toContain(`style="fill: ${FG}; stroke: ${BG}"`)
    expect(out).toContain(`.a { fill: ${BG}; color: ${FG} }`)
  })

  it('leaves other attributes, none, and references to gradients alone', () => {
    const out = darkSvg('<svg><rect id="cb0" data-color="#ffffff" fill="none" stroke="url(#cb0)"/></svg>')
    expect(out).toContain('id="cb0" data-color="#ffffff" fill="none" stroke="url(#cb0)"')
  })

  it('data-dark="keep" keeps that element\'s colors, and only that element\'s', () => {
    const out = darkSvg('<svg><g data-dark="keep" fill="#000000"><rect fill="#ffffff"/></g><rect data-dark="keep" fill="#000000"/></svg>')
    expect(out).toContain('<g data-dark="keep" fill="#000000">')
    expect(out).toContain(`<g data-dark="keep" fill="#000000"><rect fill="${BG}"/>`)
    expect(out).toContain('<rect data-dark="keep" fill="#000000"/>')
  })

  it('data-dark="keep-all" on a group keeps everything inside it, nested groups too', () => {
    const out = darkSvg('<svg><g data-dark="keep-all" fill="#ffffff"><rect fill="#000000"/><g><text fill="white">a</text></g></g><rect fill="#000000"/></svg>')
    expect(out).toContain('<g data-dark="keep-all" fill="#ffffff"><rect fill="#000000"/><g><text fill="white">a</text></g></g>')
    // after the group closes, colors are recolored again
    expect(out).toContain(`</g><rect fill="${FG}"/>`)
  })

  it('a keep-all group with no fill takes the light file\'s root fill, black when the root sets none', () => {
    expect(darkSvg('<svg><g data-dark="keep-all"><text>a</text></g></svg>')).toContain('<g fill="#000000" data-dark="keep-all">')
    expect(darkSvg('<svg fill="#333333"><g data-dark="keep-all"><text>a</text></g></svg>')).toContain('<g fill="#333333" data-dark="keep-all">')
    // only the outermost keep-all group gets it
    const nested = darkSvg('<svg><g data-dark="keep-all"><g data-dark="keep-all"><text>a</text></g></g></svg>')
    expect(nested.match(/<g fill="#000000"/g)).toHaveLength(1)
  })

  it('a self-closing group does not start a kept region', () => {
    const out = darkSvg('<svg><g data-dark="keep-all"/><rect fill="#000000"/></svg>')
    expect(out).toContain(`<rect fill="${FG}"/>`)
  })

  it('data-dark-fill and data-dark-stroke set that paint in the dark copy', () => {
    const out = darkSvg('<svg><rect fill="#ffffff" data-dark-fill="#123456"/><path stroke="#000" data-dark-stroke="#abcdef"/><text data-dark-fill="#fedcba">a</text></svg>')
    expect(out).toContain('<rect fill="#123456" data-dark-fill="#123456"/>')
    expect(out).toContain('<path stroke="#abcdef" data-dark-stroke="#abcdef"/>')
    // no fill attribute to replace: one is added
    expect(out).toContain('<text fill="#fedcba" data-dark-fill="#fedcba">')
  })

  it('a pinned color applies inside a kept group too', () => {
    const out = darkSvg('<svg><g data-dark="keep-all" fill="#fff"><rect fill="#ffffff" data-dark-fill="#cccccc"/></g></svg>')
    expect(out).toContain('<rect fill="#cccccc" data-dark-fill="#cccccc"/>')
  })
})

describe('lightFigure and darkFigure', () => {
  const figure = '<?xml version="1.0"?>\n<svg viewBox="0 0 760 300"><title>T</title><rect width="760" height="300" fill="white"/><text fill="#000000">a</text></svg>'

  it('lightFigure makes the background rect transparent and drops the XML declaration', () => {
    const out = lightFigure(figure)
    expect(out).toContain('<title>T</title><rect width="760" height="300" fill="none"/>')
    expect(out.startsWith('<svg')).toBe(true)
    expect(out).toContain('<text fill="#000000">')
  })

  it('accepts #fff and #ffffff as the background, and a decimal height', () => {
    expect(lightFigure('<svg><rect width="760" height="120.5" fill="#fff"/></svg>')).toContain('<rect width="760" height="120.5" fill="none"/>')
    expect(lightFigure('<svg><rect width="760" height="10" fill="#FFFFFF"/></svg>')).toContain('fill="none"')
  })

  it('darkFigure is the light figure recolored', () => {
    const out = darkFigure(figure)
    expect(out).toContain('<rect width="760" height="300" fill="none"/>')
    expect(out).toContain(`<text fill="${FG}">`)
  })

  it('both return null for an SVG that is not a book-style figure', () => {
    for (const svg of ['<svg><circle r="4"/></svg>', '<svg><rect width="100" height="300" fill="white"/></svg>', '<svg><g/><rect width="760" height="300" fill="white"/></svg>']) {
      expect(lightFigure(svg)).toBeNull()
      expect(darkFigure(svg)).toBeNull()
    }
  })
})
