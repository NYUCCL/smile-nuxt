/**
 * @fileoverview Small helpers used by the layout and sidebar components.
 */
import { describe, it, expect } from 'vitest'
import { getResponsiveWidthClasses } from '../../../src/runtime/components/layouts/layoutUtils.js'
import * as sidebar from '../../../src/runtime/components/ui/sidebar/utils.js'

describe('getResponsiveWidthClasses', () => {
  it('is full width until the container is wide, then the width asked for', () => {
    expect(getResponsiveWidthClasses('w-1/2')).toBe('w-full @xl:w-1/2')
    expect(getResponsiveWidthClasses('w-11/12')).toBe('w-full @xl:w-11/12')
  })

  it('covers every width the layouts offer', () => {
    const widths = ['w-1/12', 'w-1/6', 'w-1/4', 'w-1/3', 'w-2/5', 'w-1/2', 'w-3/5', 'w-2/3', 'w-3/4', 'w-4/5', 'w-5/6', 'w-11/12']
    for (const width of widths) {
      expect(getResponsiveWidthClasses(width)).toBe(`w-full @xl:${width}`)
    }
  })

  it('falls back to one third for a width it does not know, or none', () => {
    expect(getResponsiveWidthClasses('w-7/9')).toBe('w-full @xl:w-1/3')
    expect(getResponsiveWidthClasses(undefined)).toBe('w-full @xl:w-1/3')
  })

  it('with responsiveUI off, returns the width as given (any class), or one third', () => {
    expect(getResponsiveWidthClasses('w-1/2', false)).toBe('w-1/2')
    expect(getResponsiveWidthClasses('w-7/9', false)).toBe('w-7/9')
    expect(getResponsiveWidthClasses(undefined, false)).toBe('w-1/3')
    expect(getResponsiveWidthClasses('', false)).toBe('w-1/3')
  })
})

describe('sidebar constants', () => {
  it('the cookie lasts a week', () => {
    expect(sidebar.SIDEBAR_COOKIE_NAME).toBe('sidebar_state')
    expect(sidebar.SIDEBAR_COOKIE_MAX_AGE).toBe(7 * 24 * 60 * 60)
  })

  it('exports the widths, the shortcut and the context pair', () => {
    expect(sidebar.SIDEBAR_WIDTH).toBe('16rem')
    expect(sidebar.SIDEBAR_WIDTH_MOBILE).toBe('18rem')
    expect(sidebar.SIDEBAR_WIDTH_ICON).toBe('3rem')
    expect(sidebar.SIDEBAR_KEYBOARD_SHORTCUT).toBe('b')
    expect(typeof sidebar.useSidebar).toBe('function')
    expect(typeof sidebar.provideSidebarContext).toBe('function')
  })
})
