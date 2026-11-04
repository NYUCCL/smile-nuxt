<script setup>
/**
 * Marks its children as dev tools UI, so menus and popovers they open (which
 * render outside, at the end of <body>) use the dev tools' colors.
 * Renders nothing of its own. See composables/useDevScope.js.
 */
import { provideDevScope } from '../../composables/useDevScope'

provideDevScope()
</script>

<template>
  <slot />
</template>
