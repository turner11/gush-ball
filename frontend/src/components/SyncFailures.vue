<script setup>
import { onMounted, ref } from 'vue'

import { apiFetch } from '../lib/api'
import { formatDateTime } from '../lib/format'

const rows = ref([]) // latest unresolved scrape failure per team (#403); empty renders nothing
const loadFailed = ref(false)
const busyId = ref(null)
const actionError = ref('')

async function load() {
  loadFailed.value = false
  try {
    rows.value = await apiFetch('/sync/failures')
  } catch {
    loadFailed.value = true
  }
}
onMounted(load)

async function dismiss(row) {
  busyId.value = row.team_id
  actionError.value = ''
  try {
    await apiFetch(`/sync/failures/${row.team_id}`, { method: 'DELETE' })
    rows.value = rows.value.filter((r) => r.team_id !== row.team_id)
  } catch {
    actionError.value = 'שגיאה בסגירת ההתראה, נסו שוב'
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <section v-if="rows.length || loadFailed" class="card space-y-3 border-warn/60" aria-labelledby="sync-failures-title">
    <div class="flex items-center gap-2">
      <h2 id="sync-failures-title" class="section-title">שגיאות סנכרון</h2>
      <span v-if="rows.length" class="badge-muted">{{ rows.length }}</span>
    </div>

    <div v-if="loadFailed" class="space-y-2">
      <p class="error-text" role="alert">שגיאה בטעינת שגיאות הסנכרון</p>
      <button type="button" class="btn-secondary" @click="load">נסו שוב</button>
    </div>
    <ul v-else class="divide-y divide-line">
      <li v-for="row in rows" :key="row.team_id" class="space-y-2 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:space-y-0">
        <div class="min-w-0">
          <p class="truncate font-bold" dir="auto">{{ row.team_name }}</p>
          <p class="text-sm text-muted">נכשל ב-{{ formatDateTime(row.failed_at) }}</p>
          <p class="break-words text-sm text-muted" dir="ltr">{{ row.message }}</p>
        </div>
        <div class="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <RouterLink class="btn-secondary" :to="{ name: 'admin-team-edit', params: { id: row.team_id } }">לעריכת הקבוצה</RouterLink>
          <button
            type="button"
            class="btn-ghost"
            :disabled="busyId === row.team_id"
            :aria-label="`סגירת ההתראה של ${row.team_name}`"
            @click="dismiss(row)"
          >סגירה</button>
        </div>
      </li>
    </ul>

    <p v-if="actionError" class="error-text" role="alert">{{ actionError }}</p>
  </section>
</template>
