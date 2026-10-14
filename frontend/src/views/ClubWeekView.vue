<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { apiFetch } from '../lib/api'
import { splitGames } from '../lib/games'
import GameRow from './GameRow.vue'

// "This week at the club": every team's games from the last 7 to the next 7 days (#326).
function day(offset) {
  const d = new Date()
  d.setDate(d.getDate() + offset) // calendar days, so DST can't shift the date
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const loading = ref(true)
const error = ref(false)
const games = ref([])
const teams = ref([])

const groups = computed(() => {
  const { upcoming, past } = splitGames(games.value)
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
    <div class="section-header">
      <h2 class="section-title">השבוע במועדון</h2>
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
    <p v-else-if="!groups.length" class="empty-state">אין משחקים במועדון השבוע.</p>
    <template v-else>
      <div v-for="group in groups" :key="group.title" class="space-y-2">
        <h3 class="eyebrow">{{ group.title }}</h3>
        <ol class="card divide-y divide-line overflow-hidden p-0">
          <GameRow v-for="g in group.games" :key="g.id" :game="g" :team="teamOf(g)" show-team />
        </ol>
      </div>
    </template>
  </section>
</template>
