<script setup>
// Deliberately-bad primitive shadow: a local component named `Button` collides
// with SMILE's built-in shadcn `<Button>`. Per the warn-not-block policy this
// override still applies everywhere (including inside built-in views), and the
// module emits a build warning. We stamp an attribute so the test can detect
// where this override reached.
defineOptions({ inheritAttrs: false })
</script>

<template>
  <button data-override-button="yes" v-bind="$attrs">
    <slot />
  </button>
</template>
