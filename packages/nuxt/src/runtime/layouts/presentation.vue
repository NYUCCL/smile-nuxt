<template>
  <div class="presentation-container">
    <div class="presentation-mode-banner">PRESENTATION MODE</div>
    <slot />
  </div>
</template>

<style scoped>
.presentation-mode-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  background-color: #3b82f6;
  color: #fff;
  text-align: center;
  font-weight: bold;
  font-size: 0.75rem;
  padding: 2px 0;
  letter-spacing: 0.1em;
}

.presentation-container {
  padding-top: 24px;
}
</style>
