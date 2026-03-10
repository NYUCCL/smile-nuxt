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
    var(--dev-banner-stripe-1),
    var(--dev-banner-stripe-1) 10px,
    var(--dev-banner-stripe-2) 10px,
    var(--dev-banner-stripe-2) 20px
  );
  color: var(--dev-banner-text);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: center;
  flex-shrink: 0;
}
</style>
