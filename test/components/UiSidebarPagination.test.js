/**
 * @fileoverview Two of the UI kit's parts that nothing else mounts with
 * their behaviour: the sidebar's open state (button, shortcut, cookie) and
 * the pagination's page buttons.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import SidebarProvider from '../../src/runtime/components/ui/sidebar/SidebarProvider.vue'
import SidebarTrigger from '../../src/runtime/components/ui/sidebar/SidebarTrigger.vue'
import { useSidebar } from '../../src/runtime/components/ui/sidebar/utils'
import Pagination from '../../src/runtime/components/ui/pagination/Pagination.vue'
import PaginationContent from '../../src/runtime/components/ui/pagination/PaginationContent.vue'
import PaginationItem from '../../src/runtime/components/ui/pagination/PaginationItem.vue'
import PaginationEllipsis from '../../src/runtime/components/ui/pagination/PaginationEllipsis.vue'
import PaginationFirst from '../../src/runtime/components/ui/pagination/PaginationFirst.vue'
import PaginationLast from '../../src/runtime/components/ui/pagination/PaginationLast.vue'
import PaginationNext from '../../src/runtime/components/ui/pagination/PaginationNext.vue'
import PaginationPrevious from '../../src/runtime/components/ui/pagination/PaginationPrevious.vue'
import { mountComponent } from './mount'

describe('sidebar provider and trigger', () => {
  // Shows the state the provider gives to everything inside it
  const State = defineComponent({
    setup() {
      const { state } = useSidebar()
      return () => h('output', state.value)
    },
  })

  /**
   * Mounts a provider around a trigger and the state display.
   * @param {object} [props] - The provider's props
   * @returns {object} The wrapper
   */
  function mountSidebar(props) {
    return mountComponent(SidebarProvider, {
      props,
      slots: { default: () => [h(SidebarTrigger), h(State)] },
      attachTo: document.body,
    })
  }

  let wrapper
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('starts expanded, or collapsed when told so', () => {
    wrapper = mountSidebar()
    expect(wrapper.find('output').text()).toBe('expanded')
    wrapper.unmount()
    wrapper = mountSidebar({ defaultOpen: false })
    expect(wrapper.find('output').text()).toBe('collapsed')
  })

  it('the trigger closes and opens it, and the state is kept in a cookie', async () => {
    wrapper = mountSidebar()
    const trigger = wrapper.find('[data-sidebar="trigger"]')
    await trigger.trigger('click')
    expect(wrapper.find('output').text()).toBe('collapsed')
    expect(document.cookie).toContain('sidebar_state=false')
    await trigger.trigger('click')
    expect(wrapper.find('output').text()).toBe('expanded')
    expect(document.cookie).toContain('sidebar_state=true')
  })

  it.each(['metaKey', 'ctrlKey'])('%s + b toggles it; b alone does not', async (modifier) => {
    wrapper = mountSidebar()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }))
    await nextTick()
    expect(wrapper.find('output').text()).toBe('expanded')
    const event = new KeyboardEvent('keydown', { key: 'b', [modifier]: true, cancelable: true })
    window.dispatchEvent(event)
    await nextTick()
    expect(event.defaultPrevented).toBe(true)
    expect(wrapper.find('output').text()).toBe('collapsed')
  })

  it('tells its owner when the owner holds the state', async () => {
    wrapper = mountSidebar({ open: true })
    await wrapper.find('[data-sidebar="trigger"]').trigger('click')
    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })
})

describe('pagination', () => {
  // 50 rows, 10 a page: five pages, with first / previous / next / last
  const Pager = defineComponent({
    props: { start: { type: Number, default: 1 }, total: { type: Number, default: 50 } },
    setup(props) {
      const page = ref(props.start)
      return () => h('div', [
        h('output', String(page.value)),
        h(Pagination, {
          'page': page.value,
          'onUpdate:page': (value) => {
            page.value = value
          },
          'total': props.total,
          'itemsPerPage': 10,
          'siblingCount': 1,
          'showEdges': true,
        }, {
          default: ({ page: current }) => h(PaginationContent, null, {
            default: ({ items }) => [
              h(PaginationFirst),
              h(PaginationPrevious),
              ...items.map((item, index) => item.type === 'page'
                ? h(PaginationItem, { key: index, value: item.value, isActive: item.value === current }, () => String(item.value))
                : h(PaginationEllipsis, { key: `gap-${index}`, index })),
              h(PaginationNext),
              h(PaginationLast),
            ],
          }),
        }),
      ])
    },
  })

  const slot = (wrapper, name) => wrapper.find(`[data-slot="pagination-${name}"]`)
  const pages = wrapper => wrapper.findAll('[data-slot="pagination-item"]')
  const shown = wrapper => wrapper.find('output').text()

  it('has a button for each page and marks the current one', () => {
    const wrapper = mountComponent(Pager, { props: { start: 2 } })
    expect(pages(wrapper).map(p => p.text())).toEqual(['1', '2', '3', '4', '5'])
    expect(pages(wrapper).filter(p => p.attributes('data-selected') !== undefined).map(p => p.text())).toEqual(['2'])
  })

  it('a page button goes to that page', async () => {
    const wrapper = mountComponent(Pager)
    await pages(wrapper)[3].trigger('click')
    expect(shown(wrapper)).toBe('4')
  })

  it('next, previous, last and first move the page', async () => {
    const wrapper = mountComponent(Pager, { props: { start: 2 } })
    await slot(wrapper, 'next').trigger('click')
    expect(shown(wrapper)).toBe('3')
    await slot(wrapper, 'previous').trigger('click')
    expect(shown(wrapper)).toBe('2')
    await slot(wrapper, 'last').trigger('click')
    expect(shown(wrapper)).toBe('5')
    await slot(wrapper, 'first').trigger('click')
    expect(shown(wrapper)).toBe('1')
  })

  it('previous and first are off on the first page, next and last on the last', async () => {
    const wrapper = mountComponent(Pager)
    expect(slot(wrapper, 'previous').attributes('disabled')).toBeDefined()
    expect(slot(wrapper, 'first').attributes('disabled')).toBeDefined()
    expect(slot(wrapper, 'next').attributes('disabled')).toBeUndefined()
    await slot(wrapper, 'last').trigger('click')
    expect(slot(wrapper, 'next').attributes('disabled')).toBeDefined()
    expect(slot(wrapper, 'last').attributes('disabled')).toBeDefined()
    expect(slot(wrapper, 'previous').attributes('disabled')).toBeUndefined()
  })

  it('leaves a gap in a long list of pages', () => {
    const wrapper = mountComponent(Pager, { props: { total: 300 } })
    expect(slot(wrapper, 'ellipsis').exists()).toBe(true)
    expect(pages(wrapper).map(p => p.text())).toContain('30')
    expect(pages(wrapper).length).toBeLessThan(30)
  })
})
