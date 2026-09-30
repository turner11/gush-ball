<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'

// Bound (not a static src) so the SFC compiler serves it from public/ as-is.
const LOGO_URL = '/logo.jpg'

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
  <section class="mx-auto mt-6 max-w-sm sm:mt-16">
    <div class="card space-y-4">
    <img :src="LOGO_URL" alt="" class="mx-auto h-16" />
    <h1 class="page-title text-center">כניסת מנהל</h1>

    <form class="space-y-3" @submit.prevent="onSubmit">
      <div>
        <label for="username" class="field-label">שם משתמש</label>
        <input
          id="username"
          v-model="username"
          type="text"
          autocomplete="username"
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
          autocomplete="current-password"
          required
          class="field-input"
        />
      </div>

      <p v-if="error" class="error-text" role="alert">{{ error }}</p>

      <button type="submit" :disabled="submitting" class="btn-primary w-full">
        {{ submitting ? 'מתחבר…' : 'כניסה' }}
      </button>
    </form>
    </div>
  </section>
</template>
