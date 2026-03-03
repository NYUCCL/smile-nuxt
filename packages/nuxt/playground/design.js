import { defineComponent, h } from 'vue'
import Timeline from '../src/runtime/core/timeline/Timeline.js'

// Each page component uses the SMILE API's goNextView() to navigate.
// This sets currentViewDone=true before navigating, which the middleware
// requires for sequential route progression.

const WelcomePage = defineComponent({
  name: 'WelcomePage',
  setup() {
    const api = useAPI()
    return () =>
      h('div', { style: 'font-family: sans-serif; max-width: 600px; margin: 2rem auto; padding: 1rem;' }, [
        h('h1', 'Welcome'),
        h('p', 'This is the welcome page (page 1 of 5).'),
        h('button', { onClick: () => api.goNextView() }, 'Next: Consent'),
      ])
  },
})

const ConsentPage = defineComponent({
  name: 'ConsentPage',
  setup() {
    const api = useAPI()
    return () =>
      h('div', { style: 'font-family: sans-serif; max-width: 600px; margin: 2rem auto; padding: 1rem;' }, [
        h('h1', 'Consent'),
        h('p', 'This is the consent page (page 2 of 5).'),
        h('p', 'By clicking Next you agree to participate.'),
        h('button', { onClick: () => api.goNextView() }, 'I Agree - Start Task'),
      ])
  },
})

const TaskPage = defineComponent({
  name: 'TaskPage',
  setup() {
    const api = useAPI()
    return () =>
      h('div', { style: 'font-family: sans-serif; max-width: 600px; margin: 2rem auto; padding: 1rem;' }, [
        h('h1', 'Task'),
        h('p', 'This is the task page (page 3 of 5).'),
        h('button', { onClick: () => api.goNextView() }, 'Next: Debrief'),
      ])
  },
})

const DebriefPage = defineComponent({
  name: 'DebriefPage',
  setup() {
    const api = useAPI()
    return () =>
      h('div', { style: 'font-family: sans-serif; max-width: 600px; margin: 2rem auto; padding: 1rem;' }, [
        h('h1', 'Debrief'),
        h('p', 'This is the debrief page (page 4 of 5).'),
        h('button', { onClick: () => api.goNextView() }, 'Next: Thanks'),
      ])
  },
})

const ThanksPage = defineComponent({
  name: 'ThanksPage',
  setup() {
    return () =>
      h('div', { style: 'font-family: sans-serif; max-width: 600px; margin: 2rem auto; padding: 1rem;' }, [
        h('h1', 'Thanks!'),
        h('p', 'This is the thanks page (page 5 of 5).'),
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
    path: '/consent',
    name: 'consent',
    component: ConsentPage,
    meta: { requiresConsent: false, setConsented: true },
  })

  timeline.pushSeqView({
    path: '/task',
    name: 'task',
    component: TaskPage,
  })

  timeline.pushSeqView({
    path: '/debrief',
    name: 'debrief',
    component: DebriefPage,
  })

  timeline.pushSeqView({
    path: '/thanks',
    name: 'thanks',
    component: ThanksPage,
    meta: { setDone: true, requiresDone: false },
  })

  timeline.build()
  return timeline
}
