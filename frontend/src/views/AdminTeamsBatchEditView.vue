<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import TeamBatchTable, { EDITABLE_KEYS } from '../components/TeamBatchTable.vue'
import { fullAdmin } from '../composables/useAuth'
import { apiFetch } from '../lib/api'

const rows = ref([])
const state = ref('loading') // 'loading' | 'ready' | 'error'
const snapshots = new Map() // team id -> the editable fields as loaded

const COLOR_FALLBACK = '#000000' // <input type="color"> cannot show null

function toRow(team) {
  const row = {
    ...team,
    initialName: team.name,
    admin_id: '',
    error: null,
    ...Object.fromEntries(EDITABLE_KEYS.map((k) => [k, team[k] ?? ''])),
  }
  for (const k of ['primary_color', 'secondary_color']) row[k] ||= COLOR_FALLBACK
  snapshots.set(row.id, pickEditable(row))
  return row
}

const pickEditable = (row) => Object.fromEntries(EDITABLE_KEYS.map((k) => [k, row[k]]))

async function load() {
  state.value = 'loading'
  try {
    rows.value = (await apiFetch('/teams')).map(toRow)
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}

// PATCH only what changed; '' becomes null so a cleared social is removed.
async function saveRow(row) {
  const before = snapshots.get(row.id)
  const diff = Object.fromEntries(
    EDITABLE_KEYS.filter((k) => row[k] !== before[k]).map((k) => [k, row[k] === '' ? null : row[k]]),
  )
  if (Object.keys(diff).length) await apiFetch(`/teams/${row.id}`, { method: 'PATCH', body: diff })
  return row.id
}

onMounted(() => fullAdmin.value && load())
</script>

<template>
  <section class="space-y-6">
    <div class="page-header">
      <h1 class="page-title">עריכת קבוצות</h1>
      <RouterLink :to="{ name: 'admin-teams' }" class="section-link">→ כל הקבוצות</RouterLink>
    </div>

    <p v-if="!fullAdmin" class="empty-state">פעולה זו זמינה למנהל ראשי בלבד</p>

    <div v-else-if="state === 'loading'" class="space-y-3" aria-busy="true">
      <div class="skeleton h-16" />
      <div class="skeleton h-16" />
      <div class="skeleton h-16" />
    </div>

    <div v-else-if="state === 'error'" class="space-y-2">
      <p class="error-text" role="alert">שגיאה בטעינת הקבוצות</p>
      <button type="button" class="btn-ghost" @click="load">נסו שוב</button>
    </div>

    <div v-else-if="!rows.length" class="empty-state space-y-2">
      <p>אין קבוצות עדיין</p>
      <RouterLink :to="{ name: 'admin-teams-import' }" class="section-link">ייבוא קבוצות מאגודה →</RouterLink>
    </div>

    <TeamBatchTable v-else v-model:rows="rows" :submit-label="`שמירת ${rows.length} קבוצות`" :save="saveRow" />
  </section>
</template>
