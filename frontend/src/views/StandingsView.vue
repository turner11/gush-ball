<script setup>
import { computed, ref, watch } from 'vue'

import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { signed } from '../lib/format'
import { teamRows } from '../lib/standings'

const team = ref(null)
const rows = ref([])
const loading = ref(false)

// DefaultLayout picks the default team; this view only follows the selection.
const { selectedTeamId } = useSelectedTeam()

const rowLogo = (r) => (r.id === myRow.value?.id ? team.value?.logo_url : r.logo_url)
const myRow = computed(() => teamRows(rows.value, team.value)[0] ?? null)
const leagueRows = computed(() =>
  myRow.value ? rows.value.filter((r) => r.league_name === myRow.value.league_name) : [],
)

async function load() {
  if (!selectedTeamId.value) {
    team.value = null
    rows.value = []
    return
  }
  const id = selectedTeamId.value
  loading.value = true
  try {
    const [loadedTeam, loadedRows] = await Promise.all([apiFetch(`/teams/${id}`), apiFetch('/standings')])
    if (id !== selectedTeamId.value) return // a newer team was selected meanwhile
    team.value = loadedTeam
    rows.value = loadedRows
  } finally {
    if (id === selectedTeamId.value) loading.value = false
  }
}

watch(selectedTeamId, load, { immediate: true })
</script>

<template>
  <section class="space-y-6">
    <div v-if="loading" class="space-y-3" aria-busy="true">
      <div class="skeleton h-8 w-48" />
      <div class="skeleton h-64" />
    </div>

    <template v-else-if="myRow">
      <div>
        <p class="eyebrow">{{ myRow.league_name }}</p>
        <h1 class="page-title">טבלת הליגה</h1>
      </div>
      <div data-testid="standing-summary" class="grid grid-cols-3 gap-3">
        <div class="stat"><span class="stat-value">{{ myRow.rank }}</span><span class="stat-label">מקום</span></div>
        <div class="stat"><span class="stat-value">{{ myRow.won }}–{{ myRow.lost }}</span><span class="stat-label">נ׳–ה׳</span></div>
        <div class="stat"><span class="stat-value">{{ myRow.points }}</span><span class="stat-label">נקודות</span></div>
      </div>
      <div class="card overflow-x-auto p-0">
        <table class="w-full text-start">
          <thead>
            <tr class="table-header-row">
              <th class="px-2 py-2.5 sm:px-3 text-center" title="דירוג">#</th>
              <th class="px-2 py-2.5 sm:px-3 text-start">קבוצה</th>
              <th class="px-2 py-2.5 sm:px-3 text-center" title="משחקים">מש׳</th>
              <th class="px-2 py-2.5 sm:px-3 text-center" title="נצחונות">נ׳</th>
              <th class="px-2 py-2.5 sm:px-3 text-center" title="הפסדים">ה׳</th>
              <th class="hidden px-2 py-2.5 sm:px-3 text-center sm:table-cell" title="נקודות זכות">נק' זכות</th>
              <th class="hidden px-2 py-2.5 sm:px-3 text-center sm:table-cell" title="נקודות חובה">נק' חובה</th>
              <th class="hidden px-2 py-2.5 sm:px-3 text-center sm:table-cell" title="הפרש">הפרש</th>
              <th class="px-2 py-2.5 sm:px-3 text-center" title="נקודות">נק׳</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in leagueRows"
              :key="row.id"
              class="table-body-row"
              :class="{ 'border-s-4 border-team bg-team/10 font-bold': row.id === myRow.id }"
            >
              <td class="px-2 py-2.5 sm:px-3 text-center tabular-nums text-muted">{{ row.rank }}</td>
              <td class="min-w-32 px-2 py-2.5 sm:min-w-40 sm:px-3">
                <img v-if="rowLogo(row)" :src="rowLogo(row)" alt="" class="me-2 inline size-7 object-contain" />
                <a v-if="row.source_url" :href="row.source_url" target="_blank" rel="noopener" class="hover:underline">{{ row.team_name }}</a>
                <template v-else>{{ row.team_name }}</template>
              </td>
              <td class="px-2 py-2.5 sm:px-3 text-center tabular-nums">{{ row.played }}</td>
              <td class="px-2 py-2.5 sm:px-3 text-center tabular-nums">{{ row.won }}</td>
              <td class="px-2 py-2.5 sm:px-3 text-center tabular-nums">{{ row.lost }}</td>
              <td class="hidden px-2 py-2.5 sm:px-3 text-center tabular-nums sm:table-cell">{{ row.points_for }}</td>
              <td class="hidden px-2 py-2.5 sm:px-3 text-center tabular-nums sm:table-cell">{{ row.points_against }}</td>
              <td class="hidden px-2 py-2.5 sm:px-3 text-center tabular-nums sm:table-cell"><span dir="ltr">{{ signed(row.points_for - row.points_against) }}</span></td>
              <td class="px-2 py-2.5 sm:px-3 text-center font-bold tabular-nums">{{ row.points }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <template v-else>
      <h1 class="page-title">טבלת הליגה</h1>
      <p class="empty-state">אין נתוני טבלה עבור קבוצה זו.</p>
    </template>
  </section>
</template>
