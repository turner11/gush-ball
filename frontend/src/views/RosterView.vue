<script setup>
import { computed, ref, watch } from 'vue'

import { useSelectedTeam } from '../composables/useSelectedTeam'
import PlayerCard from '../components/PlayerCard.vue'
import { apiFetch } from '../lib/api'

const players = ref([])
// coaches lead the API order; a heading only appears when there are two groups
const groups = computed(() =>
  [
    { title: 'מאמנים', people: players.value.filter((p) => p.is_coach) },
    { title: 'שחקנים', people: players.value.filter((p) => !p.is_coach) },
  ].filter((g) => g.people.length),
)
const teamImages = ref([])
const loading = ref(false)

// DefaultLayout picks the default team; this view only follows the selection.
const { selectedTeamId } = useSelectedTeam()

async function loadPlayers() {
  if (!selectedTeamId.value) {
    players.value = []
    teamImages.value = []
    return
  }
  const id = selectedTeamId.value
  loading.value = true
  try {
    // images only decorate the card slideshow: a failed call must not blank the roster
    const [loaded, images] = await Promise.all([
      apiFetch(`/teams/${id}/players`),
      apiFetch(`/teams/${id}/images`).catch(() => []),
    ])
    if (id !== selectedTeamId.value) return // a newer team was selected meanwhile
    players.value = loaded
    teamImages.value = images
  } finally {
    if (id === selectedTeamId.value) loading.value = false
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
    <template v-else-if="groups.length">
      <div v-for="group in groups" :key="group.title" class="space-y-4">
        <h2 v-if="groups.length > 1" class="section-title">{{ group.title }}</h2>
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          <li v-for="player in group.people" :key="player.id" class="card p-4 relative overflow-hidden">
            <PlayerCard :player="player" :team-images="teamImages" />
          </li>
        </ul>
      </div>
    </template>
    <p v-else class="empty-state">אין שחקנים עדיין.</p>
  </section>
</template>
