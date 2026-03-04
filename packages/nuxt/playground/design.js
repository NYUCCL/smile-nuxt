/**
 * @file design.js
 * @description Configures the overall logic and timeline of the experiment.
 * Full playground design matching the original SPA design.js with all
 * components including stroop, quiz, randomized branching, etc.
 *
 * @module design
 */

import { markRaw } from 'vue'

// Import playground user components
// In Nuxt, playground/components/ are auto-imported in .vue files,
// but design.js is a plain .js file so we need explicit imports.
import InformedConsentText from './components/InformedConsentText.vue'
import DebriefText from './components/DebriefText.vue'
import StroopExpView from './components/StroopExpView.vue'
import { QUIZ_QUESTIONS } from './components/quizQuestions'

export default function createTimeline(api) {
  const timeline = new Timeline(api)

  // Set runtime configuration options
  api.setRuntimeConfig('allowRepeats', false)
  api.setRuntimeConfig('colorMode', 'light')
  api.setRuntimeConfig('responsiveUI', true)
  api.setRuntimeConfig('windowsizerRequest', { width: 800, height: 600 })
  api.setRuntimeConfig('windowsizerAggressive', true)
  api.setRuntimeConfig('anonymousMode', false)
  api.setRuntimeConfig('labURL', 'https://gureckislab.org')
  api.setRuntimeConfig('brandLogoFn', 'universitylogo.png')
  api.setRuntimeConfig('maxWrites', 1000)
  api.setRuntimeConfig('minWriteInterval', 2000)
  api.setRuntimeConfig('autoSave', true)
  api.setRuntimeConfig('payrate', '$15USD/hour prorated for estimated completion time + performance related bonus')
  api.setRuntimeConfig('estimated_time', '30-40 minutes')

  // Set the informed consent text component
  api.setAppComponent('informed_consent_text', InformedConsentText)

  // Between-subjects condition assignment
  api.randomAssignCondition({
    instructionsVersion: ['1', '2', '3'],
    weights: [2, 1, 1],
  })

  // --- Timeline definition ---

  // Welcome screen for non-referral
  timeline.pushSeqView({
    path: '/welcome',
    name: 'welcome_anonymous',
    component: 'AdvertisementView',
    meta: {
      prev: undefined,
      next: 'consent',
      allowAlways: true,
      requiresConsent: false,
    },
  })

  // Welcome screen for referral from a service (e.g., prolific)
  // Note: processQuery/beforeEnter are SPA-specific; in Nuxt, query parsing
  // is handled differently (middleware or the component itself)
  timeline.pushSeqView({
    path: '/welcome/:service',
    name: 'welcome_referred',
    component: 'AdvertisementView',
    meta: {
      prev: undefined,
      next: 'consent',
      allowAlways: true,
      requiresConsent: false,
    },
  })

  // MTurk recruit page (special page that loads in the iframe on mturk.com)
  timeline.registerView({
    name: 'mturk',
    component: 'MTurkRecruitView',
    props: {
      estimated_time: api.getConfig('estimated_time'),
      payrate: api.getConfig('payrate'),
    },
    meta: { allowAlways: true, requiresConsent: false },
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

  // Demographic survey
  timeline.pushSeqView({
    name: 'demograph',
    component: 'DemographicSurveyView',
  })

  // Window sizer
  timeline.pushSeqView({
    name: 'windowsizer',
    component: 'WindowSizerView',
  })

  // Instructions
  timeline.pushSeqView({
    name: 'instructions',
    component: 'InstructionsView',
  })

  // Instructions quiz
  timeline.pushSeqView({
    name: 'quiz',
    component: 'InstructionsQuiz',
    props: {
      questions: QUIZ_QUESTIONS,
      returnTo: 'instructions',
      randomizeQandA: true,
    },
  })

  // Main experiment (demo task)
  timeline.pushSeqView({
    name: 'exp',
    path: '/experiment',
    component: 'ExpView',
  })

  // Randomized branching routes
  // Routes must be registered first
  timeline.registerView({
    name: 'number',
    component: 'FavoriteNumber',
  })

  timeline.registerView({
    name: 'color',
    component: 'FavoriteColor',
  })

  timeline.pushRandomizedNode({
    name: 'RandomSplit',
    options: [['number'], ['color']],
  })

  // Stroop experiment (custom component)
  timeline.pushSeqView({
    name: 'stroop',
    component: markRaw(StroopExpView),
  })

  // Debriefing form
  timeline.pushSeqView({
    name: 'debrief',
    component: 'DebriefView',
    props: {
      debriefText: markRaw(DebriefText),
    },
  })

  // Device survey
  timeline.pushSeqView({
    name: 'device',
    component: 'DeviceSurveyView',
  })

  // Task feedback survey (this is the last form)
  timeline.pushSeqView({
    name: 'feedback',
    component: 'TaskFeedbackSurveyView',
    meta: { setDone: true },
  })

  // Thanks/submit page
  timeline.pushSeqView({
    name: 'thanks',
    component: 'ThanksView',
    meta: {
      requiresDone: true,
      resetApp: api.getConfig('allowRepeats'),
    },
  })

  // Withdraw page (special page for withdrawing from the study)
  timeline.registerView({
    name: 'withdraw',
    meta: {
      requiresWithdraw: true,
      resetApp: api.getConfig('allowRepeats'),
    },
    component: 'WithdrawView',
  })

  timeline.build()
  return timeline
}
