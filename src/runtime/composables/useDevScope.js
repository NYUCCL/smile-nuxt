/**
 * Dev tools scope for portaled UI.
 *
 * Popovers, selects, dropdown menus, tooltips and sheets render at the end of
 * <body> (reka-ui portals), outside the dev tools' `.sd-root` elements, so
 * they'd fall back to the participant theme's colors. The dev tools mark their
 * part of the component tree (DevScope.vue / provideDevScope), and the ui
 * components' portaled content adds `sd-root` when opened from inside it.
 * Provide/inject follows the component tree, so it crosses the portal.
 *
 * The experiment preview isn't marked: a participant view's select keeps the
 * participant theme.
 */
import { inject, provide } from 'vue'

export const DEV_SCOPE = Symbol('smile-dev-scope')

/** Mark this component's subtree as dev tools UI. */
export function provideDevScope(value = true) {
  provide(DEV_SCOPE, value)
}

/** 'sd-root' inside the dev tools, '' elsewhere: for portaled content. */
export function useDevScopeClass() {
  return inject(DEV_SCOPE, false) ? 'sd-root' : ''
}
