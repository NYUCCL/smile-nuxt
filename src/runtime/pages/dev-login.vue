<template>
  <div class="dev-login">
    <div class="login-card">
      <h2>Developer Access</h2>
      <p>Enter the dev password to access dev/presentation mode.</p>
      <form @submit.prevent="login">
        <input
          v-model="password"
          type="password"
          placeholder="Password"
          autofocus
          :disabled="loading"
        >
        <button
          type="submit"
          :disabled="loading"
        >
          {{ loading ? 'Logging in...' : 'Login' }}
        </button>
        <p
          v-if="error"
          class="error"
        >
          {{ error }}
        </p>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { navigateTo, useRoute } from '#imports'

const route = useRoute()
const password = ref('')
const error = ref('')
const loading = ref(false)

// Remember where the user was trying to go (passed as ?redirect= query param)
const redirectTo = route.query.redirect || '/dev/'

async function login() {
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { password: password.value },
    })
    await navigateTo(redirectTo, { replace: true, external: true })
  }
  catch (err) {
    error.value = err.statusCode === 401 ? 'Invalid password' : 'Login failed'
  }
  finally {
    loading.value = false
  }
}
</script>

<style scoped>
.dev-login {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--muted);
  font-family: system-ui, -apple-system, sans-serif;
}

.login-card {
  background: var(--background);
  border-radius: 8px;
  padding: 2rem;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  max-width: 400px;
  width: 100%;
}

.login-card h2 {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
  color: var(--foreground);
}

.login-card p {
  margin: 0 0 1rem;
  color: var(--muted-foreground);
  font-size: 0.875rem;
}

form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

input {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 1rem;
  background: var(--background);
  color: var(--foreground);
}

button {
  padding: 0.5rem 1rem;
  background: var(--primary);
  color: var(--primary-foreground);
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
}

button:hover:not(:disabled) {
  background: var(--primary);
  opacity: 0.85;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  color: var(--destructive);
  margin: 0;
}
</style>
