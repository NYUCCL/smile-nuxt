<script setup>
/**
 * @fileoverview QR code button component for presentation mode
 * Provides a dropdown menu with QR code display and download functionality
 */

// Icon imports

// UI component imports
</script>

<template>
  <!-- QR code dropdown menu -->
  <DropdownMenu>
    <!-- Dropdown trigger button -->
    <DropdownMenuTrigger as-child>
      <Button size="menu" variant="outline">
        <i-lucide-qr-code />
      </Button>
    </DropdownMenuTrigger>
    <!-- Dropdown content -->
    <DropdownMenuContent class="w-80 p-4" align="end">
      <div class="space-y-3">
        <!-- Header section -->
        <div>
          <h3 class="text-sm font-semibold">QR Code</h3>
          <p class="text-xs text-muted-foreground mt-1">
            Use the QR code to quickly access the current page from a mobile device. Can be downloaded as a .svg to add
            to posters and talks.
          </p>
        </div>
        <!-- QR code image display -->
        <div class="flex justify-center">
          <img src="/qr.svg" alt="QR Code" class="w-48 h-48" />
        </div>
        <!-- Download button -->
        <div class="flex justify-end">
          <Button variant="outline" size="sm" as-child>
            <a href="qr.svg" download="qr.svg" class="flex items-center gap-2">
              <i-lucide-download class="size-3" />
              <span>Download QR</span>
            </a>
          </Button>
        </div>
      </div>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
