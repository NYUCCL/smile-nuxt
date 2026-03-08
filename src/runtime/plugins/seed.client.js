/**
 * @fileoverview Client-only plugin that initializes the global random seed.
 * Extracted from smilestore.js module-scope code to avoid running during SSR.
 *
 * This plugin reads seed state from the store (cookieState + localState),
 * calls seedrandom() to set the global Math.random seed, and writes
 * the seedID/seedSet back to the store if newly generated.
 *
 * Must run AFTER store-sync.client.js so localState is patched from localStorage.
 */
import { defineNuxtPlugin } from '#imports'
import { v4 as uuidv4 } from 'uuid'
import _seedrandom from 'seedrandom'
import useSmileStore from '../stores/smilestore'

const seedrandom = _seedrandom.default || _seedrandom

export default defineNuxtPlugin(() => {
  const store = useSmileStore()

  const useSeed = store.localState.useSeed
  const seedSet = store.cookieState.seedSet
  const existingSeedID = store.cookieState.seedID

  let seed
  if (useSeed) {
    if (seedSet && existingSeedID) {
      seed = existingSeedID
    }
    else {
      seed = uuidv4()
    }
  }
  else {
    seed = null
  }

  if (seed) {
    seedrandom(seed, { global: true })

    if (!seedSet || existingSeedID !== seed) {
      store.cookieState.seedID = seed
      store.cookieState.seedSet = true
    }
  }
})
