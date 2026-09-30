<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { apiFetch } from '../lib/api'

const POLL_MS = 3000

const submitting = ref(false)
const running = ref(false)
const result = ref(null)
const error = ref(null)
let timer = null
let unmounted = false

function stopPolling() {
  clearInterval(timer)
  timer = null
}

async function refreshStatus() {
  try {
    const s = await apiFetch('/sync/status')
    if (unmounted) return
    running.value = s.running
    if (s.finished_at) result.value = s
    if (s.running) {
      timer ??= setInterval(refreshStatus, POLL_MS)
    } else {
      stopPolling()
    }
  } catch (err) {
    stopPolling()
    running.value = false
    error.value = err.message
  }
}

async function onSyncNow() {
  submitting.value = true
  result.value = null
  error.value = null
  try {
    await apiFetch('/sync/now', { method: 'POST' })
    running.value = true
    timer ??= setInterval(refreshStatus, POLL_MS)
  } catch (err) {
    error.value = err.message
  } finally {
    submitting.value = false
  }
}

onMounted(refreshStatus)
onUnmounted(() => {
  unmounted = true
  stopPolling()
})
</script>

<template>
  <section class="space-y-6">
    <h1 class="page-title">אזור ניהול</h1>
    <nav class="grid gap-3 sm:grid-cols-2">
      <RouterLink to="/admin/players" class="card hover:border-neutral-400">
        <span class="block font-bold">ניהול שחקנים</span>
        <span class="text-sm text-neutral-500">שחקנים ותמונות</span>
      </RouterLink>
      <RouterLink to="/admin/games" class="card hover:border-neutral-400">
        <span class="block font-bold">ניהול משחקים</span>
        <span class="text-sm text-neutral-500">לוח משחקים, תוצאות ותור אישור</span>
      </RouterLink>
      <RouterLink to="/admin/standings" class="card hover:border-neutral-400">
        <span class="block font-bold">ניהול טבלת ליגה</span>
        <span class="text-sm text-neutral-500">טבלת ליגה ידנית</span>
      </RouterLink>
      <RouterLink :to="{ name: 'admin-teams' }" class="card hover:border-neutral-400">
        <span class="block font-bold">ניהול קבוצות</span>
        <span class="text-sm text-neutral-500">קבוצות, מיתוג ותוכן</span>
      </RouterLink>
    </nav>

    <div class="card space-y-2">
      <h2 class="section-title">סנכרון מ-ibasketball</h2>
      <button type="button" :disabled="submitting || running" class="btn-primary" @click="onSyncNow">
        סנכרון עכשיו
      </button>
      <p v-if="running" class="text-sm text-neutral-600 dark:text-neutral-400">
        הסנכרון רץ… זה עלול לקחת כמה דקות.
      </p>
      <div v-else-if="result" class="text-sm text-neutral-600 dark:text-neutral-400">
        <p v-if="result.failed" class="error-text">הסנכרון נכשל.</p>
        <p v-else>
          הסנכרון הסתיים: {{ result.standings }} שורות טבלה, {{ result.games }} משחקים, {{ result.players }} שחקנים.        </p>
        <ul v-if="result.errors.length" class="error-text list-disc ps-5">
          <li v-for="e in result.errors" :key="e">{{ e }}</li>
        </ul>
      </div>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    </div>
  </section>
</template>
