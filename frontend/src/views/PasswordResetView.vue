<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

import { apiFetch } from '../lib/api'

const LOGO_URL = '/logo.jpg'

const route = useRoute()
const token = computed(() => route.query.token)

const email = ref('')
const password = ref('')
const submitting = ref(false)
const message = ref('')
const error = ref('')
const done = ref(false)

async function onSubmit() {
  submitting.value = true
  error.value = ''
  try {
    if (token.value) {
      await apiFetch('/auth/reset-password', { method: 'POST', body: { token: token.value, password: password.value } })
    } else {
      await apiFetch('/auth/forgot-password', { method: 'POST', body: { email: email.value } })
      message.value = 'אם הכתובת רשומה, נשלח אליה קישור לאיפוס סיסמה'
    }
    done.value = true
  } catch (err) {
    if (err.status === 429) error.value = 'יותר מדי בקשות, נסה שוב מאוחר יותר'
    else if (err.status === 400 && token.value) error.value = 'הקישור אינו תקף או שפג תוקפו'
    else error.value = 'שגיאת התחברות, נסה שוב'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="mx-auto mt-6 max-w-sm sm:mt-16">
    <div class="card space-y-4">
      <img :src="LOGO_URL" alt="" class="mx-auto h-16" />
      <h1 class="page-title text-center">איפוס סיסמה</h1>

      <template v-if="done">
        <p>{{ token ? 'הסיסמה עודכנה' : message }}</p>
        <RouterLink v-if="token" :to="{ name: 'admin-login' }" class="btn-primary w-full">כניסה</RouterLink>
      </template>

      <form v-else class="space-y-3" @submit.prevent="onSubmit">
        <div v-if="token">
          <label for="password" class="field-label">סיסמה חדשה</label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
            class="field-input"
          />
        </div>
        <div v-else>
          <label for="email" class="field-label">אימייל</label>
          <input id="email" v-model="email" type="email" autocomplete="email" required class="field-input" />
        </div>

        <p v-if="error" class="error-text" role="alert">{{ error }}</p>

        <button type="submit" :disabled="submitting" class="btn-primary w-full">
          {{ token ? 'עדכון סיסמה' : 'שליחת קישור' }}
        </button>
      </form>
    </div>
  </section>
</template>
