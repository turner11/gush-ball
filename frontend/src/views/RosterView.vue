<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { useSelectedTeam } from '../composables/useSelectedTeam'
import LineupStats from '../components/LineupStats.vue'
import PlayerCard from '../components/PlayerCard.vue'
import { apiFetch } from '../lib/api'
import { formatGameDate } from '../lib/format'

const players = ref([])
const loading = ref(false)

// DefaultLayout picks the default team; this view only follows the selection.
const { selectedTeamId } = useSelectedTeam()

async function loadPlayers() {
  if (!selectedTeamId.value) {
    players.value = []
    return
  }
  loading.value = true
  try {
    players.value = await apiFetch(`/teams/${selectedTeamId.value}/players`)
  } finally {
    loading.value = false
  }
}

watch(selectedTeamId, loadPlayers, { immediate: true })

const route = useRoute()
const router = useRouter()
const gameId = computed(() => Number(route.query.game) || null)
const game = ref(null)
const gameDate = computed(() => game.value && formatGameDate(game.value.scheduled_at))

async function loadGame() {
  game.value = null
  if (!selectedTeamId.value || !gameId.value) return
  try {
    game.value = await apiFetch(`/teams/${selectedTeamId.value}/games/${gameId.value}`)
  } catch {
    // ponytail: a network blip also drops the filter; fine, the fan lands on the season view
    router.replace({ query: {}, hash: '#lineups' })
  }
}

watch([selectedTeamId, gameId], loadGame, { immediate: true })
</script>

<template>
  <section class="space-y-10 sm:space-y-14">
    <div class="page-header">
      <h1 class="page-title">שחקנים</h1>
      <RouterLink :to="{ query: route.query, hash: '#lineups' }" class="section-link">חמישיות</RouterLink>
    </div>

    <div v-if="loading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6" aria-busy="true">
      <div v-for="n in 5" :key="n" class="skeleton h-40" />
    </div>
    <ul v-else-if="players.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      <li v-for="player in players" :key="player.id" class="card p-4 relative overflow-hidden">
        <PlayerCard :player="player" />
      </li>
    </ul>
    <p v-else class="empty-state">אין שחקנים עדיין.</p>

    <section v-if="selectedTeamId" id="lineups" class="scroll-mt-24 space-y-4">
      <div class="section-header flex-wrap">
        <h2 class="section-title">חמישיות</h2>
        <RouterLink
          v-if="game"
          :to="{ query: {}, hash: '#lineups' }"
          class="btn-secondary"
          :aria-label="'הצג את כל המשחקים (מסונן: נגד ' + game.opponent.name + ')'"
        >נגד {{ game.opponent.name }} · {{ gameDate.day }} {{ gameDate.month }} <span aria-hidden="true">✕</span></RouterLink>
      </div>
      <p class="text-sm text-muted">{{ gameId ? '+/- של כל הרכב במשחק הזה' : '+/- של כל הרכב לאורך העונה, לפי נתוני המשחקים' }}</p>
      <LineupStats :team-id="selectedTeamId" :players="players" :game-id="gameId" />
    </section>
  </section>
</template>
