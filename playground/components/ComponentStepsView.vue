<script setup>
import TrialTypeA from './TrialTypeA.vue'
import TrialTypeB from './TrialTypeB.vue'

const api = useViewAPI()

// Create steps with component references in the `type` field
// This tests that Vue components survive serialization/deserialization
api.steps.append([
  { id: 'step-a1', type: TrialTypeA, label: 'First A trial' },
  { id: 'step-b1', type: TrialTypeB, label: 'First B trial' },
  { id: 'step-a2', type: TrialTypeA, label: 'Second A trial' },
])

function nextStep() {
  if (api.hasNextStep()) {
    api.goNextStep()
  } else {
    api.goNextView()
  }
}
</script>

<template>
  <ConstrainedTaskWindow
    variant="ghost"
    :responsive-u-i="api.config.responsiveUI"
    :width="api.config.windowsizerRequest?.width"
    :height="api.config.windowsizerRequest?.height"
  >
    <div class="text-center p-8">
      <p id="step-label" class="text-lg mb-4">
        {{ api.stepData?.label || 'No label' }}
      </p>

      <!-- Render the component from step data if available -->
      <component
        :is="api.dataAlongPath?.[api.dataAlongPath.length - 1]?.type"
        v-if="api.dataAlongPath?.[api.dataAlongPath.length - 1]?.type"
      />

      <p id="step-index" class="text-sm text-muted-foreground mt-4">
        Step {{ api.stepIndex + 1 }} of {{ api.nSteps }}
      </p>

      <Button
        id="next-step"
        class="mt-4"
        size="lg"
        @click="nextStep()"
      >
        Next Step
      </Button>
    </div>
  </ConstrainedTaskWindow>
</template>
