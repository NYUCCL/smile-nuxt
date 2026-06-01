/**
 * @file design.js
 * @description Configures the experiment timeline — the sequence of pages
 * participants see. Edit this file to define your experiment flow.
 *
 * Built-in views provided by @nyuccl/smile-nuxt:
 *   AdvertisementView, InformedConsentView, DemographicSurveyView,
 *   WindowSizerView, InstructionsView, InstructionsQuiz,
 *   DebriefView, DeviceSurveyView, TaskFeedbackSurveyView,
 *   ThanksView, WithdrawView
 *
 * Your custom components go in components/ and are auto-imported in .vue files.
 * In this .js file, use explicit imports for custom components.
 */

import { markRaw } from 'vue'

// Import your custom components (auto-import doesn't work in plain .js files)
import InformedConsentText from './components/InformedConsentText.vue'
import DebriefText from './components/DebriefText.vue'
import MyTaskView from './components/MyTaskView.vue'
import StroopExpView from './components/StroopExpView.vue'

export default function createTimeline(api) {
  const timeline = new Timeline(api)

  // --- Configuration ---
  // These can also be set in .env (see .env.local.example for all options)
  api.setRuntimeConfig('labURL', 'https://mylab.edu')
  api.setRuntimeConfig('brandLogoFn', 'universitylogo.png')

  // --- Informed consent text ---
  api.setAppComponent('informed_consent_text', InformedConsentText)

  // --- Timeline definition ---
  // Pages appear in the order you push them.

  // Welcome / advertisement page
  timeline.pushSeqView({
    path: '/welcome/:service?',
    name: 'welcome_anonymous',
    component: 'AdvertisementView',
    meta: {
      prev: undefined,
      next: 'consent',
      requiresConsent: false,
    },
  })

  // Informed consent
  timeline.pushSeqView({
    name: 'consent',
    component: 'InformedConsentView',
    props: {
      informedConsentText: markRaw(InformedConsentText),
    },
    meta: {
      requiresConsent: false,
      setConsented: true,
    },
  })

  // Demographic survey (3-page built-in form)
  timeline.pushSeqView({
    name: 'demograph',
    component: 'DemographicSurveyView',
  })

  // Window sizer (ensures browser meets minimum size)
  timeline.pushSeqView({
    name: 'windowsizer',
    component: 'WindowSizerView',
  })

  // Your custom task — edit components/MyTaskView.vue
  timeline.pushSeqView({
    name: 'task',
    component: markRaw(MyTaskView),
  })

  // Example Stroop task — a color-word interference experiment
  // Remove or replace this with your own task
  timeline.pushSeqView({
    name: 'stroop',
    component: markRaw(StroopExpView),
  })

  // Debriefing — explains the study to participants
  timeline.pushSeqView({
    name: 'debrief',
    component: 'DebriefView',
    props: {
      debriefText: markRaw(DebriefText),
    },
  })

  // Device survey (browser, OS, screen size metadata)
  timeline.pushSeqView({
    name: 'device',
    component: 'DeviceSurveyView',
  })

  // Task feedback survey (this is the last form before completion)
  timeline.pushSeqView({
    name: 'feedback',
    component: 'TaskFeedbackSurveyView',
    meta: { setDone: true },
  })

  // Thanks / completion page
  timeline.pushSeqView({
    name: 'thanks',
    component: 'ThanksView',
    meta: {
      requiresDone: true,
      resetApp: api.getConfig('allowRepeats'),
    },
  })

  // Withdraw page (shown if participant withdraws mid-experiment)
  timeline.registerView({
    name: 'withdraw',
    component: 'WithdrawView',
    meta: {
      requiresWithdraw: true,
      resetApp: api.getConfig('allowRepeats'),
    },
  })

  timeline.build()
  return timeline
}
