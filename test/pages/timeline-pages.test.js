/**
 * @fileoverview The three catch-all pages (participant, /dev/, /presentation/):
 * which view they show for an address, what they show for an unknown one,
 * and where a redirect entry of the timeline sends the browser.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { useRoute, useNuxtApp, navigateTo } from '#imports'
import ParticipantPage from '../../src/runtime/pages/[...slug].vue'
import DevPage from '../../src/runtime/pages/dev/[...slug].vue'
import PresentationPage from '../../src/runtime/pages/presentation/[...slug].vue'
import { createStore, mountComponent } from '../components/mount'
import { NuxtLayout, marker, stub } from './stubs'
import { _resetPreload } from '../../src/runtime/composables/usePreload.js'

vi.mock('../../src/runtime/components/dev/RecruitmentChooserView.vue', async () => (await import('./stubs')).markerModule('recruitment-chooser'))
vi.mock('../../src/runtime/components/builtins/PresentationModeView.vue', async () => (await import('./stubs')).markerModule('presentation-home', ['title']))

// A view of the study: shows its name and the props the timeline gave it
const TaskView = defineComponent({
  props: { label: { type: String, default: 'none' } },
  render() {
    return h('div', { id: 'task-view' }, `task:${this.label}`)
  },
})
const OtherView = defineComponent({ render: () => h('div', { id: 'other-view' }, 'other') })

const VIEWS = {
  '/task': { name: 'task', component: TaskView, props: { label: 'A' } },
  '/other': { name: 'other', component: OtherView },
  '/': { name: 'index', redirect: { name: 'task' } },
  '/old': { name: 'old', redirect: { path: '/other' } },
  '/lost': { name: 'lost', redirect: { name: 'missing' } },
  '/empty': { name: 'empty' },
  // A view that lists files to have in memory before it shows (#30)
  '/media': { name: 'media', component: OtherView, preload: ['clip.mp4'] },
}

let route
let timeline

/**
 * Mounts a page at an address.
 * @param {object} page - The page component
 * @param {string} path - The address
 * @param {object} [options] - What to start from
 * @param {boolean} [options.timeline] - false for an app with no timeline
 * @param {(store: object) => void} [options.setup] - Sets the store's state
 * @returns {Promise<object>} The wrapper, after the page has mounted
 */
async function mountPage(page, path, { timeline: withTimeline = true, setup } = {}) {
  route = reactive({ path, name: 'slug', query: {}, params: {} })
  vi.mocked(useRoute).mockReturnValue(route)
  vi.mocked(useNuxtApp).mockReturnValue({ $timeline: withTimeline ? timeline : undefined })
  const { pinia } = createStore(setup)
  const wrapper = mountComponent(page, {
    pinia,
    stubs: { NuxtLayout, ExperimentStatusBar: marker('status-bar') },
  })
  await nextTick()
  return wrapper
}

beforeEach(() => {
  vi.mocked(navigateTo).mockClear()
  timeline = {
    routes: Object.entries(VIEWS).map(([path, view]) => ({ path, name: view.name })),
    getViewForPath: vi.fn(path => VIEWS[path] ?? null),
  }
})

describe('the participant page', () => {
  it('uses the experiment layout', async () => {
    const wrapper = await mountPage(ParticipantPage, '/task')
    expect(wrapper.find('[data-layout]').attributes('data-layout')).toBe('experiment')
  })

  it('shows the view the timeline has for the address, with its props', async () => {
    const wrapper = await mountPage(ParticipantPage, '/task')
    expect(timeline.getViewForPath).toHaveBeenCalledWith('/task')
    expect(wrapper.find('#task-view').text()).toBe('task:A')
  })

  it('shows the next view when the address changes', async () => {
    const wrapper = await mountPage(ParticipantPage, '/task')
    route.path = '/other'
    await nextTick()
    expect(wrapper.find('#task-view').exists()).toBe(false)
    expect(wrapper.find('#other-view').exists()).toBe(true)
  })

  it('says the page was not found for an address with no view', async () => {
    const wrapper = await mountPage(ParticipantPage, '/nowhere')
    expect(wrapper.find('h1').text()).toBe('Page not found')
    expect(wrapper.text()).toContain('No view registered for path: /nowhere')
  })

  it('shows nothing, and no error, when there is no timeline', async () => {
    const wrapper = await mountPage(ParticipantPage, '/task', { timeline: false })
    expect(wrapper.find('[data-layout]').text()).toBe('')
  })

  it('shows nothing for a timeline entry with no component', async () => {
    const wrapper = await mountPage(ParticipantPage, '/empty')
    expect(wrapper.find('[data-layout]').text()).toBe('')
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('a redirect by name goes to that view\'s address', async () => {
    await mountPage(ParticipantPage, '/')
    expect(navigateTo).toHaveBeenCalledTimes(1)
    expect(navigateTo).toHaveBeenCalledWith('/task')
  })

  it('a redirect by address goes to that address', async () => {
    await mountPage(ParticipantPage, '/old')
    expect(navigateTo).toHaveBeenCalledWith('/other')
  })

  it('a redirect to a name the timeline does not have goes nowhere', async () => {
    await mountPage(ParticipantPage, '/lost')
    expect(navigateTo).not.toHaveBeenCalled()
  })
})

describe('the dev page', () => {
  it('uses the development layout', async () => {
    const wrapper = await mountPage(DevPage, '/dev/task')
    expect(wrapper.find('[data-layout]').attributes('data-layout')).toBe('development')
  })

  it.each(['/dev', '/dev/'])('shows the recruitment chooser at %s and looks up no view', async (path) => {
    const wrapper = await mountPage(DevPage, path)
    expect(stub(wrapper, 'recruitment-chooser').exists()).toBe(true)
    expect(stub(wrapper, 'status-bar').exists()).toBe(false)
    expect(timeline.getViewForPath).not.toHaveBeenCalled()
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('shows the view for the address without /dev, under the status bar', async () => {
    const wrapper = await mountPage(DevPage, '/dev/task')
    expect(timeline.getViewForPath).toHaveBeenCalledWith('/task')
    expect(wrapper.find('#task-view').text()).toBe('task:A')
    expect(stub(wrapper, 'status-bar').exists()).toBe(true)
    expect(stub(wrapper, 'recruitment-chooser').exists()).toBe(false)
  })

  it('says the page was not found, naming the address without /dev', async () => {
    const wrapper = await mountPage(DevPage, '/dev/nowhere')
    expect(wrapper.find('h1').text()).toBe('Page not found')
    expect(wrapper.text()).toContain('No view registered for path: /nowhere')
  })

  it('shows nothing when there is no timeline', async () => {
    const wrapper = await mountPage(DevPage, '/dev/task', { timeline: false })
    expect(wrapper.find('[data-layout]').text()).toBe('')
  })

  it('a redirect by name stays in dev mode', async () => {
    VIEWS['/start'] = { name: 'start', redirect: { name: 'task' } }
    try {
      await mountPage(DevPage, '/dev/start')
      expect(navigateTo).toHaveBeenCalledWith('/dev/task')
    }
    finally {
      delete VIEWS['/start']
    }
  })

  it('a redirect by address stays in dev mode', async () => {
    await mountPage(DevPage, '/dev/old')
    expect(navigateTo).toHaveBeenCalledWith('/dev/other')
  })

  it('a redirect to a name the timeline does not have goes nowhere', async () => {
    await mountPage(DevPage, '/dev/lost')
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('going from a view back to /dev/ shows the chooser again', async () => {
    const wrapper = await mountPage(DevPage, '/dev/task')
    route.path = '/dev/'
    await nextTick()
    expect(wrapper.find('#task-view').exists()).toBe(false)
    expect(stub(wrapper, 'recruitment-chooser').exists()).toBe(true)
  })
})

describe('the presentation page', () => {
  it('uses the presentation layout', async () => {
    const wrapper = await mountPage(PresentationPage, '/presentation/task')
    expect(wrapper.find('[data-layout]').attributes('data-layout')).toBe('presentation')
  })

  it.each(['/presentation', '/presentation/'])('shows the built-in home page at %s', async (path) => {
    const wrapper = await mountPage(PresentationPage, path)
    expect(stub(wrapper, 'presentation-home').exists()).toBe(true)
    expect(stub(wrapper, 'presentation-home').attributes('data-title')).toBeUndefined()
  })

  it('gives the home page the props the study registered', async () => {
    const wrapper = await mountPage(PresentationPage, '/presentation/', {
      setup: (s) => {
        s.config = { ...s.config, global_app_components: { presentation_home_props: { title: 'My study' } } }
      },
    })
    expect(stub(wrapper, 'presentation-home').attributes('data-title')).toBe('My study')
  })

  it('shows the study\'s own home page when it registered one', async () => {
    const wrapper = await mountPage(PresentationPage, '/presentation/', {
      setup: (s) => {
        s.config = { ...s.config, global_app_components: { presentation_home: marker('own-home') } }
      },
    })
    expect(stub(wrapper, 'own-home').exists()).toBe(true)
    expect(stub(wrapper, 'presentation-home').exists()).toBe(false)
  })

  it('does not follow the redirect the timeline has for the root address', async () => {
    const wrapper = await mountPage(PresentationPage, '/presentation/')
    expect(navigateTo).not.toHaveBeenCalled()
    expect(stub(wrapper, 'presentation-home').exists()).toBe(true)
  })

  it('shows the view for the address without /presentation', async () => {
    const wrapper = await mountPage(PresentationPage, '/presentation/task')
    expect(timeline.getViewForPath).toHaveBeenCalledWith('/task')
    expect(wrapper.find('#task-view').text()).toBe('task:A')
    expect(stub(wrapper, 'presentation-home').exists()).toBe(false)
  })

  it('says the page was not found, naming the address without /presentation', async () => {
    const wrapper = await mountPage(PresentationPage, '/presentation/nowhere')
    expect(wrapper.find('h1').text()).toBe('Page not found')
    expect(wrapper.text()).toContain('No view registered for path: /nowhere')
  })

  it('shows nothing when there is no timeline', async () => {
    const wrapper = await mountPage(PresentationPage, '/presentation/task', { timeline: false })
    expect(wrapper.find('[data-layout]').text()).toBe('')
  })

  it('a redirect by address stays in presentation mode', async () => {
    await mountPage(PresentationPage, '/presentation/old')
    expect(navigateTo).toHaveBeenCalledWith('/presentation/other')
  })

  it('a redirect by name stays in presentation mode', async () => {
    VIEWS['/start'] = { name: 'start', redirect: { name: 'task' } }
    try {
      await mountPage(PresentationPage, '/presentation/start')
      expect(navigateTo).toHaveBeenCalledWith('/presentation/task')
    }
    finally {
      delete VIEWS['/start']
    }
  })

  it('a redirect to a name the timeline does not have goes nowhere', async () => {
    await mountPage(PresentationPage, '/presentation/lost')
    expect(navigateTo).not.toHaveBeenCalled()
  })
})

describe.each([
  ['participant', ParticipantPage, ''],
  ['dev', DevPage, '/dev'],
  ['presentation', PresentationPage, '/presentation'],
])('a view that lists files to preload, on the %s page (#30)', (_name, page, prefix) => {
  let finish
  let inMemory

  beforeEach(() => {
    inMemory = false
    _resetPreload({
      preloader: {
        report: () => ({ ok: inMemory }),
        progress: urls => ({ total: urls.length, ready: 0, failed: 0, fraction: 0 }),
        loadAll: vi.fn(() => new Promise((resolve) => {
          finish = ok => resolve({ ok, total: 1, ready: ok ? 1 : 0, bytes: 0, ms: 10, failed: ok ? [] : [{ url: '/test/clip.mp4', error: 'the server answered 404' }] })
        })),
      },
    })
  })
  afterEach(() => _resetPreload())

  it('is not shown while its files load, and is shown when they are in memory', async () => {
    const wrapper = await mountPage(page, `${prefix}/media`)
    expect(wrapper.find('#other-view').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'PreloadingView' }).props('gate')).toMatchObject({ status: 'loading', view: 'media', urls: ['/test/clip.mp4'] })
    finish(true)
    await flushPromises()
    expect(wrapper.find('#other-view').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'PreloadingView' }).exists()).toBe(false)
  })

  it('stays closed when a file could not be loaded', async () => {
    const wrapper = await mountPage(page, `${prefix}/media`)
    finish(false)
    await flushPromises()
    expect(wrapper.find('#other-view').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'PreloadingView' }).props('gate').status).toBe('failed')
  })

  it('is shown at once when its files are already in memory', async () => {
    inMemory = true
    const wrapper = await mountPage(page, `${prefix}/media`)
    expect(wrapper.find('#other-view').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'PreloadingView' }).exists()).toBe(false)
  })

  it('going from a view with no files to it never draws it early', async () => {
    const wrapper = await mountPage(page, `${prefix}/task`)
    expect(wrapper.find('#task-view').exists()).toBe(true)
    route.path = `${prefix}/media`
    await nextTick()
    expect(wrapper.find('#task-view').exists()).toBe(false)
    expect(wrapper.find('#other-view').exists()).toBe(false)
    finish(true)
    await flushPromises()
    expect(wrapper.find('#other-view').exists()).toBe(true)
  })
})
