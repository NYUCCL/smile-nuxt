import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import ThanksView from '../../src/runtime/components/builtins/ThanksView.vue'
import { copyText } from '../../src/runtime/utils/clipboard.js'
import { createStore, createFakeApi, mountComponent } from './mount'

const fake = vi.hoisted(() => ({ api: null }))
vi.mock('../../src/runtime/composables/useAPI', async original => ({ ...(await original()), default: () => fake.api }))
vi.mock('../../src/runtime/utils/clipboard.js', () => ({ copyText: vi.fn(async () => true) }))

/**
 * Mounts the Thanks page.
 * @param {object} [options] - What the page starts from
 * @param {string} [options.service] - The recruitment service
 * @param {(store: object) => void} [options.setup] - Sets the store's state
 * @param {object} [options.api] - API members to replace
 * @returns {{ wrapper: object, store: object }} The wrapper and the store
 */
function mountThanks({ service = 'web', setup, api = {} } = {}) {
  const { pinia, store } = createStore(setup)
  fake.api = createFakeApi(store, { getRecruitmentService: vi.fn(() => service), ...api })
  // The page's save marks the study as finished, as the real one does
  fake.api.setCompletionCode.mockImplementation((code) => {
    store.cookieState.completionCode = code
  })
  return { wrapper: mountComponent(ThanksView, { pinia, attachTo: document.body }), store }
}

/**
 * Moves the clock on and lets the page react.
 * @param {number} ms - Milliseconds
 */
async function advance(ms) {
  await vi.advanceTimersByTimeAsync(ms)
  await nextTick()
}

const uploading = wrapper => wrapper.text().includes('Uploading Your Data')
const stillSaving = wrapper => wrapper.find('[data-testid="thanks-still-saving"]')

describe('ThanksView', () => {
  let wrapper
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(copyText).mockClear()
  })
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
  })

  describe('waiting for the last save', () => {
    it('starts the save at once and shows the upload screen', () => {
      ({ wrapper } = mountThanks())
      expect(fake.api.sync).toHaveBeenCalledTimes(1)
      expect(uploading(wrapper)).toBe(true)
      expect(wrapper.text()).toContain('Do not close your browser window yet!')
      expect(wrapper.text()).not.toContain('Thanks')
    })

    it('keeps the upload screen for 2 seconds even when the save is quick', async () => {
      ({ wrapper } = mountThanks())
      await advance(1900)
      expect(uploading(wrapper)).toBe(true)
      await advance(200)
      expect(uploading(wrapper)).toBe(false)
      expect(wrapper.text()).toContain('Thanks for your contribution to science!')
      expect(stillSaving(wrapper).exists()).toBe(false)
    })

    it('stores the completion code once the save answers', async () => {
      ({ wrapper } = mountThanks())
      expect(fake.api.setCompletionCode).not.toHaveBeenCalled()
      await flushPromises()
      expect(fake.api.setCompletionCode).toHaveBeenCalledWith('CODE-123')
    })

    it('moves the progress bar up to 80% while it waits, and no further', async () => {
      let answer
      ({ wrapper } = mountThanks({ api: { sync: vi.fn(() => new Promise((resolve) => {
        answer = resolve
      })) } }))
      await advance(1000)
      const early = Number(wrapper.text().match(/(\d+)%/)[1])
      expect(early).toBeGreaterThan(0)
      expect(early).toBeLessThan(96)
      await advance(5000)
      expect(wrapper.text()).toContain('96%')
      expect(uploading(wrapper)).toBe(true)
      answer({ ok: true })
      await advance(50)
      expect(uploading(wrapper)).toBe(false)
    })

    it('waits for a save that takes longer than 2 seconds', async () => {
      let answer
      ({ wrapper } = mountThanks({ api: { sync: vi.fn(() => new Promise((resolve) => {
        answer = resolve
      })) } }))
      await advance(6000)
      expect(uploading(wrapper)).toBe(true)
      answer({ ok: true })
      await advance(50)
      expect(uploading(wrapper)).toBe(false)
    })

    it('shows the code after 15 seconds when the save failed, with a note that saving goes on', async () => {
      ({ wrapper } = mountThanks({ service: 'cloudresearch', api: { sync: vi.fn(async () => ({ ok: false })) } }))
      fake.api.syncStatus.status = 'error'
      await advance(14900)
      expect(uploading(wrapper)).toBe(true)
      await advance(200)
      expect(uploading(wrapper)).toBe(false)
      expect(wrapper.find('input.completioncode-cloudresearch').element.value).toBe('CODE-123')
      expect(stillSaving(wrapper).exists()).toBe(true)
      expect(stillSaving(wrapper).text()).toContain('Your data is still being saved.')
      // The study is marked finished either way
      expect(fake.api.setCompletionCode).toHaveBeenCalledWith('CODE-123')
    })

    it('shows the note while the browser is offline', async () => {
      ({ wrapper } = mountThanks({ api: { sync: vi.fn(async () => ({ ok: false })) } }))
      fake.api.syncStatus.status = 'offline'
      await advance(15100)
      expect(stillSaving(wrapper).exists()).toBe(true)
    })

    it('removes the note when a later save gets through', async () => {
      ({ wrapper } = mountThanks({ api: { sync: vi.fn(async () => ({ ok: false })) } }))
      fake.api.syncStatus.status = 'error'
      await advance(15100)
      expect(stillSaving(wrapper).exists()).toBe(true)
      fake.api.syncStatus.status = 'saved'
      await nextTick()
      expect(stillSaving(wrapper).exists()).toBe(false)
    })

    it('stops waiting when the sync loop\'s retry gets through before 15 seconds', async () => {
      ({ wrapper } = mountThanks({ api: { sync: vi.fn(async () => ({ ok: false })) } }))
      fake.api.syncStatus.status = 'error'
      await advance(5000)
      expect(uploading(wrapper)).toBe(true)
      fake.api.syncStatus.status = 'saved'
      await advance(50)
      expect(uploading(wrapper)).toBe(false)
      expect(stillSaving(wrapper).exists()).toBe(false)
    })

    it('does not show the note for a save that is only pending or on its way', async () => {
      ({ wrapper } = mountThanks())
      await advance(2100)
      fake.api.syncStatus.status = 'saving'
      await nextTick()
      expect(stillSaving(wrapper).exists()).toBe(false)
      fake.api.syncStatus.status = 'pending'
      await nextTick()
      expect(stillSaving(wrapper).exists()).toBe(false)
    })
  })

  describe('a return visit', () => {
    const finished = (s) => {
      s.cookieState.completionCode = 'OLD-CODE'
    }

    it('shows the code from the first visit at once, without saving or a new code', () => {
      ({ wrapper } = mountThanks({ service: 'cloudresearch', setup: finished }))
      expect(uploading(wrapper)).toBe(false)
      expect(wrapper.find('input.completioncode-cloudresearch').element.value).toBe('OLD-CODE')
      expect(fake.api.sync).not.toHaveBeenCalled()
      expect(fake.api.computeCompletionCode).not.toHaveBeenCalled()
      expect(fake.api.setCompletionCode).not.toHaveBeenCalled()
    })
  })

  describe('each recruitment service', () => {
    const finished = (s) => {
      s.cookieState.completionCode = 'DONE-1'
      s.private.recruitmentInfo = {
        url: 'https://nyu.sona-systems.com',
        experimentId: '77',
        creditToken: 'tok',
        survey_code: 'sc9',
        completionUrl: 'https://spark.example/done',
        subject_ID: 'S42',
      }
    }
    const link = w => w.find('a[data-slot="button"]')

    it('prolific: a link that submits the code to Prolific', () => {
      ({ wrapper } = mountThanks({ service: 'prolific', setup: finished }))
      expect(link(wrapper).attributes('href')).toBe('https://app.prolific.com/submissions/complete?cc=DONE-1')
      expect(link(wrapper).text()).toContain('Submit my work to Prolific')
    })

    it('cloudresearch: the code in a read-only field with a copy button', () => {
      ({ wrapper } = mountThanks({ service: 'cloudresearch', setup: finished }))
      const field = wrapper.find('input.completioncode-cloudresearch')
      expect(field.element.value).toBe('DONE-1')
      expect(field.attributes('readonly')).toBeDefined()
      expect(wrapper.find('[data-clipboard-target=".completioncode-cloudresearch"]').text()).toContain('Copy Code')
    })

    it('citizensci: a submit link', () => {
      ({ wrapper } = mountThanks({ service: 'citizensci', setup: finished }))
      expect(link(wrapper).text()).toContain('Submit my work')
      expect(link(wrapper).attributes('href')).toBe('http://gureckislab.org')
    })

    it('sona: a link back to SONA for credit', () => {
      ({ wrapper } = mountThanks({ service: 'sona', setup: finished }))
      expect(link(wrapper).text()).toContain('Return to SONA for credit')
      expect(link(wrapper).attributes('href')).toBe('https://nyu.sona-systems.com/webstudy_credit.aspx?experiment_id=77&credit_token=tok&survey_code=sc9')
    })

    it('sona_paid: a link back to SONA for payment', () => {
      ({ wrapper } = mountThanks({ service: 'sona_paid', setup: finished }))
      expect(link(wrapper).text()).toContain('Return to SONA for payment')
      expect(link(wrapper).attributes('href')).toBe('https://nyu.sona-systems.com/webstudy_credit.aspx?experiment_id=77&credit_token=tok&survey_code=sc9')
    })

    it('spark: a link back to SPARK with the subject ID', () => {
      ({ wrapper } = mountThanks({ service: 'spark', setup: finished }))
      expect(link(wrapper).text()).toContain('Return to SPARK')
      expect(link(wrapper).attributes('href')).toBe('https://spark.example/done/S42')
    })

    it.each(['panda', 'web'])('%s: a message that the window can be closed, with no link or code', (service) => {
      ({ wrapper } = mountThanks({ service, setup: finished }))
      expect(wrapper.text()).toContain('You may now safely close this browser window.')
      expect(link(wrapper).exists()).toBe(false)
      expect(wrapper.find('input').exists()).toBe(false)
    })

    it('shows only the section for the participant\'s service', () => {
      ({ wrapper } = mountThanks({ service: 'prolific', setup: finished }))
      expect(wrapper.findAll('h1')).toHaveLength(1)
    })
  })

  describe('the copy button', () => {
    const finished = (s) => {
      s.cookieState.completionCode = 'COPY-ME'
    }

    it('copies the code in the field it points to', async () => {
      ({ wrapper } = mountThanks({ service: 'cloudresearch', setup: finished }))
      await wrapper.find('[data-clipboard-target]').trigger('click')
      await flushPromises()
      expect(copyText).toHaveBeenCalledTimes(1)
      expect(vi.mocked(copyText).mock.calls[0][0]).toBe('COPY-ME')
      expect(vi.mocked(copyText).mock.calls[0][1]).toBe(wrapper.find('input.completioncode-cloudresearch').element)
      expect(fake.api.log.debug).toHaveBeenCalled()
      expect(fake.api.log.warn).not.toHaveBeenCalled()
    })

    it('copies when the click lands on the icon inside the button', async () => {
      ({ wrapper } = mountThanks({ service: 'cloudresearch', setup: finished }))
      await wrapper.find('[data-clipboard-target] svg').trigger('click')
      await flushPromises()
      expect(copyText).toHaveBeenCalledTimes(1)
    })

    it('logs a warning when the browser refuses the copy', async () => {
      vi.mocked(copyText).mockResolvedValueOnce(false);
      ({ wrapper } = mountThanks({ service: 'cloudresearch', setup: finished }))
      await wrapper.find('[data-clipboard-target]').trigger('click')
      await flushPromises()
      expect(fake.api.log.warn).toHaveBeenCalledWith('could not copy the code to the clipboard')
    })

    it('copies nothing for a click somewhere else on the page', async () => {
      ({ wrapper } = mountThanks({ service: 'cloudresearch', setup: finished }))
      await wrapper.find('h1').trigger('click')
      document.dispatchEvent(new Event('click'))
      await flushPromises()
      expect(copyText).not.toHaveBeenCalled()
    })

    it('copies an element\'s text when the target is not a form field', async () => {
      ({ wrapper } = mountThanks({ service: 'web', setup: finished }))
      const target = document.createElement('span')
      target.id = 'plain-code'
      target.textContent = 'TEXT-CODE'
      const trigger = document.createElement('button')
      trigger.setAttribute('data-clipboard-target', '#plain-code')
      document.body.append(target, trigger)
      trigger.click()
      await flushPromises()
      expect(vi.mocked(copyText).mock.calls[0][0]).toBe('TEXT-CODE')
      target.remove()
      trigger.remove()
    })

    it('copies nothing when the button points to an element that is not there', async () => {
      ({ wrapper } = mountThanks({ service: 'web', setup: finished }))
      const trigger = document.createElement('button')
      trigger.setAttribute('data-clipboard-target', '#missing')
      document.body.append(trigger)
      trigger.click()
      await flushPromises()
      expect(copyText).not.toHaveBeenCalled()
      trigger.remove()
    })

    it('stops listening for clicks when the page is left', async () => {
      ({ wrapper } = mountThanks({ service: 'cloudresearch', setup: finished }))
      const trigger = document.createElement('button')
      trigger.setAttribute('data-clipboard-target', 'body')
      document.body.append(trigger)
      wrapper.unmount()
      wrapper = null
      trigger.click()
      await flushPromises()
      expect(copyText).not.toHaveBeenCalled()
      trigger.remove()
    })
  })
})
