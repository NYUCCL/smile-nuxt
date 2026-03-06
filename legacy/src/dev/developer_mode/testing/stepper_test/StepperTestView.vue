<script setup>
import useAPI from '@/core/composables/useAPI'
import StateTreeViewer from '@/dev/developer_mode/StateTreeViewer.vue'
import { computed } from 'vue'
import { defineComponent, h } from 'vue'

const api = useAPI()

const Stimulus = defineComponent({
  name: 'Stimulus',
  template: `
    <div>
      Stim
    </div>
  `,
})

const Feedback = defineComponent({
  name: 'Feedback',
  template: `
    <div>
      Feedback
    </div>
  `,
})

const stepper = api.useStepper()

const trials = stepper
  .spec()
  .append([{ type: Stimulus }, { type: Feedback }])
  .repeat(3)
stepper.addSpec(trials)

const trials2 = stepper.t
  .append([
    { type: 'trial', id: 1 },
    { type: 'trial', id: 2 },
  ])
  .forEach((trial) => {
    let index = 0
    trial
      .append([
        { type: 'step', id: index++ },
        { type: 'step', id: index++ },
      ])
      .forEach((step) => {
        for (let i = 0; i < 5; i++) {
          step.append([{ type: 'step', id: i }])
        }
      })
  })
stepper.addSpec(trials2)

function next() {
  if (stepper.index >= stepper.length) {
    api.goNextView()
  }
  stepper.goNextStep()
}

function adddata() {
  const trials = stepper.spec().append([{ type: 'added', id: stepper.nrows - 2 }])
  stepper.addSpec(trials)
}
</script>

<template>
  <div class="page">
    <h1 class="title">Stepper Test</h1>
    <div class="tree-diagram-text">
      <b>Path</b>: {{ stepper.paths }}<br />
      <b>Index</b>: {{ stepper.index }}<br />
      <b>Data on Path</b>: {{ stepper.stepData }}<br />
    </div>
    <component :is="stepper.stepData?.type" />

    <br />
    <button @click="adddata()" class="button is-small is-warning m-2">Add Data</button>

    <button @click="next()" class="button is-small is-success m-2">Next</button>

    <div class="viewer-container">
      <StateTreeViewer />
    </div>
  </div>
</template>

<style scoped>
.viewer-container {
  width: 400px;
  margin: 0 auto;
  border: 1px solid #c5c5c5;
  border-top: none;
}
.tree-diagram-text {
  text-align: left;
  width: 400px;
  margin: 0 auto;
  font-family: monospace;
}
</style>
