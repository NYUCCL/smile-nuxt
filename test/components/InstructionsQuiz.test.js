import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import InstructionsQuiz from '../../src/runtime/components/builtins/InstructionsQuiz.vue'
import { moduleComponents, mountComponent, setupViewAPI } from './mount'

// Two pages: one with two single-answer questions, one with a multi-select
const QUESTIONS = [
  {
    id: 'pg1',
    questions: [
      { id: 'q1', question: 'What colour is the sky?', multiSelect: false, answers: ['red', 'blue', 'green'], correctAnswer: ['blue'] },
      { id: 'q2', question: 'How many days in a week?', multiSelect: false, answers: ['5', '7'], correctAnswer: ['7'] },
    ],
  },
  {
    id: 'pg2',
    questions: [
      { id: 'q3', question: 'Which are fruits?', multiSelect: true, answers: ['apple', 'rock', 'pear'], correctAnswer: ['apple', 'pear'] },
    ],
  },
]

describe('InstructionsQuiz', () => {
  let wrapper
  let api
  let store

  /**
   * Mounts the quiz on a new view API.
   * @param {object} [props] - Props to add to the quiz's
   */
  async function mountQuiz(props = {}) {
    let pinia;
    ({ pinia, store, api } = setupViewAPI('quiz'))
    wrapper = mountComponent(InstructionsQuiz, {
      pinia,
      props: { questions: structuredClone(QUESTIONS), randomizeQandA: false, ...props },
      attachTo: document.body,
    })
    // The view API takes up the stepper's new position on the next tick
    await nextTick()
  }

  const button = text => wrapper.findAll('button').find(b => b.text().includes(text))
  // Answers a single-answer question through its Select, as choosing an option does
  const choose = async (index, value) => {
    wrapper.findAllComponents(moduleComponents.Select)[index].vm.$emit('update:modelValue', value)
    await nextTick()
  }
  const chooseMany = async (value) => {
    wrapper.findComponent(moduleComponents.MultiSelect).vm.$emit('update:modelValue', value)
    await nextTick()
  }
  // The data recorded for the quiz view (one entry per submission)
  const recorded = () => {
    const visits = store.data.pageData_quiz
    return visits ? Object.values(visits).flatMap(visit => visit.data) : []
  }

  beforeEach(() => mountQuiz())
  afterEach(() => {
    wrapper.unmount()
    api.clear()
    api.clearPersist()
  })

  it('starts on the first page with its questions and counts the first attempt', () => {
    expect(api.pathString).toBe('pages/pg1')
    expect(wrapper.text()).toContain('Did we explain things clearly?')
    expect(wrapper.text()).toContain('What colour is the sky?')
    expect(wrapper.text()).toContain('How many days in a week?')
    expect(wrapper.text()).not.toContain('Which are fruits?')
    expect(api.persist.attempts).toBe(1)
  })

  it('has no Previous button on the first page', () => {
    expect(button('Previous page')).toBeUndefined()
  })

  it('keeps Next disabled until every question on the page has an answer', async () => {
    expect(button('Next page').attributes('disabled')).toBeDefined()
    await choose(0, 'blue')
    expect(button('Next page').attributes('disabled')).toBeDefined()
    await choose(1, '7')
    expect(button('Next page').attributes('disabled')).toBeUndefined()
  })

  it('moves to the next page and back, keeping the answers', async () => {
    await choose(0, 'blue')
    await choose(1, '7')
    await button('Next page').trigger('click')
    expect(api.pathString).toBe('pages/pg2')
    expect(wrapper.text()).toContain('Which are fruits?')
    await button('Previous page').trigger('click')
    expect(api.pathString).toBe('pages/pg1')
    expect(api.stepData.questions.map(q => q.answer)).toEqual(['blue', '7'])
  })

  it('shows Submit on the last page, disabled until a multi-select has at least one choice', async () => {
    await choose(0, 'blue')
    await choose(1, '7')
    await button('Next page').trigger('click')
    expect(button('Next page')).toBeUndefined()
    expect(button('Submit').attributes('disabled')).toBeDefined()
    await chooseMany([])
    expect(button('Submit').attributes('disabled')).toBeDefined()
    await chooseMany(['apple'])
    expect(button('Submit').attributes('disabled')).toBeUndefined()
  })

  /**
   * Answers every question and submits.
   * @param {object} answers - The answers
   * @param {string} answers.q1 - The first question's
   * @param {string} answers.q2 - The second question's
   * @param {string[]} answers.q3 - The multi-select's
   */
  async function answerAndSubmit({ q1, q2, q3 }) {
    await choose(0, q1)
    await choose(1, q2)
    await button('Next page').trigger('click')
    await chooseMany(q3)
    await button('Submit').trigger('click')
  }

  it('passes when every answer is right, whatever the order of a multi-select', async () => {
    await answerAndSubmit({ q1: 'blue', q2: '7', q3: ['pear', 'apple'] })
    expect(api.pathString).toBe('feedback/success')
    expect(wrapper.text()).toContain('Congrats! You passed.')
  })

  it('records the questions, the answers and the attempt number when submitted', async () => {
    await answerAndSubmit({ q1: 'blue', q2: '7', q3: ['apple', 'pear'] })
    const entries = recorded()
    expect(entries).toHaveLength(1)
    expect(entries[0].phase).toBe('instructionsQuiz')
    expect(entries[0].questions.flatMap(page => page.questions).map(q => [q.id, q.answer])).toEqual([
      ['q1', 'blue'],
      ['q2', '7'],
      ['q3', ['apple', 'pear']],
    ])
    expect(entries[0].persist.attempts).toBe(1)
  })

  it('goes on to the next view from the success page', async () => {
    await answerAndSubmit({ q1: 'blue', q2: '7', q3: ['apple', 'pear'] })
    await button('Let\'s begin.').trigger('click')
    expect(api.goNextView).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a wrong single answer', { q1: 'red', q2: '7', q3: ['apple', 'pear'] }],
    ['a multi-select with one of the right choices missing', { q1: 'blue', q2: '7', q3: ['apple'] }],
    ['a multi-select with a wrong choice added', { q1: 'blue', q2: '7', q3: ['apple', 'pear', 'rock'] }],
  ])('fails with %s', async (_name, answers) => {
    await answerAndSubmit(answers)
    expect(api.pathString).toBe('feedback/retry')
    expect(wrapper.text()).toContain('Sorry! You did not get all the answers correct.')
    expect(api.goNextView).not.toHaveBeenCalled()
  })

  it('sends a participant who failed back to the instructions, with the answers cleared and the attempt counted', async () => {
    await answerAndSubmit({ q1: 'red', q2: '7', q3: ['apple'] })
    await button('Back to Instructions').trigger('click')
    expect(api.goToView).toHaveBeenCalledWith('instructions')
    expect(api.persist.attempts).toBe(2)
    expect(api.pathString).toBe('pages/pg1')
    const questions = api.queryStepData('pages*').flatMap(page => page.questions)
    expect(questions).toHaveLength(3)
    expect(questions.every(q => !('answer' in q))).toBe(true)
  })

  it('records each attempt, and passes on a second try', async () => {
    await answerAndSubmit({ q1: 'red', q2: '7', q3: ['apple'] })
    await button('Back to Instructions').trigger('click')
    await nextTick()
    await answerAndSubmit({ q1: 'blue', q2: '7', q3: ['apple', 'pear'] })
    expect(api.pathString).toBe('feedback/success')
    const entries = recorded()
    expect(entries).toHaveLength(2)
    expect(entries.map(e => e.persist.attempts)).toEqual([1, 2])
  })

  it('goes back to the view named in returnTo', async () => {
    wrapper.unmount()
    api.clear()
    api.clearPersist()
    await mountQuiz({ returnTo: 'my_instructions' })
    await answerAndSubmit({ q1: 'red', q2: '5', q3: ['rock'] })
    await button('Back to Instructions').trigger('click')
    expect(api.goToView).toHaveBeenCalledWith('my_instructions')
  })

  it('keeps every question and answer when the order is randomized', async () => {
    wrapper.unmount()
    api.clear()
    api.clearPersist()
    await mountQuiz({ randomizeQandA: true })
    const pages = api.queryStepData('pages*')
    expect(pages.map(p => p.questions.map(q => q.id).sort())).toEqual([['q1', 'q2'], ['q3']])
    const q1 = pages[0].questions.find(q => q.id === 'q1')
    expect([...q1.answers].sort()).toEqual(['blue', 'green', 'red'])
    expect(q1.correctAnswer).toEqual(['blue'])
  })
})
