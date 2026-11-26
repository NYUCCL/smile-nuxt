import { describe, it, expect, vi, afterEach } from 'vitest'
import { nextTick } from 'vue'
import DemographicSurveyView from '../../src/runtime/components/builtins/DemographicSurveyView.vue'
import { moduleComponents, mountComponent, setupViewAPI } from './mount'

// The Selects on each page, in the order they appear (the first page's first
// field is the date picker, or the age Select for Prolific)
const PAGE1 = { gender: 'Female', race: 'Asian', hispanic: 'No', fluent_english: 'Yes' }
const PAGE2 = { normal_vision: 'Yes', color_blind: 'No', learning_disability: 'No', neurodevelopmental_disorder: 'No', psychiatric_disorder: 'I prefer not to say' }
const PAGE3 = { country: 'Canada', education_level: 'Bachelor\'s Degree', household_income: '$50,000–$74,999' }

describe('DemographicSurveyView', () => {
  let wrapper
  let api
  let store

  /**
   * Mounts the survey.
   * @param {string} [service] - The recruitment service
   */
  async function mountSurvey(service = 'web') {
    let pinia;
    ({ pinia, store, api } = setupViewAPI('demograph'))
    vi.spyOn(api, 'getRecruitmentService').mockReturnValue(service)
    wrapper = mountComponent(DemographicSurveyView, { pinia, attachTo: document.body })
    await nextTick()
  }
  afterEach(() => {
    wrapper.unmount()
    api.clear()
    api.clearPersist()
  })

  const button = text => wrapper.findAll('button').find(b => b.text().includes(text))
  const selects = () => wrapper.findAllComponents(moduleComponents.Select)
  // Picks an option in the page's nth Select
  const choose = async (index, value) => {
    selects()[index].vm.$emit('update:modelValue', value)
    await nextTick()
  }
  const chooseAll = async (values, from = 0) => {
    for (const [i, value] of values.entries()) await choose(from + i, value)
  }
  const next = async (text) => {
    await button(text).trigger('click')
    await nextTick()
  }
  const recorded = () => Object.values(store.data.pageData_demograph ?? {}).flatMap(visit => visit.data)

  it('starts on the first page with every field empty', async () => {
    await mountSurvey()
    expect(api.pathString).toBe('survey_page1')
    expect(wrapper.text()).toContain('Basic Info')
    expect(Object.keys(api.persist.forminfo)).toEqual([
      'dob', 'age', 'gender', 'race', 'hispanic', 'fluent_english', 'normal_vision', 'color_blind',
      'learning_disability', 'neurodevelopmental_disorder', 'psychiatric_disorder', 'country', 'zipcode',
      'education_level', 'household_income',
    ])
    expect(Object.values(api.persist.forminfo).every(v => v === '')).toBe(true)
  })

  describe('date of birth or age', () => {
    it('asks for a date of birth, not an age, outside Prolific', async () => {
      await mountSurvey('web')
      expect(wrapper.text()).toContain('Date of Birth')
      expect(wrapper.text()).toContain('Pick a date')
      expect(wrapper.text()).not.toContain('How old are you')
      expect(selects()).toHaveLength(4)
    })

    it('asks a Prolific participant for an age in years, not a date of birth', async () => {
      await mountSurvey('prolific')
      expect(wrapper.text()).toContain('How old are you (in years)?')
      expect(wrapper.text()).not.toContain('Date of Birth')
      expect(selects()).toHaveLength(5)
    })

    it('shows the chosen date in words', async () => {
      await mountSurvey('web')
      api.persist.forminfo.dob = '1990-02-03'
      await nextTick()
      expect(button('February 3, 1990')).toBeDefined()
    })

    it('needs the date of birth before the first page can be left', async () => {
      await mountSurvey('web')
      await chooseAll(Object.values(PAGE1))
      expect(button('Continue').attributes('disabled')).toBeDefined()
      api.persist.forminfo.dob = '1990-02-03'
      await nextTick()
      expect(button('Continue').attributes('disabled')).toBeUndefined()
    })

    it('needs the age, and not a date of birth, for a Prolific participant', async () => {
      await mountSurvey('prolific')
      await chooseAll(Object.values(PAGE1), 1)
      expect(button('Continue').attributes('disabled')).toBeDefined()
      await choose(0, '34')
      expect(button('Continue').attributes('disabled')).toBeUndefined()
      expect(api.persist.forminfo.age).toBe('34')
      expect(api.persist.forminfo.dob).toBe('')
    })
  })

  it.each(Object.keys(PAGE1))('does not leave the first page without %s', async (missing) => {
    await mountSurvey('web')
    api.persist.forminfo.dob = '1990-02-03'
    for (const [i, key] of Object.keys(PAGE1).entries()) {
      if (key !== missing) await choose(i, PAGE1[key])
    }
    expect(button('Continue').attributes('disabled')).toBeDefined()
  })

  it.each(Object.keys(PAGE2))('does not leave the second page without %s', async (missing) => {
    await mountSurvey('web')
    api.goNextStep()
    await nextTick()
    expect(api.pathString).toBe('survey_page2')
    expect(wrapper.text()).toContain('Health & Vision')
    for (const [i, key] of Object.keys(PAGE2).entries()) {
      if (key !== missing) await choose(i, PAGE2[key])
    }
    expect(button('Continue').attributes('disabled')).toBeDefined()
    await choose(Object.keys(PAGE2).indexOf(missing), PAGE2[missing])
    expect(button('Continue').attributes('disabled')).toBeUndefined()
  })

  it.each(Object.keys(PAGE3))('does not finish without %s', async (missing) => {
    await mountSurvey('web')
    api.goNextStep()
    api.goNextStep()
    await nextTick()
    expect(api.pathString).toBe('survey_page3')
    expect(wrapper.text()).toContain('Location & Background')
    for (const [i, key] of Object.keys(PAGE3).entries()) {
      if (key !== missing) await choose(i, PAGE3[key])
    }
    expect(button('That was easy!').attributes('disabled')).toBeDefined()
  })

  it('finishes without a zipcode', async () => {
    await mountSurvey('web')
    api.goNextStep()
    api.goNextStep()
    await nextTick()
    await chooseAll(Object.values(PAGE3))
    expect(button('That was easy!').attributes('disabled')).toBeUndefined()
  })

  it('goes back a page with the answers kept', async () => {
    await mountSurvey('web')
    api.persist.forminfo.dob = '1990-02-03'
    await chooseAll(Object.values(PAGE1))
    await next('Continue')
    expect(api.pathString).toBe('survey_page2')
    await chooseAll(Object.values(PAGE2))
    await next('Continue')
    expect(api.pathString).toBe('survey_page3')
    await next('Previous')
    expect(api.pathString).toBe('survey_page2')
    await next('Previous')
    expect(api.pathString).toBe('survey_page1')
    expect(api.persist.forminfo).toMatchObject({ ...PAGE1, ...PAGE2 })
  })

  it('records every answer once, at the end, and goes to the next view', async () => {
    await mountSurvey('web')
    api.persist.forminfo.dob = '1990-02-03'
    await chooseAll(Object.values(PAGE1))
    await next('Continue')
    await chooseAll(Object.values(PAGE2))
    await next('Continue')
    await chooseAll(Object.values(PAGE3))
    await wrapper.find('input[type="text"]').setValue('M5V 2T6')
    expect(recorded()).toEqual([])
    expect(api.goNextView).not.toHaveBeenCalled()
    await button('That was easy!').trigger('click')
    expect(recorded()).toEqual([{
      dob: '1990-02-03',
      age: '',
      ...PAGE1,
      ...PAGE2,
      ...PAGE3,
      zipcode: 'M5V 2T6',
    }])
    expect(api.goNextView).toHaveBeenCalledTimes(1)
  })

  it('records an age and an empty date of birth for a Prolific participant', async () => {
    await mountSurvey('prolific')
    await choose(0, '52')
    await chooseAll(Object.values(PAGE1), 1)
    await next('Continue')
    await chooseAll(Object.values(PAGE2))
    await next('Continue')
    await chooseAll(Object.values(PAGE3))
    await button('That was easy!').trigger('click')
    expect(recorded()).toHaveLength(1)
    expect(recorded()[0].age).toBe('52')
    expect(recorded()[0].dob).toBe('')
  })
})
