<script setup>
const api = useAPI()
const route = useRoute()

const showStatusBar = computed(() => {
  const routeName = api.currentRouteName()
  return routeName !== 'recruit' && routeName !== 'presentation_home' && !(route.path.startsWith('/presentation/') || route.path === '/presentation')
})
</script>

<template>
  <StatusBar v-if="showStatusBar" />
</template>
