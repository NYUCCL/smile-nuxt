import { describe, it, expect, vi } from 'vitest'
import StudyPreviewText from '../../src/runtime/components/builtins/StudyPreviewText.vue'
import { createStore, createFakeApi, mountComponent } from './mount'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))

/**
 * Mounts the study preview text.
 * @param {object} [config] - Config values to change
 * @returns {object} The wrapper
 */
function mountPreview(config = {}) {
  const { pinia, store } = createStore()
  fake.api = createFakeApi(store)
  Object.assign(fake.api.config, { advertisementImageFn: '/img/helpus.png', advertisementImageInvertDark: false }, config)
  return mountComponent(StudyPreviewText, { pinia, props: { estimated_time: '30 minutes', payrate: '$5 plus a bonus' } })
}

describe('StudyPreviewText', () => {
  it('states the pay and the estimated time it is given', () => {
    const text = mountPreview().text()
    expect(text).toContain('($5 plus a bonus)')
    expect(text).toContain('about 30 minutes of your time')
  })

  it('shows the advertisement image from the config', () => {
    const img = mountPreview().find('img')
    expect(img.attributes('src')).toBe('/img/helpus.png')
    expect(img.classes()).not.toContain('dark-aware-img')
  })

  it('marks the image for inverting in dark mode when the config asks for it', () => {
    expect(mountPreview({ advertisementImageInvertDark: true }).find('img').classes()).toContain('dark-aware-img')
  })

  it('names the lab and links to it and its code of ethics', () => {
    const wrapper = mountPreview()
    expect(wrapper.text()).toContain('Computation and Cognition Lab')
    const links = wrapper.findAll('article a').map(a => a.attributes('href'))
    expect(links).toContain('http://gureckislab.org')
    expect(links).toContain('http://gureckislab.org/research-code-of-ethics.html')
  })

  it('does not name the lab in anonymous mode', () => {
    const wrapper = mountPreview({ anonymousMode: true })
    expect(wrapper.text()).not.toContain('Computation and Cognition Lab')
    expect(wrapper.text()).toContain('You can try our experiment here.')
    expect(wrapper.findAll('article a')).toHaveLength(0)
  })
})
