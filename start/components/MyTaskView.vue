<script setup>
/**
 * MyTaskView — Your custom experiment task.
 *
 * This is where your experiment logic goes. Use the SMILE API to:
 * - Record data: api.recordPageData({ response, rt })
 * - Navigate: api.goNextView()
 * - Use steps: api.steps for multi-trial tasks
 * - Randomize: api.shuffle(), api.randomInt(), api.sampleWithoutReplacement()
 *
 * See the SMILE docs for the full API reference.
 */
const api = useViewAPI()

// Example: a simple trial with a button press
const startTime = Date.now()

function handleResponse(response) {
  const rt = Date.now() - startTime

  // Record this trial's data
  api.recordPageData({
    response,
    rt,
    timestamp: new Date().toISOString(),
  })

  // Move to the next page in the timeline
  api.goNextView()
}
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-[60vh] gap-8">
    <h2 class="text-2xl font-bold">My Experiment Task</h2>
    <p class="text-lg text-muted-foreground max-w-md text-center">
      Replace this with your actual experiment.
      Edit <code class="bg-muted px-1 rounded">components/MyTaskView.vue</code> to get started.
    </p>

    <div class="flex gap-4">
      <Button variant="outline" size="lg" @click="handleResponse('left')">
        Left
      </Button>
      <Button variant="default" size="lg" @click="handleResponse('right')">
        Right
      </Button>
    </div>
  </div>
</template>
