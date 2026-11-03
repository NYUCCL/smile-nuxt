<script setup>
import { Presentation } from 'lucide-vue-next'
/**
 * @fileoverview Navigation bar component for presentation mode
 * Provides a clean, minimal navigation interface with presentation controls
 */

// Component imports - all used
import RouteInfoButton from '../navbar/ViewInfoButtonGroup.vue'
import ResetButton from './PresentationModeResetButton.vue'
import QRCodeButton from './QRCodeButton.vue'
import DarkModeButton from './DarkModeButton.vue'
import LogoutButton from './LogoutButton.vue'
import DevModeLabel from '../navbar/DevModeLabel.vue'

defineProps({
  hideDarkMode: { type: Boolean, default: false },
})
</script>

<template>
  <!-- Presentation mode's top bar: same layout and buttons as developer mode's -->
  <nav class="flex items-center justify-between gap-4 w-full border-b border-sd-line h-9 px-3 text-xs">
    <DevModeLabel
      :icon="Presentation"
      label="Presentation mode"
      short="Present"
    />

    <div class="flex items-center gap-1 flex-shrink-0">
      <LogoutButton />
      <!-- Hidden when embedded in the dev layout: the app menu has the theme button -->
      <DarkModeButton v-if="!hideDarkMode" />
      <QRCodeButton />
      <ResetButton />
      <div class="sd-toolbar-rule hidden md:block" />
      <div class="hidden md:flex items-center">
        <RouteInfoButton />
      </div>
    </div>
  </nav>
</template>
