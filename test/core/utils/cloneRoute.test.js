import { describe, it, expect } from 'vitest'
import { defineComponent, h } from 'vue'
import { cloneRoute } from '../../../src/runtime/utils/cloneRoute.js'

describe('cloneRoute', () => {
  it('copies nested meta, so changing the copy leaves the original alone', () => {
    const route = { name: 'task', meta: { next: 'thanks', allowAlways: false, nested: { level: 1 } } }
    const copy = cloneRoute(route)

    expect(copy).toEqual(route)
    expect(copy).not.toBe(route)
    expect(copy.meta).not.toBe(route.meta)
    expect(copy.meta.nested).not.toBe(route.meta.nested)

    copy.path = '/task'
    copy.meta.sequential = true
    copy.meta.nested.level = 2
    expect(route).toEqual({ name: 'task', meta: { next: 'thanks', allowAlways: false, nested: { level: 1 } } })
  })

  it('copies arrays at every depth', () => {
    const route = { name: 'rand', options: [['a', 'b'], [{ name: 'c', meta: { x: 1 } }]], weights: [1, 2] }
    const copy = cloneRoute(route)

    expect(copy).toEqual(route)
    expect(Array.isArray(copy.options)).toBe(true)
    expect(copy.options).not.toBe(route.options)
    expect(copy.options[0]).not.toBe(route.options[0])
    expect(copy.options[1][0]).not.toBe(route.options[1][0])
    expect(copy.options[1][0].meta).not.toBe(route.options[1][0].meta)

    copy.options[0].push('z')
    copy.weights[0] = 9
    expect(route.options[0]).toEqual(['a', 'b'])
    expect(route.weights).toEqual([1, 2])
  })

  it('keeps functions by reference', () => {
    const loader = () => Promise.resolve({})
    const beforeEnter = () => true
    const route = { name: 'lazy', component: loader, beforeEnter, meta: { check: beforeEnter }, list: [loader] }
    const copy = cloneRoute(route)

    expect(copy.component).toBe(loader)
    expect(copy.beforeEnter).toBe(beforeEnter)
    expect(copy.meta.check).toBe(beforeEnter)
    expect(copy.list[0]).toBe(loader)
  })

  it('copies a component written as an options object and shares its functions', () => {
    const Component = defineComponent({ name: 'Mock', props: { label: String }, render: () => h('div') })
    const route = { name: 'view', component: Component }
    const copy = cloneRoute(route)

    expect(copy.component).toEqual(Component)
    expect(copy.component.render).toBe(Component.render)
    expect(copy.component.props.label).toBe(String)
  })

  it('keeps a functional component and a class instance by reference', () => {
    const Functional = () => h('div')
    class Thing {
      constructor() {
        this.inner = { a: 1 }
      }
    }
    const thing = new Thing()
    const when = new Date(0)
    const map = new Map([['a', { b: 1 }]])
    const copy = cloneRoute({ component: Functional, meta: { thing, when, map } })

    expect(copy.component).toBe(Functional)
    expect(copy.meta.thing).toBe(thing)
    expect(copy.meta.when).toBe(when)
    expect(copy.meta.map).toBe(map)
  })

  it('keeps primitives, null and undefined values', () => {
    const route = { name: 'a', path: null, redirect: undefined, meta: { n: 0, s: '', b: false, x: null, u: undefined } }
    const copy = cloneRoute(route)

    expect(copy).toStrictEqual(route)
    expect('redirect' in copy).toBe(true)
    expect('u' in copy.meta).toBe(true)
    expect(cloneRoute('text')).toBe('text')
    expect(cloneRoute(undefined)).toBe(undefined)
    expect(cloneRoute(null)).toBe(null)
  })

  it('copies symbol keys and objects without a prototype', () => {
    const key = Symbol('key')
    const bare = Object.assign(Object.create(null), { a: { b: 1 } })
    const copy = cloneRoute({ [key]: { v: 1 }, bare })

    expect(copy[key]).toEqual({ v: 1 })
    expect(copy.bare.a).toEqual({ b: 1 })
    expect(copy.bare.a).not.toBe(bare.a)
  })

  it('copies an object that is reached twice once, and follows a cycle', () => {
    const shared = { n: 1 }
    const route = { a: shared, b: shared }
    route.self = route
    const copy = cloneRoute(route)

    expect(copy.a).not.toBe(shared)
    expect(copy.a).toBe(copy.b)
    expect(copy.self).toBe(copy)
  })
})
