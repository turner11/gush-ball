<script setup>
import { computed, ref, watch } from 'vue'

import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'

const team = ref(null)
const rows = ref([])

// DefaultLayout picks the default team; this view only follows the selection.
const { selectedTeamId } = useSelectedTeam()

const normUrl = (u) => decodeURIComponent(u).replace(/\/$/, '')
// URL is the reliable key (names differ between our Team and ibasketball); name is the fallback.
const isMine = (r) =>
  r.source_url && team.value?.ibasketball_team_url
    ? normUrl(r.source_url) === normUrl(team.value.ibasketball_team_url)
    : r.team_name === team.value?.name
const myRow = computed(() => rows.value.find(isMine) ?? null)
const leagueRows = computed(() =>
  myRow.value ? rows.value.filter((r) => r.league_name === myRow.value.league_name) : [],
)

async function load() {
  if (!selectedTeamId.value) {
    team.value = null
    rows.value = []
    return
  }
  ;[team.value, rows.value] = await Promise.all([
    apiFetch(`/teams/${selectedTeamId.value}`),
    apiFetch('/standings'),
  ])
}

watch(selectedTeamId, load, { immediate: true })
</script>

<template>
  <section class="space-y-4">
    <h1 class="page-title">טבלת הליגה</h1>

    <template v-if="myRow">
      <h2 class="section-title">{{ myRow.league_name }}</h2>
      <table class="w-full text-start">
        <thead>
          <tr class="table-header-row">
            <th class="py-2 text-start">דירוג</th>
            <th class="py-2 text-start">קבוצה</th>
            <th class="py-2 text-start">משחקים</th>
            <th class="py-2 text-start">נצחונות</th>
            <th class="py-2 text-start">הפסדים</th>
            <th class="py-2 text-start">נק' זכות</th>
            <th class="py-2 text-start">נק' חובה</th>
            <th class="py-2 text-start">נקודות</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in leagueRows"
            :key="row.id"
            class="table-row"
            :class="{ 'bg-neutral-100 font-bold dark:bg-neutral-800': row.id === myRow.id }"
          >
            <td class="py-2">{{ row.rank }}</td>
            <td class="py-2">
              <a v-if="row.source_url" :href="row.source_url" target="_blank" rel="noopener" class="hover:underline">{{ row.team_name }}</a>
              <template v-else>{{ row.team_name }}</template>
            </td>
            <td class="py-2">{{ row.played }}</td>
            <td class="py-2">{{ row.won }}</td>
            <td class="py-2">{{ row.lost }}</td>
            <td class="py-2">{{ row.points_for }}</td>
            <td class="py-2">{{ row.points_against }}</td>
            <td class="py-2">{{ row.points }}</td>
          </tr>
        </tbody>
      </table>
    </template>
    <p v-else class="empty-state">אין נתוני טבלה עבור קבוצה זו.</p>
  </section>
</template>
