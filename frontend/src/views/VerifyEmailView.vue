<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'

import { apiFetch } from '../lib/api'

const LOGO_URL = '/logo.jpg'

const route = useRoute()
const token = route.query.token
// idle | posting | ok | invalid | taken | login | error. Verifies on click, not on mount: mail scanners prefetch links.
const state = ref(token ? 'idle' : 'invalid')

const ERRORS = {
  invalid: 'הקישור אינו תקף או שפג תוקפו',
  taken: 'כתובת האימייל כבר משויכת לחשבון אחר',
  login: 'התחברו לחשבון שאיתו נרשמתם כדי לאשר את הכתובת',
  error: 'שגיאה באימות, נסו שוב',
}

async function onConfirm() {
  state.value = 'posting'
  try {
    await apiFetch('/auth/verify-email', { method: 'POST', body: { token } })
    state.value = 'ok'
  } catch (err) {
    state.value =
      err.status === 400 ? 'invalid' : err.status === 409 ? 'taken' : err.status === 401 || err.status === 403 ? 'login' : 'error'
  }
}
</script>

<template>
  <section class="mx-auto mt-6 max-w-sm sm:mt-16">
    <div class="card space-y-4">
      <img :src="LOGO_URL" alt="" class="mx-auto h-16" />
      <h1 class="page-title text-center">אימות כתובת אימייל</h1>

      <template v-if="state === 'ok'">
        <p role="status">כתובת האימייל אומתה</p>
        <RouterLink :to="{ name: 'join' }" class="btn-primary w-full">המשך</RouterLink>
      </template>

      <template v-else>
        <p v-if="ERRORS[state]" class="error-text" role="alert">{{ ERRORS[state] }}</p>
        <p v-else class="text-center">לחצו לאישור כתובת האימייל בחשבון שלכם</p>
        <button
          v-if="state === 'idle' || state === 'posting' || state === 'error'"
          :disabled="state === 'posting'"
          class="btn-primary w-full"
          @click="onConfirm"
        >
          {{ state === 'posting' ? 'מאמת…' : 'אישור' }}
        </button>
        <RouterLink v-else :to="{ name: 'admin-login', query: state === 'login' ? { next: route.fullPath } : {} }" class="section-link">כניסה</RouterLink>
      </template>
    </div>
  </section>
</template>
