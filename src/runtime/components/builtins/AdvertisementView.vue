<script setup>
import { onMounted, ref, onBeforeUnmount } from 'vue'
import { animate } from 'motion'

const api = useViewAPI()

let timer
let clicked = false
const button = ref(null)

function wiggle() {
  if (!clicked && button.value) {
    animate(button.value.$el, { rotate: [0, 60, -60, 60, -60, 0] }, { duration: 0.75 }).finished.then(() => {
      timer = setTimeout(wiggle, 15000)
    })
  }
}

onMounted(() => {
  timer = setTimeout(wiggle, 3000)
})

function finish() {
  clicked = true
  api.preloadAllImages()
  api.preloadAllVideos()
  api.goNextView()
}

onBeforeUnmount(() => {
  clearTimeout(timer)
})
</script>

<template>
  <ConstrainedTaskWindow
    variant="ghost"
    :responsiveUI="api.config.responsiveUI"
    :width="api.config.windowsizerRequest.width"
    :height="api.config.windowsizerRequest.height"
  >
    <img ref="logo" src="/brain.svg" width="220" class="dark-aware-img" />

    <h1 ref="title" class="text-3xl font-bold mb-4">Please help us understand the mind!</h1>

    <p>Take part in a short experiment where you play some games.</p>
    <br />

    <Button ref="button" id="begintask" @click="finish()" size="lg">
      I'm ready!
    </Button>
  </ConstrainedTaskWindow>
</template>
