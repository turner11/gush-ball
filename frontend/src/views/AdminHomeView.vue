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
  <section class="space-y-4">
    <h1 class="text-2xl font-bold">אזור ניהול</h1>
    <nav class="flex flex-col gap-2">
      <RouterLink to="/admin/players" class="hover:underline">ניהול שחקנים</RouterLink>
      <RouterLink to="/admin/games" class="hover:underline">ניהול משחקים</RouterLink>
      <RouterLink to="/admin/standings" class="hover:underline">ניהול טבלת ליגה</RouterLink>
      <RouterLink :to="{ name: 'admin-teams' }" class="hover:underline">ניהול קבוצות</RouterLink>
    </nav>

    <div class="space-y-2">
      <button type="button" :disabled="submitting || running" class="btn-primary" @click="onSyncNow">
        סנכרון עכשיו
      </button>
      <p v-if="running" class="text-sm text-neutral-600 dark:text-neutral-400">
        הסנכרון רץ… זה עלול לקחת כמה דקות.
      </p>
      <div v-else-if="result" class="text-sm text-neutral-600 dark:text-neutral-400">
        <p v-if="result.failed" class="text-red-600 dark:text-red-400">הסנכרון נכשל.</p>
        <p v-else>
          הסנכרון הסתיים: {{ result.standings }} שורות טבלה, {{ result.games }} משחקים.        </p>
        <ul v-if="result.errors.length" class="list-disc ps-5 text-red-600 dark:text-red-400">
          <li v-for="e in result.errors" :key="e">{{ e }}</li>
        </ul>
      </div>
      <p v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
    </div>
  </section>
</template>
