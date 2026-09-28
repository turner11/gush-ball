<script setup>
import { ref } from 'vue'
import { RouterLink } from 'vue-router'

import { apiFetch } from '../lib/api'

const submitting = ref(false)
const status = ref(null)
const error = ref(null)

async function onSyncNow() {
  submitting.value = true
  status.value = null
  error.value = null
  try {
    await apiFetch('/sync/now', { method: 'POST' })
    status.value = 'הסנכרון התחיל, זה עלול לקחת כמה דקות.'
  } catch (err) {
    error.value = err.message
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-bold">אזור ניהול</h1>
    <nav class="flex flex-col gap-2">
      <RouterLink to="/admin/players" class="hover:underline">ניהול שחקנים</RouterLink>
      <RouterLink to="/admin/games" class="hover:underline">ניהול משחקים</RouterLink>
      <RouterLink to="/admin/standings" class="hover:underline">ניהול טבלת ליגה</RouterLink>
      <RouterLink :to="{ name: 'admin-teams' }" class="hover:underline">ניהול קבוצות</RouterLink>
    </nav>

    <div class="space-y-2">
      <button type="button" :disabled="submitting" class="btn-primary" @click="onSyncNow">
        סנכרון עכשיו
      </button>
      <p v-if="status" class="text-sm text-neutral-600 dark:text-neutral-400">{{ status }}</p>
      <p v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
    </div>
  </section>
</template>
