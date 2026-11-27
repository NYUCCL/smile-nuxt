/**
 * @fileoverview The dev side bar's Steps tab: the step tree (StepNode), the
 * data viewer (StepDataViewer) and the panel that holds them
 * (StepExplorerPanel), on a real view API and stepper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { h, nextTick } from 'vue'
import StepExplorerPanel from '../../src/runtime/components/dev/sidebar/StepExplorerPanel.vue'
import StepNode from '../../src/runtime/components/dev/sidebar/StepNode.vue'
import StepDataViewer from '../../src/runtime/components/dev/sidebar/StepDataViewer.vue'
import { moduleComponents, mountComponent, setupViewAPI } from '../components/mount'

describe('StepDataViewer', () => {
  let wrapper
  afterEach(() => wrapper?.unmount())

  const view = (data) => {
    wrapper = mountComponent(StepDataViewer, { props: { data } })
  }
  // The template has no spaces between a row's parts (CSS spaces them)
  const lines = () => wrapper.findAll('.node-content').map(n => n.text())

  it('shows each primitive of an object as key: value, strings in quotes', () => {
    view({ word: 'cat', n: 3, ok: false })
    expect(lines()).toEqual(['word:"cat"', 'n:3', 'ok:false'])
  })

  it.each([
    ['a string', 'hello', '"hello"'],
    ['a number', 42, '42'],
    ['null', null, 'null'],
  ])('shows %s on its own as its value', (_name, data, text) => {
    view(data)
    expect(wrapper.find('.data-node').exists()).toBe(false)
    expect(wrapper.text()).toBe(text)
  })

  it('shows a nested array and object closed, with a preview', () => {
    view({ list: [1, 2, 3], obj: { a: 1 }, nothing: null })
    expect(lines()).toEqual(['▶list:[3 items]', '▶obj:{...}', '▶nothing:{...}'])
    expect(wrapper.find('.nested-content').exists()).toBe(false)
  })

  it('a click opens a nested value and a second click closes it', async () => {
    view({ obj: { inner: 'x' }, list: [7] })
    await wrapper.findAll('.node-content')[0].trigger('click')
    expect(lines()).toEqual(['▼obj:', 'inner:"x"', '▶list:[1 items]'])
    await wrapper.findAll('.node-content')[0].trigger('click')
    expect(lines()).toEqual(['▶obj:{...}', '▶list:[1 items]'])
  })

  it('an open array lists its items by index', async () => {
    view({ list: ['a', 'b'] })
    await wrapper.find('.node-content').trigger('click')
    expect(lines()).toEqual(['▼list:', '0:"a"', '1:"b"'])
  })

  it('an open null shows null', async () => {
    view({ nothing: null })
    await wrapper.find('.node-content').trigger('click')
    expect(wrapper.find('.nested-content').text()).toBe('null')
  })
})

describe('StepNode', () => {
  let wrapper
  afterEach(() => wrapper?.unmount())

  const leaf = (path, more = {}) => ({ path, isLeaf: true, isFirstLeaf: false, rows: [], ...more })
  const TREE = {
    path: 'block',
    isLeaf: false,
    isFirstLeaf: false,
    rows: [leaf('block/0', { isFirstLeaf: true }), leaf('block/1')],
  }

  const mountNode = (props) => {
    wrapper = mountComponent(StepNode, {
      props: { index: 0, total: 1, isNodeSelected: () => false, formatData: () => '', ...props },
    })
  }
  const branches = () => wrapper.findAll('.tree-line').map(l => l.find('.vertical-lines').element.textContent + l.find('.tree-branch').element.textContent + l.find('.node-path').text())

  it('draws a block and its steps with branch characters', () => {
    mountNode({ state: TREE, index: 0, total: 2 })
    expect(branches()).toEqual(['┌─ block', '│ ├─ block/0', '│ └─ block/1'])
  })

  it('the last node of a list gets the closing branch and no line below it', () => {
    mountNode({ state: TREE, index: 1, total: 2 })
    expect(branches()).toEqual(['└─ block', '  ├─ block/0', '  └─ block/1'])
  })

  it('a middle node gets the joining branch', () => {
    mountNode({ state: leaf('1'), index: 1, total: 3 })
    expect(branches()).toEqual(['├─ 1'])
  })

  it('marks the first step with a flag, other steps with a leaf, and blocks with neither', () => {
    mountNode({ state: TREE })
    const [block, first, second] = wrapper.findAll('.node-path')
    expect(block.find('svg').exists()).toBe(false)
    expect(block.classes()).toContain('leaf-state')
    expect(first.find('svg').classes()).toContain('home-icon')
    expect(second.find('svg').exists()).toBe(true)
    expect(second.find('svg').classes()).not.toContain('home-icon')
    expect(second.classes()).not.toContain('leaf-state')
  })

  it('highlights the node the callback says is selected', () => {
    mountNode({ state: TREE, isNodeSelected: path => path === 'block/1' })
    expect(wrapper.findAll('.tree-line').map(l => l.classes().includes('node-selected'))).toEqual([false, false, true])
  })

  it('a click on a node emits node-click with its path, from any depth', async () => {
    mountNode({ state: TREE })
    await wrapper.findAll('.tree-line')[2].trigger('click')
    await wrapper.findAll('.tree-line')[0].trigger('click')
    expect(wrapper.emitted('node-click')).toEqual([['block/1'], ['block']])
  })

  it('does not draw children at the depth limit', () => {
    mountNode({ state: TREE, depth: 2, maxDepth: 2 })
    expect(wrapper.findAll('.tree-line')).toHaveLength(1)
  })
})

describe('StepExplorerPanel', () => {
  let wrapper
  let api

  /**
   * Mounts the panel on a new view API.
   * @param {(api: object) => void} [build] - Adds the view's steps
   */
  async function mountPanel(build) {
    let pinia;
    ({ pinia, api } = setupViewAPI('task'))
    if (build) build(api)
    // The dev layout wraps the side bar in a TooltipProvider
    const inProvider = { render: () => h(moduleComponents.TooltipProvider, null, { default: () => h(StepExplorerPanel) }) }
    wrapper = mountComponent(inProvider, { pinia, attachTo: document.body })
    await nextTick()
  }
  // Two blocks: the first with two trials, the second with one
  const nested = (a) => {
    a.steps.append([{ id: 'practice', phase: 'practice' }, { id: 'main', phase: 'main' }])
    a.steps[0].append([{ id: 'a', word: 'cat' }, { id: 'b', word: 'dog' }])
    a.steps[1].append([{ id: 'c', word: 'eel' }])
  }
  const paths = () => wrapper.findAll('.node-path').map(n => n.text())
  const selected = () => wrapper.findAll('.node-selected').map(n => n.find('.node-path').text())
  const toolbar = () => wrapper.find('.path-display-container').findAll('button')
  const dataLines = container => wrapper.find(container).findAll('.node-content').map(n => n.text())

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  // A stepper without steps counts its root as one step (StepState.leafNodes),
  // so the panel's "No steps defined" text is never shown.
  it('a view without steps has an empty tree and the step buttons disabled', async () => {
    await mountPanel()
    expect(paths()).toEqual([])
    expect(wrapper.find('.index-display').text().replace(/\s+/g, ' ')).toBe('0/1 (/0)')
    expect(toolbar().map(b => b.attributes('disabled'))).toEqual(['', '', '', ''])
  })

  it('lists the blocks and their steps as a tree, with the current step selected', async () => {
    await mountPanel(nested)
    expect(paths()).toEqual(['practice', 'practice/a', 'practice/b', 'main', 'main/c'])
    expect(selected()).toEqual(['practice/a'])
    expect(wrapper.find('.path-display').text()).toBe('practice/a')
    expect(wrapper.find('.index-display').text().replace(/\s+/g, ' ')).toBe('0/3 (0/2)')
  })

  it('shows the current step\'s data merged with its block\'s', async () => {
    await mountPanel(nested)
    expect(dataLines('.data-display')).toEqual(expect.arrayContaining(['phase:"practice"', 'word:"cat"']))
  })

  it('the next and previous buttons move the selection and the data', async () => {
    await mountPanel(nested)
    await toolbar()[1].trigger('click')
    expect(selected()).toEqual(['practice/b'])
    expect(dataLines('.data-display')).toContain('word:"dog"')
    await toolbar()[1].trigger('click')
    expect(selected()).toEqual(['main/c'])
    expect(wrapper.find('.index-display').text().replace(/\s+/g, ' ')).toBe('2/3 (0/1)')
    await toolbar()[0].trigger('click')
    expect(selected()).toEqual(['practice/b'])
  })

  it('the home button goes back to the first step', async () => {
    await mountPanel(nested)
    api.goNextStep()
    api.goNextStep()
    await nextTick()
    expect(selected()).toEqual(['main/c'])
    await toolbar()[2].trigger('click')
    expect(selected()).toEqual(['practice/a'])
  })

  it('a click on a step in the tree goes to it', async () => {
    await mountPanel(nested)
    const node = wrapper.findAll('.tree-line').find(l => l.text().includes('main/c'))
    await node.trigger('click')
    expect(api.pathString).toBe('main/c')
    expect(selected()).toEqual(['main/c'])
  })

  it('scrolls the tree to the selected step after a move', async () => {
    vi.useFakeTimers()
    await mountPanel(nested)
    const tree = wrapper.find('.tree-container').element
    tree.getBoundingClientRect = () => ({ top: 0, bottom: 100, height: 100 })
    await toolbar()[1].trigger('click')
    // The step is 400px down the tree's content
    wrapper.find('.node-selected').element.getBoundingClientRect = () => ({ top: 400 - tree.scrollTop, bottom: 420 - tree.scrollTop, height: 20 })
    vi.advanceTimersByTime(100)
    // The step's middle (410) goes to the container's middle (50)
    expect(tree.scrollTop).toBe(360)
  })

  it('the step buttons and the two indexes show what they are when focused', async () => {
    await mountPanel(nested)
    const named = [
      ...['Previous Step', 'Next Step', 'First Step', 'Clear Steps'].map((name, i) => [toolbar()[i], name]),
      ...['Step index', 'Index within block'].map((name, i) => [wrapper.find('.index-display').findAll('button')[i], name]),
    ]
    for (const [button, name] of named) {
      await button.trigger('focus')
      await vi.waitFor(() => expect(document.body.textContent).toContain(name))
      await button.trigger('blur')
    }
  })

  it('the trash button clears the view\'s steps', async () => {
    await mountPanel(nested)
    await toolbar()[3].trigger('click')
    expect(paths()).toEqual([])
    expect(api.hasSteps()).toBe(false)
    expect(toolbar().map(b => b.attributes('disabled'))).toEqual(['', '', '', ''])
  })

  it('shows the persisted variables, and its trash button clears them', async () => {
    await mountPanel(nested)
    expect(wrapper.find('.global-data-display').text()).toBe('No variables persisted')
    expect(wrapper.find('.data-container-global').classes()).toContain('disabled')
    api.persist.score = 12
    await nextTick()
    expect(dataLines('.global-data-display')).toEqual(['score:12'])
    await wrapper.find('button[title="Clear persisted variables"]').trigger('click')
    expect(wrapper.find('.global-data-display').text()).toBe('No variables persisted')
  })
})
