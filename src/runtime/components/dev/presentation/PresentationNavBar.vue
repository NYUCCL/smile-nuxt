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
</script>

<template>
  <!-- Main navigation container -->
  <nav class="flex items-center justify-between w-full border-b min-h-[36px] max-h-[36px] text-sm px-2">
    <!-- Left section - Presentation mode branding -->
    <div class="flex items-center flex-shrink-0 px-2 py-1 rounded">
      <div class="flex items-center">
        <!-- Desktop presentation mode label -->
        <div class="hidden sm:block">
          <div class="flex items-center text-xs font-normal">
            <Presentation class="size-4 mr-1" /><b>PRESENTATION MODE</b>
          </div>
        </div>
        <!-- Mobile presentation mode label -->
        <div class="block sm:hidden">
          <div class="flex items-center text-xs font-semibold">
            <Presentation class="size-4 mr-1" /><b>PRES</b>
          </div>
        </div>
      </div>
    </div>

    <!-- Middle section - Centered content area -->
    <div class="flex items-center justify-center flex-1 min-w-0 px-2 py-1 rounded">
      <div class="flex items-center space-x-2">
        <!-- Middle content placeholder -->
        <div class="text-xs text-gray-600">
          <!-- Middle content placeholder -->
        </div>
      </div>
    </div>

    <!-- Right section - Control buttons -->
    <div class="flex items-center flex-shrink-0 px-1 py-1 rounded">
      <div class="flex items-center space-x-2.5 border-gray-300 pl-4 rounded-l">
        <!-- Logout button (only when authenticated) -->
        <div class="flex items-center">
          <LogoutButton />
        </div>

        <!-- Dark mode toggle button -->
        <div class="flex items-center">
          <DarkModeButton />
        </div>

        <!-- QR code generation button -->
        <div class="flex items-center">
          <QRCodeButton />
        </div>

        <!-- Reset to main page button -->
        <div class="flex items-center">
          <ResetButton />
        </div>

        <!-- Route information buttons (desktop only) -->
        <div class="hidden md:flex items-center">
          <RouteInfoButton />
        </div>
      </div>
    </div>
  </nav>
</template>
