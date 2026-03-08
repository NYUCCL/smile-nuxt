import { defineNuxtPlugin } from '#app'
import createTimeline from '~/design' // resolves to consumer's design.js
import useAPI from '../composables/useAPI'

// eslint-disable-next-line no-unused-vars
export default defineNuxtPlugin((_nuxtApp) => {
  const api = useAPI()
  const timeline = createTimeline(api)
  return { provide: { timeline } }
})
