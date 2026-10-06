<script setup>
import { computed, ref, watch } from 'vue'

import AppIcon from '../components/AppIcon.vue'
import GameRow from '../components/GameRow.vue'
import { useAuth } from '../composables/useAuth'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { splitGames } from '../lib/games'

// Fire and forget: the live stats link appears for admins once the session resolves.
const { checked, checkSession } = useAuth()
if (!checked.value) checkSession()

const games = ref([])
const team = ref(null)
const loading = ref(false)

// DefaultLayout picks the default team; this view only follows the selection.
const { selectedTeamId } = useSelectedTeam()

const upcoming = computed(() => splitGames(games.value).upcoming)
const past = computed(() => splitGames(games.value).past)
const sections = computed(() => [
  { title: 'משחקים קרובים', games: upcoming.value, empty: 'אין משחקים קרובים.' },
  { title: 'תוצאות', games: past.value, empty: 'אין תוצאות עדיין.' },
])

async function loadGames() {
  if (!selectedTeamId.value) {
    games.value = []
    team.value = null
    return
  }
  const id = selectedTeamId.value
  loading.value = true
  try {
    const [loadedTeam, loadedGames] = await Promise.all([apiFetch(`/teams/${id}`), apiFetch(`/teams/${id}/games`)])
    if (id !== selectedTeamId.value) return // a newer team was selected meanwhile
    team.value = loadedTeam
    games.value = loadedGames
  } finally {
    if (id === selectedTeamId.value) loading.value = false
  }
}

watch(selectedTeamId, loadGames, { immediate: true })
</script>

<template>
  <section class="space-y-10 sm:space-y-14">
    <div class="page-header">
      <div>
        <p class="eyebrow">{{ team?.name }}</p>
        <h1 class="page-title">לוח משחקים</h1>
        <a v-if="team?.ibasketball_team_url" :href="team.ibasketball_team_url" target="_blank" rel="noopener" class="section-link">{{ team.name }}<AppIcon name="external" /></a>
      </div>
    </div>

    <div v-if="loading" class="space-y-3" aria-busy="true">
      <div class="skeleton h-16" />
      <div class="skeleton h-16" />
      <div class="skeleton h-16" />
    </div>

    <p v-else-if="!games.length" class="empty-state">אין משחקים עדיין.</p>

    <template v-else>
      <section v-for="s in sections" :key="s.title" class="space-y-3">
        <h2 class="section-title">{{ s.title }}</h2>
        <ol v-if="s.games.length" class="card divide-y divide-line overflow-hidden p-0">
          <GameRow v-for="game in s.games" :key="game.id" :game="game" :team="team" />
        </ol>
        <p v-else class="empty-state">{{ s.empty }}</p>
      </section>
    </template>
  </section>
</template>
