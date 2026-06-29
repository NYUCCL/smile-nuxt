<script setup>
// Benign full-view override: a local component with the same name as the
// built-in `AdvertisementView`. Because the timeline references it by string,
// this should replace the built-in welcome page entirely (the intended,
// supported override path).
const probe = useOverrideProbe()
</script>

<template>
  <div data-testid="ad-override" class="ad-override">
    <h1 data-testid="ad-marker">OVERRIDE_AD_MARKER</h1>
    <p data-testid="probe-value">probe:{{ probe }}</p>

    <!-- Resolves to the local Button override below (and, per the warning, to
         SMILE's built-in views too). -->
    <Button data-testid="ad-button">override-ad-button</Button>

    <img
      data-testid="public-img"
      src="/test-override.png"
      alt="public override image"
      width="40"
    >
  </div>
</template>

<style scoped>
.ad-override {
  padding: 2rem;
}
</style>
