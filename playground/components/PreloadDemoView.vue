<script setup>
/**
 * A view for the preloading tests (test/e2e/preload.spec.ts, #30). Its files
 * are listed under `preload` in design.js, so the page shows it only once
 * they are in memory. It uses them every way a view can:
 * - an <img> with the path written in the template
 * - an <img> from api.getPublicUrl()
 * - a CSS background image
 * - a <video> and an <audio> from api.asset()
 * - a JSON file fetched from api.asset()
 */
import { onMounted, ref } from 'vue'

const api = useAPI()

// WebM where the browser plays it, MP4 otherwise (see design.js)
const clip = document.createElement('video').canPlayType('video/webm; codecs="vp8, opus"')
  ? 'preload-test/clip.webm'
  : 'preload-test/clip.mp4'

const trials = ref(null)
const shownAt = ref(null)

onMounted(async () => {
  shownAt.value = Math.round(performance.now())
  const response = await fetch(api.asset('preload-test/trials.json'))
  trials.value = await response.json()
})
</script>

<template>
  <div
    class="p-6 space-y-4"
    data-testid="preload-demo"
  >
    <h1 class="text-xl font-semibold">
      Preload test
    </h1>
    <div class="flex gap-4">
      <img
        data-testid="img-plain"
        src="/preload-test/a.png"
        alt="a"
      >
      <img
        data-testid="img-public-url"
        :src="api.getPublicUrl('preload-test/b.png')"
        alt="b"
      >
      <img
        data-testid="img-pattern"
        :src="api.asset('preload-test/set/c.png')"
        alt="c"
      >
      <div
        data-testid="css-background"
        class="size-24"
        :style="{ backgroundImage: `url(${api.getPublicUrl('preload-test/bg.png')})` }"
      />
    </div>
    <video
      data-testid="video"
      :src="api.asset(clip)"
      :data-file="clip"
      muted
      playsinline
      controls
    />
    <audio
      data-testid="audio"
      :src="api.asset('preload-test/tone.wav')"
      controls
    />
    <p data-testid="trials">
      {{ trials ? trials.trials.length : 'loading' }} trials
    </p>
    <p data-testid="shown-at">
      {{ shownAt }}
    </p>
  </div>
</template>
