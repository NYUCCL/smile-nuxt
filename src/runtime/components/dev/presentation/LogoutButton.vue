<script setup>
import { LogOut } from 'lucide-vue-next'
import { ref, onMounted } from 'vue'

const isLoggedIn = ref(false)

onMounted(async () => {
  try {
    const result = await $fetch('/api/auth/session')
    isLoggedIn.value = result?.authenticated === true
  }
  catch {
    isLoggedIn.value = false
  }
})

async function logout() {
  try {
    await $fetch('/api/auth/logout', { method: 'POST' })
  }
  catch { /* empty */ }
  window.location.href = '/dev-login'
}
</script>

<template>
  <TooltipProvider v-if="isLoggedIn">
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          size="menu"
          variant="outline"
          @click="logout"
        >
          <LogOut />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Logout</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
