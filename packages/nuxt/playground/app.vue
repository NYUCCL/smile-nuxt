<template>
  <div style="font-family: sans-serif; max-width: 600px; margin: 2rem auto; padding: 1rem;">
    <h1>SMILE Nuxt Module Playground</h1>
    <p>Phase 3: Composables migrated with auto-imports.</p>

    <h2>Auto-Import Verification</h2>
    <p>These composables are auto-imported by the SMILE module (no explicit import needed):</p>
    <table style="border-collapse: collapse; width: 100%;">
      <tr v-for="(available, name) in composableStatus" :key="name"
          style="border-bottom: 1px solid #eee;">
        <td style="padding: 4px 8px; font-family: monospace;">{{ name }}</td>
        <td style="padding: 4px 8px;">
          <span v-if="available" style="color: green;">available</span>
          <span v-else style="color: red;">missing</span>
        </td>
      </tr>
    </table>

    <h2>SmileAPI Class Import</h2>
    <p>
      SmileAPI class (named export):
      <strong>{{ smileAPIStatus }}</strong>
    </p>
    <p>
      SmileAPI methods present:
      <span style="font-family: monospace;">{{ smileAPIMethods.join(', ') }}</span>
    </p>

    <h2>Stepper Demo (Phase 2)</h2>
    <p>StepState tree with 3 steps:</p>
    <pre>{{ treeDiagram }}</pre>
    <p>Current path: <strong>{{ currentPath }}</strong></p>
    <p>
      <button @click="goPrev" :disabled="!hasPrev">Prev</button>
      <button @click="goNext" :disabled="!hasNext">Next</button>
      <button @click="reset">Reset</button>
    </p>

    <h2>Randomization Demo (Phase 2)</h2>
    <p>Random int (1-100): <strong>{{ randomValue }}</strong></p>
    <p>Shuffled [1,2,3,4,5]: <strong>{{ shuffledArray }}</strong></p>
    <button @click="reroll">Re-roll</button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { StepState } from '../src/runtime/core/stepper/StepState.js'
import { randomInt, shuffle } from '../src/runtime/utils/randomization.js'
// Named export — verify the SmileAPI class itself is importable
import { SmileAPI } from '../src/runtime/composables/useAPI.js'

// --- Phase 3: Auto-Import Verification ---
// Reference each auto-imported composable directly so Nuxt's unimport transform
// injects the import statements. (Note: `typeof x` does NOT trigger auto-imports.)
const _autoImported = {
  useAPI,
  useViewAPI,
  useTimeline,
  useStepper,
  useSmileColorMode,
  getColorMode,
  setColorMode,
}

const composableStatus = ref({})

onMounted(() => {
  composableStatus.value = Object.fromEntries(
    Object.entries(_autoImported).map(([name, fn]) => [name, typeof fn === 'function'])
  )
})

// Verify SmileAPI class is a real constructor with expected methods
const smileAPIStatus = typeof SmileAPI === 'function' ? 'class loaded' : 'missing'
const smileAPIMethods = Object.getOwnPropertyNames(SmileAPI.prototype).filter(
  (m) => m !== 'constructor'
)

// --- Stepper Demo (Phase 2) ---
const stepper = new StepState()
stepper.push('step-1', { label: 'Welcome' })
stepper.push('step-2', { label: 'Task' })
stepper.push('step-3', { label: 'Thanks' })

const stepperVersion = ref(0)

const treeDiagram = computed(() => {
  stepperVersion.value // reactive dependency
  return stepper.treeDiagram
})

const currentPath = computed(() => {
  stepperVersion.value
  return stepper.currentPathString || '(root)'
})

const hasNext = computed(() => {
  stepperVersion.value
  return stepper.hasNext()
})

const hasPrev = computed(() => {
  stepperVersion.value
  return stepper.hasPrev()
})

function goNext() {
  stepper.next()
  stepperVersion.value++
}

function goPrev() {
  stepper.prev()
  stepperVersion.value++
}

function reset() {
  stepper.reset()
  stepperVersion.value++
}

// --- Randomization Demo (Phase 2) ---
const randomValue = ref(randomInt(1, 100))
const shuffledArray = ref(shuffle([1, 2, 3, 4, 5]))

function reroll() {
  randomValue.value = randomInt(1, 100)
  shuffledArray.value = shuffle([1, 2, 3, 4, 5])
}
</script>
