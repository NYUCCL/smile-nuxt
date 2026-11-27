/**
 * Stand-ins for what Nuxt provides to pages and layouts (NuxtLayout,
 * ClientOnly), and for child components a test only needs to see the
 * presence of.
 */
import { defineComponent, h } from 'vue'

/** <NuxtLayout name="…">: a box that carries the layout's name and shows the page */
export const NuxtLayout = defineComponent({
  name: 'NuxtLayout',
  props: { name: { type: String, default: '' } },
  render() {
    return h('div', { 'data-layout': this.name }, this.$slots.default?.())
  },
})

/** <ClientOnly>: shows its content, as in the browser */
export const ClientOnly = defineComponent({
  name: 'ClientOnly',
  render() {
    return this.$slots.default?.()
  },
})

/**
 * A component that renders a box marked with a name, with its props as
 * attributes and its slot inside.
 * @param {string} name - The mark (`data-stub`)
 * @param {string[]} [props] - Props to accept and show as attributes
 * @returns {object} The component
 */
export function marker(name, props = []) {
  return defineComponent({
    name: `Stub-${name}`,
    // Boolean first, so a bare attribute (`<X inline />`) reads as true
    props: Object.fromEntries(props.map(p => [p, { type: [Boolean, String, Number], default: undefined }])),
    render() {
      const attrs = Object.fromEntries(props.filter(p => this[p] !== undefined).map(p => [`data-${p}`, String(this[p])]))
      return h('div', { 'data-stub': name, ...attrs }, this.$slots.default?.())
    },
  })
}

/**
 * The same, as a module with a default export, for vi.mock. (`__esModule`
 * lets defineAsyncComponent find the default export of a mocked module.)
 * @param {string} name - The mark
 * @param {string[]} [props] - Props to accept
 * @returns {{ default: object }} The module
 */
export const markerModule = (name, props) => ({ __esModule: true, default: marker(name, props) })

/**
 * Finds a marker.
 * @param {object} wrapper - The wrapper
 * @param {string} name - The mark
 * @returns {object} The DOM wrapper (check `.exists()`)
 */
export const stub = (wrapper, name) => wrapper.find(`[data-stub="${name}"]`)
