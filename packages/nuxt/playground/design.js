import { defineComponent, h } from 'vue'
import Timeline from '../src/runtime/core/timeline/Timeline.js'

const WelcomePage = defineComponent({
  name: 'WelcomePage',
  setup() {
    return () =>
      h('div', { style: 'font-family: sans-serif; max-width: 600px; margin: 2rem auto; padding: 1rem;' }, [
        h('h1', 'Welcome'),
        h('p', 'This is the welcome page (page 1 of 3).'),
        h('button', { onClick: () => navigateTo('/task') }, 'Start Task'),
      ])
  },
})

const TaskPage = defineComponent({
  name: 'TaskPage',
  setup() {
    return () =>
      h('div', { style: 'font-family: sans-serif; max-width: 600px; margin: 2rem auto; padding: 1rem;' }, [
        h('h1', 'Task'),
        h('p', 'This is the task page (page 2 of 3).'),
        h('button', { onClick: () => navigateTo('/thanks') }, 'Finish'),
      ])
  },
})

const ThanksPage = defineComponent({
  name: 'ThanksPage',
  setup() {
    return () =>
      h('div', { style: 'font-family: sans-serif; max-width: 600px; margin: 2rem auto; padding: 1rem;' }, [
        h('h1', 'Thanks!'),
        h('p', 'This is the thanks page (page 3 of 3).'),
        h('p', 'The experiment is complete.'),
      ])
  },
})

export default function createTimeline(api) {
  const timeline = new Timeline(api)

  timeline.pushSeqView({
    path: '/welcome',
    name: 'welcome_anonymous',
    component: WelcomePage,
    meta: { allowAlways: true, requiresConsent: false },
  })

  timeline.pushSeqView({
    path: '/task',
    name: 'task',
    component: TaskPage,
  })

  timeline.pushSeqView({
    path: '/thanks',
    name: 'thanks',
    component: ThanksPage,
    meta: { setDone: true },
  })

  timeline.build()
  return timeline
}
