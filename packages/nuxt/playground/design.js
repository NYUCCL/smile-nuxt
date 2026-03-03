import { defineComponent, h, resolveComponent } from 'vue'
// Timeline is auto-imported by the @gureckislab/smile Nuxt module
// Built-in components are globally registered and resolved at render time

// Simple consent text component for the playground
const ConsentText = defineComponent({
  name: 'ConsentText',
  setup() {
    return () =>
      h('div', [
        h('h2', { class: 'text-2xl font-bold mb-4' }, 'Consent to Participate'),
        h('p', { class: 'mb-3' }, 'This is a research study conducted by the Computation and Cognition Lab. Your participation is voluntary.'),
        h('p', { class: 'mb-3' }, 'You will be asked to complete a short task that takes approximately 10 minutes.'),
        h('p', { class: 'mb-3' }, 'Your data will be kept confidential and used only for research purposes. You may withdraw at any time without penalty.'),
        h('p', { class: 'mb-3' }, 'If you have any questions, please contact the research team.'),
      ])
  },
})

// Wrap InformedConsentView with the consent text prop
const ConsentPage = defineComponent({
  name: 'ConsentPage',
  setup() {
    return () => h(resolveComponent('InformedConsentView'), { informedConsentText: ConsentText })
  },
})

const TaskPage = defineComponent({
  name: 'TaskPage',
  setup() {
    const api = useAPI()
    return () =>
      h('div', { class: 'font-sans max-w-xl mx-auto p-4 mt-8' }, [
        h('h1', { class: 'text-3xl font-bold mb-4' }, 'Task'),
        h('p', { class: 'mb-2 text-foreground' }, 'This is the task page (page 3 of 5).'),
        h(
          'button',
          { class: 'bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90', onClick: () => api.goNextView() },
          'Next: Debrief'
        ),
      ])
  },
})

const DebriefPage = defineComponent({
  name: 'DebriefPage',
  setup() {
    const api = useAPI()
    return () =>
      h('div', { class: 'font-sans max-w-xl mx-auto p-4 mt-8' }, [
        h('h1', { class: 'text-3xl font-bold mb-4' }, 'Debrief'),
        h('p', { class: 'mb-2 text-foreground' }, 'This is the debrief page (page 4 of 5).'),
        h(
          'button',
          { class: 'bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90', onClick: () => api.goNextView() },
          'Next: Thanks'
        ),
      ])
  },
})

const ThanksPage = defineComponent({
  name: 'ThanksPage',
  setup() {
    return () =>
      h('div', { class: 'font-sans max-w-xl mx-auto p-4 mt-8' }, [
        h('h1', { class: 'text-3xl font-bold mb-4' }, 'Thanks!'),
        h('p', { class: 'mb-2 text-foreground' }, 'This is the thanks page (page 5 of 5).'),
        h('p', { class: 'mb-2 text-foreground' }, 'The experiment is complete.'),
      ])
  },
})

export default function createTimeline(api) {
  const timeline = new Timeline(api)

  // Use component name strings for globally-registered built-in components.
  // Vue's <component :is="..."> resolves string names from global components at render time.
  timeline.pushSeqView({
    path: '/welcome',
    name: 'welcome_anonymous',
    component: 'AdvertisementView',
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
