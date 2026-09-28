<script setup>
import { onMounted, ref, watch } from 'vue'

import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'

const teams = ref([])
const players = ref([])

const { selectedTeamId, ensureDefault } = useSelectedTeam()

async function loadPlayers() {
  if (!selectedTeamId.value) {
    players.value = []
    return
  }
  players.value = await apiFetch(`/teams/${selectedTeamId.value}/players`)
}

onMounted(async () => {
  teams.value = await apiFetch('/teams')
  ensureDefault(teams.value)
  await loadPlayers()
})

watch(selectedTeamId, loadPlayers)
</script>

<template>
  <section class="space-y-6">
    <h1 class="page-title">שחקנים</h1>

    <ul v-if="players.length" class="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <li v-for="player in players" :key="player.id" class="space-y-1 text-center">
        <img
          v-if="player.images?.[0]?.url"
          :src="player.images[0].url"
          :alt="player.name"
          class="mx-auto h-20 w-20 rounded-full object-cover"
        />
        <p class="font-semibold">{{ player.jersey_number }} — {{ player.name }}</p>
      </li>
    </ul>
    <p v-else class="empty-state">אין שחקנים עדיין.</p>

    <p class="text-neutral-600 dark:text-neutral-400">סטטיסטיקות שחקנים יופיעו כאן בקרוב.</p>
  </section>
</template>
