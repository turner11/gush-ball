<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { clubTeamsOf, teamSlug, useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { splitGames } from '../lib/games'
import GameRow from '../components/GameRow.vue'

// "This week at the club": the games of every team in the current team's club from the last 7 to the next 7 days (#326).
function day(offset) {
  const d = new Date()
  d.setDate(d.getDate() + offset) // calendar days, so DST can't shift the date
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const loading = ref(true)
const error = ref(false)
const games = ref([])
const teams = ref([])

const { selectedTeamId } = useSelectedTeam()
const current = computed(() => teams.value.find((t) => String(t.id) === selectedTeamId.value))
const clubTeams = computed(() => clubTeamsOf(teams.value, current.value))
const hasClubPage = computed(() => clubTeams.value.length > 1)

const groups = computed(() => {
  // ponytail: /games returns every club's games, so filter client-side; add a `club` query param if the payload grows.
  const clubIds = new Set(clubTeams.value.map((t) => t.id))
  const { upcoming, past } = splitGames(games.value.filter((g) => clubIds.has(g.team_id)))
  return [
    { title: 'משחקים קרובים', games: upcoming },
    { title: 'תוצאות אחרונות', games: past },
  ].filter((g) => g.games.length)
})
const teamOf = (g) => teams.value.find((t) => t.id === g.team_id) ?? null

async function load() {
  loading.value = true
  error.value = false
  try {
    ;[games.value, teams.value] = await Promise.all([apiFetch(`/games?from=${day(-7)}&to=${day(7)}`), apiFetch('/teams')])
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}
load()
</script>

<template>
  <section class="space-y-3">
    <div class="page-header">
      <div>
        <h1 class="page-title">השבוע במועדון</h1>
        <p v-if="hasClubPage" class="text-muted">{{ current.club }}</p>
      </div>
      <RouterLink :to="{ name: 'teams' }" class="section-link">כל הקבוצות</RouterLink>
    </div>
    <div v-if="loading" class="space-y-3" aria-busy="true">
      <div class="skeleton h-16" />
      <div class="skeleton h-16" />
    </div>
    <div v-else-if="error" class="space-y-3">
      <p class="error-text" role="alert">שגיאה בטעינת משחקי השבוע</p>
      <button type="button" class="btn-secondary" @click="load">נסו שוב</button>
    </div>
    <div v-else-if="!hasClubPage" class="space-y-3">
      <p class="empty-state">לקבוצה זו אין עמוד מועדון.</p>
      <RouterLink v-if="current" :to="'/' + teamSlug(current)" class="btn-secondary">לדף הקבוצה</RouterLink>
    </div>
    <p v-else-if="!groups.length" class="empty-state">אין משחקים במועדון השבוע.</p>
    <template v-else>
      <div v-for="group in groups" :key="group.title" class="space-y-2">
        <h2 class="eyebrow">{{ group.title }}</h2>
        <ol class="card divide-y divide-line overflow-hidden p-0">
          <GameRow v-for="g in group.games" :key="g.id" :game="g" :team="teamOf(g)" show-team />
        </ol>
      </div>
    </template>
  </section>
</template>
