<script setup>
const api = useAPI()

const showStatusBar = computed(() => {
  const routeName = api.currentRouteName()
  return routeName !== 'recruit' && routeName !== 'presentation_home' && api.config.mode !== 'presentation'
})
</script>

<template>
  <StatusBar v-if="showStatusBar" />
</template>
