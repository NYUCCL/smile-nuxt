<script setup>
// A second primitive shadow that is never rendered. It exists only to verify
// the build-time shadow warning fires for it too (the runner greps the dev log).
</script>

<template>
  <input type="checkbox" data-override-checkbox="yes">
</template>
