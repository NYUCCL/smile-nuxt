/**
 * @fileoverview Timeline.js: the cases Timeline.test.js doesn't reach.
 * Default paths, duplicates in the sequence, nodes registered for later use
 * (registerRandomizedNode, registerConditionalNode), a stored randomized
 * option that the design no longer offers, a predecessor set in the design
 * file, and looking a view up by path.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Timeline from '../../../src/runtime/core/timeline/Timeline.js'

const Mock = { template: '<div/>' }

function createApi() {
  return {
    log: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), log: vi.fn() },
    store: {
      getRandomizedRouteByName: vi.fn().mockReturnValue(null),
      setRandomizedRoute: vi.fn(),
      localState: { seqtimeline: [], routes: [] },
    },
    sampleWithReplacement: vi.fn(options => [options[0]]),
    getConditionByName: vi.fn(),
    randomAssignCondition: vi.fn(),
  }
}

describe('Timeline: more cases', () => {
  let api, timeline
  const names = () => timeline.seqtimeline.map(r => r.name)
  const welcome = () => timeline.pushSeqView({ path: '/welcome', name: 'welcome_anonymous', component: Mock })

  beforeEach(() => {
    api = createApi()
    timeline = new Timeline(api)
  })

  describe('a new timeline', () => {
    it('has the landing route at /, which redirects to the welcome view and needs no consent', () => {
      expect(timeline.routes).toHaveLength(1)
      expect(timeline.routes[0]).toMatchObject({ path: '/', name: 'landing', redirect: { name: 'welcome_anonymous' } })
      expect(timeline.routes[0].meta.requiresConsent).toBe(false)
      expect(timeline.routes[0].meta.sequential).toBe(false)
      expect(timeline.seqtimeline).toEqual([])
    })
  })

  describe('default path', () => {
    it('is made from the name: lower case, spaces as underscores, URL-encoded', () => {
      expect(timeline.cloneRouteAndFillDefaults({ name: 'My Task' }).path).toBe('/my_task')
      expect(timeline.cloneRouteAndFillDefaults({ name: 'été 1' }).path).toBe('/%C3%A9t%C3%A9_1')
    })

    it('a path that is given is kept', () => {
      expect(timeline.cloneRouteAndFillDefaults({ name: 'x', path: '/custom' }).path).toBe('/custom')
    })

    it('does not change the object it was given', () => {
      const config = { name: 'Task', meta: { a: 1 } }
      const clone = timeline.cloneRouteAndFillDefaults(config)
      clone.meta.a = 2
      expect(config).toEqual({ name: 'Task', meta: { a: 1 } })
    })
  })

  describe('defaults of a view', () => {
    it('a sequential view requires consent and neither done nor withdraw, unless it says otherwise', () => {
      timeline.pushSeqView({ name: 'a', component: Mock })
      timeline.pushSeqView({ name: 'b', component: Mock, meta: { requiresConsent: false, requiresDone: true, requiresWithdraw: true } })
      expect(timeline.seqtimeline[0].meta).toMatchObject({ requiresConsent: true, requiresDone: false, requiresWithdraw: false, sequential: true, type: 'route', level: 0 })
      expect(timeline.seqtimeline[1].meta).toMatchObject({ requiresConsent: false, requiresDone: true, requiresWithdraw: true })
    })

    it('a registered view gets the same defaults and is not sequential', () => {
      timeline.registerView({ name: 'a', component: Mock })
      timeline.registerView({ name: 'b', component: Mock, meta: { requiresDone: true } })
      expect(timeline.getRouteByName('a').meta).toMatchObject({ requiresConsent: true, requiresDone: false, requiresWithdraw: false, sequential: false, prev: null, next: null })
      expect(timeline.getRouteByName('b').meta).toMatchObject({ requiresConsent: true, requiresDone: true, sequential: false })
      expect(timeline.seqtimeline).toEqual([])
    })

    it('a registered view named welcome_anonymous counts as the welcome view', () => {
      timeline.registerView({ path: '/welcome', name: 'welcome_anonymous', component: Mock })
      expect(() => timeline.build()).not.toThrow()
    })
  })

  describe('build', () => {
    it('throws when the design has no welcome_anonymous view', () => {
      timeline.pushSeqView({ name: 'task', component: Mock })
      expect(() => timeline.build()).toThrow('NoWelcomeAnonymousRouteError')
      expect(api.log.error).toHaveBeenCalledWith(expect.stringContaining('No welcome_anonymous route defined'))
    })

    it('gives the store the sequence and the routes', () => {
      welcome()
      timeline.build()
      expect(api.store.localState.seqtimeline).toBe(timeline.seqtimeline)
      expect(api.store.localState.routes).toBe(timeline.routes)
    })

    it('keeps a predecessor set in the design file', () => {
      welcome()
      timeline.pushSeqView({ name: 'a', component: Mock })
      timeline.pushSeqView({ name: 'b', component: Mock, meta: { prev: 'welcome_anonymous' } })
      timeline.pushSeqView({ name: 'c', component: Mock })
      timeline.build()
      expect(timeline.getRouteByName('b').meta.prev).toBe('welcome_anonymous')
      // the views around it are linked as usual
      expect(timeline.getRouteByName('a').meta.prev).toBe('welcome_anonymous')
      expect(timeline.getRouteByName('c').meta.prev).toBe('b')
      expect(timeline.getRouteByName('b').meta.next).toBe('c')
    })

    it('a view marked as root has no predecessor', () => {
      welcome()
      timeline.pushSeqView({ name: 'a', component: Mock, meta: { root: true } })
      timeline.build()
      expect(timeline.getRouteByName('a').meta.prev).toBeNull()
      expect(timeline.getRouteByName('welcome_anonymous').meta.next).toBe('a')
    })
  })

  describe('duplicates in the sequence', () => {
    it('pushToTimeline refuses a second route with the same name', () => {
      timeline.pushToTimeline({ name: 'a', path: '/a' })
      expect(() => timeline.pushToTimeline({ name: 'a', path: '/other' })).toThrow('DuplicateNameError:a')
      expect(api.log.error).toHaveBeenCalledWith(expect.stringContaining('DuplicateNameError:a'))
      expect(timeline.seqtimeline).toHaveLength(1)
    })

    it('pushToTimeline refuses a second route with the same path', () => {
      timeline.pushToTimeline({ name: 'a', path: '/a' })
      expect(() => timeline.pushToTimeline({ name: 'b', path: '/a' })).toThrow(/DuplicatePathError/)
      expect(timeline.seqtimeline).toHaveLength(1)
    })

    it('a view listed twice in a randomized option is refused', () => {
      welcome()
      timeline.registerView({ name: 'a', component: Mock })
      expect(() => timeline.pushRandomizedNode({ name: 'r', options: [['a', 'a']] })).toThrow('DuplicateNameError:a')
    })

    it('pushSeqView logs and rethrows when the sequence refuses the view', () => {
      vi.spyOn(timeline, 'pushToTimeline').mockImplementation(() => {
        throw new Error('DuplicateNameError:x')
      })
      expect(() => timeline.pushSeqView({ name: 'x', component: Mock })).toThrow('DuplicateNameError:x')
      expect(api.log.error).toHaveBeenCalledWith('Smile FATAL ERROR: ', expect.any(Error))
    })
  })

  describe('randomized nodes', () => {
    beforeEach(() => {
      welcome()
      for (const name of ['a', 'b', 'c']) timeline.registerView({ name, component: Mock })
    })

    it('draws again when the stored option is not one the design offers any more', () => {
      api.store.getRandomizedRouteByName.mockReturnValue(['a', 'removed'])
      timeline.pushRandomizedNode({ name: 'order', options: [['b', 'a'], ['a', 'b']] })
      expect(api.sampleWithReplacement).toHaveBeenCalled()
      expect(api.store.setRandomizedRoute).toHaveBeenLastCalledWith('order', ['b', 'a'])
      expect(names()).toEqual(['welcome_anonymous', 'b', 'a'])
    })

    it('draws again when the stored option has a different length', () => {
      api.store.getRandomizedRouteByName.mockReturnValue(['a'])
      timeline.pushRandomizedNode({ name: 'order', options: [['a', 'b']] })
      expect(api.store.setRandomizedRoute).toHaveBeenLastCalledWith('order', ['a', 'b'])
    })

    it('keeps the stored option when the design still offers it, and does not draw', () => {
      api.store.getRandomizedRouteByName.mockReturnValue(['b', 'a'])
      timeline.pushRandomizedNode({ name: 'order', options: [['a', 'b'], ['b', 'a']] })
      expect(api.sampleWithReplacement).not.toHaveBeenCalled()
      expect(api.store.setRandomizedRoute).not.toHaveBeenCalled()
      expect(names()).toEqual(['welcome_anonymous', 'b', 'a'])
    })

    it('passes the weights to the draw', () => {
      timeline.pushRandomizedNode({ name: 'order', options: [['a'], ['b']], weights: [1, 3] })
      expect(api.sampleWithReplacement).toHaveBeenCalledWith([['a'], ['b']], 1, [1, 3])
    })

    it('marks the views it places with the node\'s name and level 1, and keeps their other meta', () => {
      timeline.registerView({ name: 'd', component: Mock, meta: { requiresConsent: false } })
      timeline.pushRandomizedNode({ name: 'order', options: [['d']] })
      expect(timeline.getRouteByName('d').meta).toMatchObject({ parentRandomizer: 'order', level: 1, sequential: true, requiresConsent: false })
    })

    it('a registered node is not placed until a node that names it is pushed', () => {
      timeline.registerRandomizedNode({ name: 'inner', options: [['a', 'b']] })
      expect(names()).toEqual(['welcome_anonymous'])
      expect(timeline.registered.inner.map(r => r.name)).toEqual(['a', 'b'])

      timeline.pushRandomizedNode({ name: 'outer', options: [['c', 'inner']] })
      expect(names()).toEqual(['welcome_anonymous', 'c', 'a', 'b'])
      expect('inner' in timeline.registered).toBe(false)
      // one level deeper than a view placed directly by the outer node
      expect(timeline.getRouteByName('a').meta.level).toBe(2)
      expect(timeline.getRouteByName('c').meta.level).toBe(1)
    })

    it('registering the same node twice keeps the first', () => {
      timeline.registerRandomizedNode({ name: 'inner', options: [['a']] })
      timeline.registerRandomizedNode({ name: 'inner', options: [['b']] })
      expect(timeline.registered.inner.map(r => r.name)).toEqual(['a'])
      expect(api.log.debug).toHaveBeenCalledWith('Randomized node inner already registered')
    })

    it('a registered node can hold another registered node', () => {
      timeline.registerRandomizedNode({ name: 'inner', options: [['a']] })
      timeline.registerRandomizedNode({ name: 'middle', options: [['inner', 'b']] })
      expect(timeline.registered.middle.map(r => r.name)).toEqual(['a', 'b'])
      timeline.pushRandomizedNode({ name: 'outer', options: [['middle']] })
      expect(names()).toEqual(['welcome_anonymous', 'a', 'b'])
    })

    it('throws for an option that is neither a view nor a registered node', () => {
      expect(() => timeline.pushRandomizedNode({ name: 'order', options: [['nope']] })).toThrow('RandomizedNodeOptionNotFoundError')
    })
  })

  describe('conditional nodes', () => {
    beforeEach(() => {
      welcome()
      for (const name of ['a', 'b']) timeline.registerView({ name, component: Mock })
      api.getConditionByName.mockReturnValue('BA')
    })

    it('a registered conditional node is placed when a randomized node names it', () => {
      timeline.registerConditionalNode({ name: 'branch', order: { AB: ['a', 'b'], BA: ['b', 'a'] } })
      expect(names()).toEqual(['welcome_anonymous'])
      expect(timeline.registered.branch.map(r => r.name)).toEqual(['b', 'a'])
      timeline.pushRandomizedNode({ name: 'outer', options: [['branch']] })
      expect(names()).toEqual(['welcome_anonymous', 'b', 'a'])
    })

    it('registering the same conditional node twice keeps the first', () => {
      timeline.registerConditionalNode({ name: 'branch', order: { AB: ['a'], BA: ['b'] } })
      api.getConditionByName.mockReturnValue('AB')
      timeline.registerConditionalNode({ name: 'branch', order: { AB: ['a'], BA: ['b'] } })
      expect(timeline.registered.branch.map(r => r.name)).toEqual(['b'])
    })

    it('uses the condition the participant already has, without assigning one', () => {
      timeline.pushConditionalNode({ name: 'branch', order: { AB: ['a', 'b'], BA: ['b', 'a'] } })
      expect(api.getConditionByName).toHaveBeenCalledWith('order')
      expect(api.randomAssignCondition).not.toHaveBeenCalled()
      expect(api.log.warn).not.toHaveBeenCalled()
      expect(names()).toEqual(['welcome_anonymous', 'b', 'a'])
    })
  })

  describe('looking a view up', () => {
    beforeEach(() => {
      welcome()
      timeline.registerView({ path: '/welcome/:service', name: 'welcome_referred', component: Mock, props: { a: 1 } })
      timeline.registerView({ path: '/a/:x/b/:y', name: 'two_params', component: Mock })
    })

    it('getRouteByName returns the route, or null', () => {
      expect(timeline.getRouteByName('welcome_anonymous').path).toBe('/welcome')
      expect(timeline.getRouteByName('missing')).toBeNull()
    })

    it('getViewForPath ignores a trailing slash, and treats an empty path as /', () => {
      expect(timeline.getViewForPath('/welcome/').name).toBe('welcome_anonymous')
      expect(timeline.getViewForPath('').name).toBe('landing')
      expect(timeline.getViewForPath('/').name).toBe('landing')
    })

    it('getViewForPath passes on the files a view lists to preload (#30)', () => {
      const list = api => [`stimuli/${api.conditions.set}/*.png`]
      timeline.pushSeqView({ name: 'media', component: 'ExpView', preload: ['a.png', 'clips/*.mp4'] })
      timeline.registerView({ name: 'by_condition', component: 'ExpView', preload: list })
      expect(timeline.getViewForPath('/media').preload).toEqual(['a.png', 'clips/*.mp4'])
      expect(timeline.getViewForPath('/by_condition').preload).toBe(list)
      expect(timeline.getViewForPath('/welcome').preload).toBeUndefined()
    })

    it('getViewForPath gives a redirect for the landing route', () => {
      expect(timeline.getViewForPath('/')).toEqual({
        redirect: { name: 'welcome_anonymous' },
        meta: timeline.routes[0].meta,
        name: 'landing',
      })
    })

    it('getViewForPath gives the component, props, meta and name of a view', () => {
      const view = timeline.getViewForPath('/welcome/prolific')
      expect(view.name).toBe('welcome_referred')
      expect(view.component).toBeDefined()
      expect(view.props).toEqual({ a: 1 })
      expect(view.meta.sequential).toBe(false)
      // props default to an empty object
      expect(timeline.getViewForPath('/welcome').props).toEqual({})
    })

    it('getViewForPath matches a parameter to one path segment only', () => {
      expect(timeline.getViewForPath('/a/1/b/2').name).toBe('two_params')
      expect(timeline.getViewForPath('/welcome/prolific/extra')).toBeNull()
      expect(timeline.getViewForPath('/welcome/')?.name).toBe('welcome_anonymous')
      expect(timeline.getViewForPath('/a/1/b')).toBeNull()
      expect(timeline.getViewForPath('/nowhere')).toBeNull()
    })
  })
})
