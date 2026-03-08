<script setup>
const api = useViewAPI()
</script>

<template>
  <ConstrainedTaskWindow
    variant="ghost"
    :responsive-u-i="api.config.responsiveUI"
    :width="api.config.windowsizerRequest.width"
    :height="api.config.windowsizerRequest.height"
  >
    <h1 class="text-3xl font-bold mb-4">
      Task
    </h1>
    <p class="mb-2">
      This is a placeholder task page. Replace with your experiment component.
    </p>
    <br>
    <Button
      size="lg"
      @click="api.goNextView()"
    >
      Next: Debrief
    </Button>
  </ConstrainedTaskWindow>
</template>
