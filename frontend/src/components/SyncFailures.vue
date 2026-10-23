<script setup>
import { computed, onMounted, ref } from 'vue'

import { apiFetch } from '../lib/api'
import { formatDateTime } from '../lib/format'

const GROUPINGS = [
  { value: 'error', label: 'שגיאה' },
  { value: 'date', label: 'תאריך' },
  { value: 'team', label: 'קבוצה' },
]
const dayFormat = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: '2-digit', month: '2-digit', year: '2-digit' })

const rows = ref([]) // latest unresolved scrape failure per team (#403), newest first; empty renders nothing
const loadFailed = ref(false)
const groupBy = ref('error')
const busy = ref(false)
const actionError = ref('')

// ponytail: error key is the exact message, so HTTP-status errors (which embed the team URL) don't merge; strip URLs if asked.
const groupKey = {
  error: (row) => row.message,
  date: (row) => dayFormat.format(new Date(row.failed_at)),
  team: (row) => row.team_id,
}
const groupLabel = { error: (row) => row.message, date: (row) => dayFormat.format(new Date(row.failed_at)), team: (row) => row.team_name }

const groups = computed(() => {
  const byKey = new Map() // insertion order = order of each group's newest failure
  for (const row of rows.value) {
    const key = groupKey[groupBy.value](row)
    if (!byKey.has(key)) byKey.set(key, { key, label: groupLabel[groupBy.value](row), rows: [] })
    byKey.get(key).rows.push(row)
  }
  return [...byKey.values()]
})

async function load() {
  loadFailed.value = false
  try {
    rows.value = await apiFetch('/sync/failures')
  } catch {
    loadFailed.value = true
  }
}
onMounted(load)

// ponytail: one DELETE per row (each scope-checked); a bulk endpoint if groups ever reach hundreds of rows.
async function dismissGroup(group) {
  busy.value = true
  actionError.value = ''
  const results = await Promise.allSettled(
    group.rows.map((row) => apiFetch(`/sync/failures/${row.team_id}`, { method: 'DELETE' })),
  )
  const done = new Set(group.rows.filter((_, i) => results[i].status === 'fulfilled').map((r) => r.team_id))
  rows.value = rows.value.filter((r) => !done.has(r.team_id))
  if (done.size < group.rows.length) actionError.value = 'שגיאה בסגירת ההתראה, נסו שוב'
  busy.value = false
}
</script>

<template>
  <section v-if="rows.length || loadFailed" class="card space-y-3 border-warn/60" aria-labelledby="sync-failures-title">
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-2">
        <h2 id="sync-failures-title" class="section-title">שגיאות סנכרון</h2>
        <span v-if="rows.length" class="badge-muted">{{ rows.length }}</span>
      </div>
      <div v-if="rows.length && !loadFailed" class="flex items-center gap-2 sm:ms-auto">
        <p class="eyebrow">קיבוץ לפי</p>
        <div role="group" aria-label="קיבוץ לפי" class="segmented">
          <button
            v-for="g in GROUPINGS"
            :key="g.value"
            type="button"
            class="segmented-item"
            :aria-pressed="groupBy === g.value"
            @click="groupBy = g.value"
          >{{ g.label }}</button>
        </div>
      </div>
    </div>

    <div v-if="loadFailed" class="space-y-2">
      <p class="error-text" role="alert">שגיאה בטעינת שגיאות הסנכרון</p>
      <button type="button" class="btn-secondary" @click="load">נסו שוב</button>
    </div>
    <div v-else class="space-y-4">
      <div
        v-for="(group, i) in groups"
        :key="group.key"
        role="group"
        data-testid="failure-group"
        :aria-label="group.label"
        :class="i > 0 ? 'border-t border-line pt-3' : ''"
      >
        <div class="flex items-center gap-2">
          <p
            class="min-w-0 break-words text-sm font-bold"
            :dir="groupBy === 'error' ? 'ltr' : 'auto'"
          >{{ group.label }}</p>
          <span class="badge-muted">{{ group.rows.length }}</span>
          <button
            v-if="group.rows.length > 1"
            type="button"
            class="btn-ghost ms-auto"
            :disabled="busy"
            :aria-label="`סגירת כל ההתראות (${group.rows.length}): ${group.label}`"
            @click="dismissGroup(group)"
          >סגירת הכל</button>
        </div>
        <ul class="divide-y divide-line">
          <li v-for="row in group.rows" :key="row.team_id" class="space-y-2 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:space-y-0">
            <div class="min-w-0">
              <p v-if="groupBy !== 'team'" class="truncate font-bold" dir="auto">{{ row.team_name }}</p>
              <p class="text-sm text-muted">נכשל ב-{{ formatDateTime(row.failed_at) }}</p>
            </div>
            <div class="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
              <RouterLink class="btn-secondary" :to="{ name: 'admin-team-edit', params: { id: row.team_id } }">לעריכת הקבוצה</RouterLink>
              <button
                type="button"
                class="btn-ghost"
                :disabled="busy"
                :aria-label="`סגירת ההתראה של ${row.team_name}`"
                @click="dismissGroup({ rows: [row] })"
              >סגירה</button>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <p v-if="actionError" class="error-text" role="alert">{{ actionError }}</p>
  </section>
</template>
