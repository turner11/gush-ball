<script setup>
import { ref, watch } from 'vue'

import { useSelectedTeam } from '../composables/useSelectedTeam'
import PlayerCard from '../components/PlayerCard.vue'
import { apiFetch } from '../lib/api'

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
</script>

<template>
  <section class="space-y-10 sm:space-y-14">
    <div class="page-header">
      <h1 class="page-title">שחקנים</h1>
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
  </section>
</template>
