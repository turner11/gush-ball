<script setup>
import { ref, watch } from 'vue'

import { useSelectedTeam } from '../composables/useSelectedTeam'
import LineupStats from '../components/LineupStats.vue'
import PlayerCard from '../components/PlayerCard.vue'
import { apiFetch } from '../lib/api'

const players = ref([])

// DefaultLayout picks the default team; this view only follows the selection.
const { selectedTeamId } = useSelectedTeam()

async function loadPlayers() {
  if (!selectedTeamId.value) {
    players.value = []
    return
  }
  players.value = await apiFetch(`/teams/${selectedTeamId.value}/players`)
}

watch(selectedTeamId, loadPlayers, { immediate: true })
</script>

<template>
  <section class="space-y-6">
    <h1 class="page-title">שחקנים</h1>

    <ul v-if="players.length" class="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <li v-for="player in players" :key="player.id">
        <PlayerCard :player="player" />
      </li>
    </ul>
    <p v-else class="empty-state">אין שחקנים עדיין.</p>

    <template v-if="selectedTeamId">
      <h2 id="lineups" class="section-title">חמישיות</h2>
      <LineupStats :team-id="selectedTeamId" :players="players" />
    </template>
  </section>
</template>
