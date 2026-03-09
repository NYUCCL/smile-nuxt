<script setup>
import { onMounted, ref, onBeforeUnmount } from 'vue'
import { animate } from 'motion'
import useViewAPI from '../../composables/useViewAPI'

const props = defineProps({
  imageWidth: { type: [String, Number], default: 320 },
})

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
    :responsive-u-i="api.config.responsiveUI"
    :width="api.config.windowsizerRequest.width"
    :height="api.config.windowsizerRequest.height"
  >
    <img
      ref="logo"
      :src="api.config.advertisementImageFn"
      :width="props.imageWidth"
      :class="{ 'dark-aware-img': api.config.advertisementImageInvertDark }"
    >

    <h1
      ref="title"
      class="text-3xl font-bold mb-4"
    >
      Please help us understand the mind!
    </h1>

    <p>Take part in a short experiment where you play some games.</p>
    <br>

    <Button
      id="begintask"
      ref="button"
      size="lg"
      @click="finish()"
    >
      I'm ready!
    </Button>
  </ConstrainedTaskWindow>
</template>
