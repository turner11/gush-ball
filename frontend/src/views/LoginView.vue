<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import { apiFetch } from '../lib/api'

// Bound (not a static src) so the SFC compiler serves it from public/ as-is.
const LOGO_URL = '/logo.jpg'

const username = ref('')
const password = ref('')
const submitting = ref(false)

const { error, login } = useAuth()
const router = useRouter()
const route = useRoute()

const googleEnabled = ref(false)
onMounted(async () => {
  try {
    googleEnabled.value = (await apiFetch('/auth/options')).google === true
  } catch {
    // button just stays hidden
  }
})

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
        <label for="username" class="field-label">שם משתמש או אימייל</label>
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

    <RouterLink :to="{ name: 'admin-reset-password' }" class="section-link">שכחתי סיסמה</RouterLink>

    <!-- Plain link: Google sign-in is a full-page navigation, not a fetch. -->
    <a v-if="googleEnabled" href="/api/auth/google/login" class="btn-secondary w-full">כניסה עם Google</a>
    <p v-if="route.query.error === 'google'" class="error-text" role="alert">
      הכניסה עם Google נכשלה או שהחשבון אינו מורשה
    </p>
    </div>
  </section>
</template>
