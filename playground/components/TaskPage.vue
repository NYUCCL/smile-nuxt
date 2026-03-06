<script setup>
const api = useViewAPI()
</script>

<template>
  <ConstrainedTaskWindow
    variant="ghost"
    :responsiveUI="api.config.responsiveUI"
    :width="api.config.windowsizerRequest.width"
    :height="api.config.windowsizerRequest.height"
  >
    <h1 class="text-3xl font-bold mb-4">Task</h1>
    <p class="mb-2">This is a placeholder task page. Replace with your experiment component.</p>
    <br />
    <Button @click="api.goNextView()" size="lg">Next: Debrief</Button>
  </ConstrainedTaskWindow>
</template>
