/**
 * @fileoverview Device presets for responsive testing and rotation logic
 */

/**
 * Device presets for responsive testing and rotation logic
 *
 * Contains predefined device dimensions and names for various mobile,
 * tablet, and desktop configurations used in developer mode.
 *
 * @constant {object} devicePresets Object containing device dimensions and names
 * @property {object} iphone iPhone dimensions
 * @property {object} 'iphone-plus' iPhone Plus dimensions
 * @property {object} 'iphone-pro' iPhone Pro dimensions
 * @property {object} 'iphone-pro-max' iPhone Pro Max dimensions
 * @property {object} 'iphone-se' iPhone SE dimensions
 * @property {object} 'ipad-11' iPad 11-inch dimensions
 * @property {object} 'ipad-13' iPad 13-inch dimensions
 * @property {object} desktop1 800x600 desktop resolution
 * @property {object} desktop2 1024x768 desktop resolution
 * @property {object} desktop3 1280x1024 desktop resolution
 * @property {object} desktop4 1440x900 desktop resolution
 * @property {object} desktop5 1600x1200 desktop resolution
 * @property {object} desktop16 1920x1080 desktop resolution
 */
export const devicePresets = {
  'iphone': { width: 393, height: 852, name: 'iPhone' },
  'iphone-plus': { width: 430, height: 932, name: 'iPhone Plus' },
  'iphone-pro': { width: 402, height: 874, name: 'iPhone Pro' },
  'iphone-pro-max': { width: 440, height: 956, name: 'iPhone Pro Max' },
  'iphone-se': { width: 375, height: 667, name: 'iPhone SE' },
  'ipad-11': { width: 1180, height: 820, name: 'iPad 11-inch' },
  'ipad-13': { width: 1366, height: 1024, name: 'iPad 13-inch' },
  'desktop1': { width: 800, height: 600, name: '800x600' },
  'desktop2': { width: 1024, height: 768, name: '1024x768' },
  'desktop3': { width: 1280, height: 1024, name: '1280x1024' },
  'desktop4': { width: 1440, height: 900, name: '1440x900' },
  'desktop5': { width: 1600, height: 1200, name: '1600x1200' },
  'desktop16': { width: 1920, height: 1080, name: '1920x1080' },
}
