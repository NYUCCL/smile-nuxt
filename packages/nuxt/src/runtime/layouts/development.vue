<template>
  <div class="development-container">
    <div class="dev-mode-banner">DEV MODE</div>
    <slot />
  </div>
</template>

<style scoped>
.dev-mode-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  background-color: #f59e0b;
  color: #000;
  text-align: center;
  font-weight: bold;
  font-size: 0.75rem;
  padding: 2px 0;
  letter-spacing: 0.1em;
}

.development-container {
  padding-top: 24px;
}
</style>
