<template>
  <div style="font-family: sans-serif; max-width: 600px; margin: 2rem auto; padding: 1rem;">
    <h1>SMILE Nuxt Module Playground</h1>
    <p>Phase 2: Core runtime files have been copied to the module.</p>

    <h2>Stepper Demo</h2>
    <p>StepState tree with 3 steps:</p>
    <pre>{{ treeDiagram }}</pre>
    <p>Current path: <strong>{{ currentPath }}</strong></p>
    <p>
      <button @click="goPrev" :disabled="!hasPrev">Prev</button>
      <button @click="goNext" :disabled="!hasNext">Next</button>
      <button @click="reset">Reset</button>
    </p>

    <h2>Randomization Demo</h2>
    <p>Random int (1-100): <strong>{{ randomValue }}</strong></p>
    <p>Shuffled [1,2,3,4,5]: <strong>{{ shuffledArray }}</strong></p>
    <button @click="reroll">Re-roll</button>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { StepState } from '../src/runtime/core/stepper/StepState.js'
import { randomInt, shuffle } from '../src/runtime/utils/randomization.js'

// --- Stepper Demo ---
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

// --- Randomization Demo ---
const randomValue = ref(randomInt(1, 100))
const shuffledArray = ref(shuffle([1, 2, 3, 4, 5]))

function reroll() {
  randomValue.value = randomInt(1, 100)
  shuffledArray.value = shuffle([1, 2, 3, 4, 5])
}
</script>
