<script setup>
const isDev = import.meta.dev
</script>

<template>
  <div
    v-if="isDev"
    class="local-dev-banner"
  >
    LOCAL DEV SERVER
  </div>
</template>

<style scoped>
.local-dev-banner {
  width: 100%;
  padding: 3px 0;
  background: repeating-linear-gradient(
    -45deg,
    #facc15,
    #facc15 10px,
    #f0c000 10px,
    #f0c000 20px
  );
  color: #1a1a1a;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: center;
  flex-shrink: 0;
}

.dark .local-dev-banner {
  background: repeating-linear-gradient(
    -45deg,
    #555,
    #555 10px,
    #4a4a4a 10px,
    #4a4a4a 20px
  );
  color: #ccc;
}
</style>
