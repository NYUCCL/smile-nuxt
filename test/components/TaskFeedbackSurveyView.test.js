import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import TaskFeedbackSurveyView from '../../src/runtime/components/builtins/TaskFeedbackSurveyView.vue'
import { moduleComponents, mountComponent, setupViewAPI } from './mount'

describe('TaskFeedbackSurveyView', () => {
  let wrapper
  let api
  let store
  let pinia

  beforeEach(async () => {
    ({ pinia, store, api } = setupViewAPI('feedback'))
    wrapper = mountComponent(TaskFeedbackSurveyView, { pinia, attachTo: document.body })
    await nextTick()
  })
  afterEach(() => {
    wrapper.unmount()
    api.clear()
    api.clearPersist()
  })

  const submit = () => wrapper.findAll('button').find(b => b.text().includes('Upload my complete data'))
  // Chooses an option through a Select, as picking it does
  const choose = async (index, value) => {
    wrapper.findAllComponents(moduleComponents.Select)[index].vm.$emit('update:modelValue', value)
    await nextTick()
  }
  const recorded = () => Object.values(store.data.pageData_feedback ?? {}).flatMap(visit => visit.data)

  it('starts with an empty form and the button disabled', () => {
    expect(api.persist.forminfo).toEqual({ difficulty_rating: '', enjoyment_rating: '', feedback: '', issues: '' })
    expect(submit().attributes('disabled')).toBeDefined()
  })

  it('needs both ratings; the two text fields are optional', async () => {
    await choose(0, '3 - Neutral')
    expect(submit().attributes('disabled')).toBeDefined()
    await choose(1, '6 - Very Fun')
    expect(submit().attributes('disabled')).toBeUndefined()
  })

  it('does not accept the text fields in place of the ratings', async () => {
    const [feedback, issues] = wrapper.findAll('textarea')
    await feedback.setValue('Fine')
    await issues.setValue('None')
    expect(submit().attributes('disabled')).toBeDefined()
  })

  it('records the answers and goes to the next view', async () => {
    await choose(0, '4 - Somewhat Difficult')
    await choose(1, '2 - Somewhat Boring')
    const [feedback, issues] = wrapper.findAll('textarea')
    await feedback.setValue('The instructions were clear.')
    await issues.setValue('One image did not load.')
    await submit().trigger('click')
    expect(recorded()).toEqual([{
      difficulty_rating: '4 - Somewhat Difficult',
      enjoyment_rating: '2 - Somewhat Boring',
      feedback: 'The instructions were clear.',
      issues: 'One image did not load.',
    }])
    expect(api.goNextView).toHaveBeenCalledTimes(1)
  })

  it('keeps what was entered when the view is shown again', async () => {
    await choose(0, '1 - Easy')
    await wrapper.findAll('textarea')[0].setValue('half written')
    wrapper.unmount()
    wrapper = mountComponent(TaskFeedbackSurveyView, { pinia, attachTo: document.body })
    await nextTick()
    expect(api.persist.forminfo.difficulty_rating).toBe('1 - Easy')
    expect(wrapper.findAll('textarea')[0].element.value).toBe('half written')
  })
})
