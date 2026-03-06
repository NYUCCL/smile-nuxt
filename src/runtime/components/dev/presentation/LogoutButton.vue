<script setup>
import { ref, onMounted } from 'vue'

const isLoggedIn = ref(false)

onMounted(async () => {
  try {
    const result = await $fetch('/api/auth/session')
    isLoggedIn.value = result?.authenticated === true
  } catch {
    isLoggedIn.value = false
  }
})

async function logout() {
  try {
    await $fetch('/api/auth/logout', { method: 'POST' })
  } catch {}
  window.location.href = '/dev-login'
}
</script>

<template>
  <TooltipProvider v-if="isLoggedIn">
    <Tooltip>
      <TooltipTrigger as-child>
        <Button size="menu" variant="outline" @click="logout">
          <i-lucide-log-out />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Logout</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
