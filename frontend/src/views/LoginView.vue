<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import { apiFetch } from '../lib/api'

// Bound (not a static src) so the SFC compiler serves it from public/ as-is.
const LOGO_URL = '/logo.jpg'

const username = ref('')
const password = ref('')
const submitting = ref(false)

const { error, login, checkSession } = useAuth()
const router = useRouter()
const route = useRoute()

const googleEnabled = ref(false)
const googleWaiting = ref(false)

// The popup tells this window the result over a same-origin channel: Google's pages may sever window.opener.
const channel = new BroadcastChannel('google-signin')
channel.onmessage = async ({ data }) => {
  googleWaiting.value = false
  if (data !== true) return router.replace({ query: { error: 'google' } })
  await checkSession() // the router guard skips /auth/me once `checked`, so refresh the user here
  router.push({ name: 'admin-home' })
}
onUnmounted(() => channel.close())

function openGooglePopup(event) {
  const popup = window.open('/api/auth/google/login?popup=1', 'google-signin', 'popup,width=500,height=650')
  if (!popup || popup.closed) return // blocked: the link's own full-page navigation is the fallback
  event.preventDefault()
  googleWaiting.value = true
  if (route.query.error) router.replace({ query: {} })
}

onMounted(async () => {
  const popupResult = route.query.google_popup
  if (popupResult) {
    channel.postMessage(popupResult === 'ok')
    window.close()
    // Still open (not script-closable)? Behave like the full-page flow in this window.
    if (popupResult === 'ok') {
      await checkSession()
      return router.replace({ name: 'admin-home' })
    }
    return router.replace({ query: { error: 'google' } })
  }
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

    <!-- Opens a popup; the href is the full-page fallback when popups are blocked. -->
    <a v-if="googleEnabled" href="/api/auth/google/login" class="btn-secondary w-full" @click="openGooglePopup">
      כניסה עם Google
    </a>
    <p v-if="googleWaiting" class="text-sm text-muted text-center" role="status">ממתין לכניסה בחלון Google…</p>
    <p v-if="route.query.error === 'google'" class="error-text" role="alert">
      הכניסה עם Google נכשלה או שהחשבון אינו מורשה
    </p>
    </div>
  </section>
</template>
