/**
 * The dev tools' autofill: each form view registers a function that fills
 * its form in with answers that let it be submitted.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { nextTick } from 'vue'
import TaskFeedbackSurveyView from '../../src/runtime/components/builtins/TaskFeedbackSurveyView.vue'
import DeviceSurveyView from '../../src/runtime/components/builtins/DeviceSurveyView.vue'
import DemographicSurveyView from '../../src/runtime/components/builtins/DemographicSurveyView.vue'
import InstructionsQuiz from '../../src/runtime/components/builtins/InstructionsQuiz.vue'
import { mountComponent, setupViewAPI } from './mount'

describe('autofill', () => {
  let wrapper
  let api
  let store

  /**
   * Mounts a view and returns the autofill function it registered.
   * @param {object} component - The view
   * @param {string} name - The view's name
   * @param {object} [options] - How to mount it
   * @param {object} [options.props] - The view's props
   * @param {string} [options.service] - The recruitment service
   * @returns {Promise<Function>} The registered function
   */
  async function mountAndGetAutofill(component, name, { props, service = 'web' } = {}) {
    let pinia;
    ({ pinia, store, api } = setupViewAPI(name))
    vi.spyOn(api, 'getRecruitmentService').mockReturnValue(service)
    const setAutofill = vi.spyOn(api, 'setAutofill').mockImplementation(() => {})
    wrapper = mountComponent(component, { pinia, props, attachTo: document.body })
    await nextTick()
    expect(setAutofill).toHaveBeenCalledTimes(1)
    return setAutofill.mock.calls[0][0]
  }
  const button = text => wrapper.findAll('button').find(b => b.text().includes(text))
  const press = async (text) => {
    await button(text).trigger('click')
    await nextTick()
  }
  const recorded = name => Object.values(store.data[`pageData_${name}`] ?? {}).flatMap(visit => visit.data)

  afterEach(() => {
    wrapper.unmount()
    api.clear()
    api.clearPersist()
    vi.restoreAllMocks()
  })

  it('fills in the task feedback form so it can be submitted', async () => {
    const autofill = await mountAndGetAutofill(TaskFeedbackSurveyView, 'feedback')
    autofill()
    await nextTick()
    expect(Object.values(api.persist.forminfo).every(v => v !== '')).toBe(true)
    await press('Upload my complete data')
    expect(recorded('feedback')).toHaveLength(1)
  })

  it('fills in both pages of the device survey', async () => {
    const autofill = await mountAndGetAutofill(DeviceSurveyView, 'device')
    autofill()
    await nextTick()
    expect(Object.values(api.persist.forminfo).every(v => v !== '')).toBe(true)
    await press('Continue')
    await press('I\'m done!')
    expect(recorded('device')).toHaveLength(1)
  })

  it('fills in the three pages of the demographic survey, with a date of birth', async () => {
    const autofill = await mountAndGetAutofill(DemographicSurveyView, 'demograph')
    autofill()
    await nextTick()
    expect(api.persist.forminfo.dob).toBe('1978-09-12')
    expect(api.persist.forminfo.age).toBe('')
    await press('Continue')
    await press('Continue')
    await press('That was easy!')
    expect(recorded('demograph')).toHaveLength(1)
  })

  it('fills in an age and no date of birth for a Prolific participant', async () => {
    const autofill = await mountAndGetAutofill(DemographicSurveyView, 'demograph', { service: 'prolific' })
    autofill()
    await nextTick()
    expect(api.persist.forminfo.age).toBe('34')
    expect(api.persist.forminfo.dob).toBe('')
    expect(button('Continue').attributes('disabled')).toBeUndefined()
  })

  it('answers every quiz question correctly', async () => {
    const questions = [
      { id: 'pg1', questions: [
        { id: 'q1', question: 'One?', multiSelect: false, answers: ['a', 'b'], correctAnswer: ['b'] },
        { id: 'q2', question: 'Many?', multiSelect: true, answers: ['x', 'y', 'z'], correctAnswer: ['x', 'z'] },
      ] },
    ]
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const autofill = await mountAndGetAutofill(InstructionsQuiz, 'quiz', { props: { questions, randomizeQandA: false } })
    autofill()
    await nextTick()
    expect(api.stepData.questions.map(q => q.answer)).toEqual(['b', ['x', 'z']])
    await press('Submit')
    expect(api.pathString).toBe('feedback/success')
  })
})
