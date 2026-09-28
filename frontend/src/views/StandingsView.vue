<script setup>
import { computed, onMounted, ref, watch } from 'vue'

import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'

const teams = ref([])
const team = ref(null)
const rows = ref([])

const { selectedTeamId, ensureDefault } = useSelectedTeam()

const myRow = computed(() => rows.value.find((r) => r.team_name === team.value?.name) ?? null)
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

onMounted(async () => {
  teams.value = await apiFetch('/teams')
  ensureDefault(teams.value)
  await load()
})

watch(selectedTeamId, load)
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-bold">טבלת הליגה</h1>

    <template v-if="myRow">
      <h2 class="text-lg font-semibold">{{ myRow.league_name }}</h2>
      <table class="w-full text-start">
        <thead>
          <tr class="border-b border-neutral-200 text-sm dark:border-neutral-700">
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
            class="border-b border-neutral-100 dark:border-neutral-800"
            :class="{ 'bg-neutral-100 font-bold dark:bg-neutral-800': row.id === myRow.id }"
          >
            <td class="py-2">{{ row.rank }}</td>
            <td class="py-2">{{ row.team_name }}</td>
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
    <p v-else class="text-sm text-neutral-500">אין נתוני טבלה עבור קבוצה זו.</p>
  </section>
</template>
