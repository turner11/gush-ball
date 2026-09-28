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
    <h1 class="text-2xl font-bold">כניסת מנהל</h1>

    <form class="space-y-3" @submit.prevent="onSubmit">
      <div>
        <label for="username" class="block text-sm font-medium">שם משתמש</label>
        <input
          id="username"
          v-model="username"
          type="text"
          required
          class="mt-1 w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800"
        />
      </div>

      <div>
        <label for="password" class="block text-sm font-medium">סיסמה</label>
        <input
          id="password"
          v-model="password"
          type="password"
          required
          class="mt-1 w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800"
        />
      </div>

      <p v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>

      <button
        type="submit"
        :disabled="submitting"
        class="w-full rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        כניסה
      </button>
    </form>
  </section>
</template>
