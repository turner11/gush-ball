<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'

const username = ref('')
const password = ref('')
const submitting = ref(false)

const { error, login } = useAuth()
const router = useRouter()

async function onSubmit() {
  submitting.value = true
  try {
    await login(username.value, password.value)
    if (!error.value) {
      router.push({ name: 'admin-home' })
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-sm space-y-4">
    <h1 class="page-title">כניסת מנהל</h1>

    <form class="space-y-3" @submit.prevent="onSubmit">
      <div>
        <label for="username" class="field-label">שם משתמש</label>
        <input
          id="username"
          v-model="username"
          type="text"
          required
          class="field-input"
        />
      </div>

      <div>
        <label for="password" class="field-label">סיסמה</label>
        <input
          id="password"
          v-model="password"
          type="password"
          required
          class="field-input"
        />
      </div>

      <p v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>

      <button type="submit" :disabled="submitting" class="btn-primary w-full">
        כניסה
      </button>
    </form>
  </section>
</template>
