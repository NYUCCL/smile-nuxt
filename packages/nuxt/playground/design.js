import { markRaw } from 'vue'

// Import playground user components
// In Nuxt, playground/components/ are auto-imported in .vue files,
// but design.js is a plain .js file so we need explicit imports.
import InformedConsentText from './components/InformedConsentText.vue'
import DebriefText from './components/DebriefText.vue'
import TaskPage from './components/TaskPage.vue'

export default function createTimeline(api) {
  const timeline = new Timeline(api)

  timeline.pushSeqView({
    path: '/welcome',
    name: 'welcome_anonymous',
    component: 'AdvertisementView',
    meta: { allowAlways: true, requiresConsent: false },
  })

  timeline.pushSeqView({
    path: '/consent',
    name: 'consent',
    component: 'InformedConsentView',
    props: {
      informedConsentText: markRaw(InformedConsentText),
    },
    meta: { requiresConsent: false, setConsented: true },
  })

  timeline.pushSeqView({
    path: '/task',
    name: 'task',
    component: markRaw(TaskPage),
  })

  timeline.pushSeqView({
    path: '/debrief',
    name: 'debrief',
    component: 'DebriefView',
    props: {
      debriefText: markRaw(DebriefText),
    },
  })

  timeline.pushSeqView({
    path: '/thanks',
    name: 'thanks',
    component: 'ThanksView',
    meta: { setDone: true, requiresDone: false },
  })

  timeline.build()
  return timeline
}
