import { defineNuxtPlugin } from '#app'
import createTimeline from '~/design' // resolves to consumer's design.js
import useAPI from '../composables/useAPI'

export default defineNuxtPlugin((nuxtApp) => {
  const api = useAPI()
  const timeline = createTimeline(api)
  return { provide: { timeline } }
})
