<template>
  <div class="space-y-4">
    <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
      <Button><i-lucide-plus class="mr-2 h-4 w-4" />Add Item</Button>
      <Button variant="primary"><i-lucide-download class="mr-2 h-4 w-4" />Download</Button>
      <Button variant="success"><i-lucide-check class="mr-2 h-4 w-4" />Complete</Button>
      <Button variant="warning"><i-lucide-triangle-alert class="mr-2 h-4 w-4" />Warning</Button>
      <Button variant="danger"><i-lucide-trash class="mr-2 h-4 w-4" />Delete</Button>
      <Button variant="info"><i-lucide-info class="mr-2 h-4 w-4" />Info</Button>
      <Button variant="outline"><i-lucide-settings class="mr-2 h-4 w-4" />Settings</Button>
      <Button variant="ghost"><i-lucide-pencil class="mr-2 h-4 w-4" />Edit</Button>
    </div>
  </div>
</template>

<script setup>
import { Button } from '@/runtime/components/ui/button'
</script>
