<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'

import { safeNext, useAuth } from '../composables/useAuth'
import { apiFetch } from '../lib/api'

const LOGO_URL = '/logo.jpg'

const { user } = useAuth()
const next = safeNext(useRoute().query.next) // where the visitor was headed before signing up

const username = ref('')
const email = ref('')
const password = ref('')
const confirm = ref('')
const submitting = ref(false)
const usernameError = ref('')
const confirmError = ref('')
const error = ref('')
const done = ref(false)

async function onSubmit() {
  usernameError.value = confirmError.value = error.value = ''
  if (password.value !== confirm.value) {
    confirmError.value = 'הסיסמאות אינן תואמות'
    return
  }
  submitting.value = true
  try {
    // The response has the /auth/me shape, so the /join guard passes without another request.
    user.value = await apiFetch('/auth/signup', {
      method: 'POST',
      body: { username: username.value, email: email.value, password: password.value },
    })
    done.value = true
  } catch (err) {
    if (err.status === 409) usernameError.value = err.message
    else if (err.status === 429) error.value = 'יותר מדי ניסיונות, נסו שוב מאוחר יותר'
    else if (err.status === 503) error.value = 'הרשמה עם סיסמה אינה זמינה כרגע. פנו למנהל האתר'
    else error.value = 'שגיאה בהרשמה, נסו שוב'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="mx-auto mt-6 max-w-sm sm:mt-16">
    <div class="card space-y-4">
      <img :src="LOGO_URL" alt="" class="mx-auto h-16" />
      <h1 class="page-title text-center">הרשמה</h1>

      <template v-if="done">
        <p role="status">
          נרשמת! שלחנו קישור לאימות אל <span dir="ltr">{{ email }}</span> (תקף לשעה).
        </p>
        <RouterLink :to="next ?? { name: 'join' }" class="btn-primary w-full">{{ next ? 'המשך' : 'המשך לבקשת הצטרפות' }}</RouterLink>
      </template>

      <template v-else>
        <p class="text-sm text-muted text-center">הרשמה לשחקנים: אחרי ההרשמה תוכלו לבקש הצטרפות לקבוצה</p>
        <form class="space-y-3" @submit.prevent="onSubmit">
          <div>
            <label for="username" class="field-label">שם משתמש</label>
            <input
              id="username"
              v-model="username"
              autocomplete="username"
              maxlength="64"
              pattern="[^@]+"
              title="שם המשתמש לא יכול להכיל @"
              required
              class="field-input"
              :aria-invalid="usernameError ? 'true' : undefined"
              :aria-describedby="usernameError ? 'username-error' : undefined"
            />
            <p v-if="usernameError" id="username-error" class="error-text">{{ usernameError }}</p>
            <p v-else class="text-xs text-muted">יוצג למנהלים שמאשרים את הבקשה</p>
          </div>
          <div>
            <label for="email" class="field-label">אימייל</label>
            <input
              id="email"
              v-model="email"
              type="email"
              autocomplete="email"
              dir="ltr"
              required
              class="field-input"
            />
            <p class="text-xs text-muted">נשלח אליו קישור אימות</p>
          </div>
          <div>
            <label for="password" class="field-label">סיסמה</label>
            <input
              id="password"
              v-model="password"
              type="password"
              autocomplete="new-password"
              minlength="8"
              required
              class="field-input"
            />
            <p class="text-xs text-muted">לפחות 8 תווים</p>
          </div>
          <div>
            <label for="password-confirm" class="field-label">אימות סיסמה</label>
            <input
              id="password-confirm"
              v-model="confirm"
              type="password"
              autocomplete="new-password"
              minlength="8"
              required
              class="field-input"
              :aria-invalid="confirmError ? 'true' : undefined"
              :aria-describedby="confirmError ? 'password-confirm-error' : undefined"
            />
            <p v-if="confirmError" id="password-confirm-error" class="error-text">{{ confirmError }}</p>
          </div>

          <p v-if="error" class="error-text" role="alert">{{ error }}</p>

          <button type="submit" :disabled="submitting" class="btn-primary w-full">
            {{ submitting ? 'נרשם…' : 'הרשמה' }}
          </button>
        </form>
        <RouterLink :to="{ name: 'admin-login' }" class="section-link">כבר יש לך חשבון? כניסה</RouterLink>
      </template>
    </div>
  </section>
</template>
