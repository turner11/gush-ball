<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import GameLocationLinks from '../components/GameLocationLinks.vue'
import GameScoreboard from '../components/GameScoreboard.vue'
import GameStatsLink from '../components/GameStatsLink.vue'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { gameAddress, played, STATUS_LABELS } from '../lib/games'

const route = useRoute()
const { selectedTeamId, teamsLoaded } = useSelectedTeam()
const team = ref(null)
const game = ref(null)
const loading = ref(true)
const error = ref('')

const scheduleRoute = computed(() => ({ name: 'schedule', params: { slug: route.params.slug } }))
const address = computed(() => gameAddress(game.value, team.value))

// DefaultLayout resolves the slug to selectedTeamId; fetching before that would use a stale remembered team.
watch(
  [selectedTeamId, teamsLoaded, () => route.params.id],
  async () => {
    if (!teamsLoaded.value) return
    if (!selectedTeamId.value) {
      // /teams failed or is empty: nothing to fetch, so end loading instead of showing the skeleton forever
      error.value = 'המשחק לא נמצא.'
      loading.value = false
      return
    }
    const id = selectedTeamId.value
    loading.value = true
    error.value = ''
    try {
      const loaded = await Promise.all([apiFetch(`/teams/${id}`), apiFetch(`/teams/${id}/games/${route.params.id}`)])
      if (id !== selectedTeamId.value) return // a newer team was selected meanwhile
      ;[team.value, game.value] = loaded
    } catch (e) {
      if (id !== selectedTeamId.value) return
      game.value = null
      error.value = e.status === 404 ? 'המשחק לא נמצא.' : 'שגיאה בטעינת המשחק, נסה שוב'
    } finally {
      if (id === selectedTeamId.value) loading.value = false
    }
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="loading" class="mx-auto max-w-3xl space-y-6" aria-busy="true">
    <div class="skeleton h-48" />
    <div class="skeleton h-24" />
  </div>

  <div v-else-if="error" class="mx-auto max-w-3xl space-y-3">
    <p class="empty-state">{{ error }}</p>
    <RouterLink :to="scheduleRoute" class="section-link">ללוח המשחקים</RouterLink>
  </div>

  <div v-else-if="game" class="mx-auto max-w-3xl space-y-6">
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ team.name }}</p>
        <h1 class="page-title">נגד {{ game.opponent.name }}</h1>
      </div>
      <RouterLink :to="scheduleRoute" class="section-link">ללוח המשחקים</RouterLink>
    </header>

    <section class="card sm:p-8">
      <GameScoreboard :game="game" :team="team" large />
    </section>

    <section class="card space-y-4">
      <dl class="space-y-3 sm:grid sm:grid-cols-[auto_1fr] sm:gap-x-6 sm:gap-y-3 sm:space-y-0">
        <dt class="font-bold text-muted">מועד</dt>
        <dd class="flex flex-wrap items-center gap-2">
          {{ formatDateTime(game.scheduled_at) }}
          <span class="badge badge-muted">{{ game.is_home ? 'בית' : 'חוץ' }}</span>
          <span v-if="!played(game)" class="badge badge-muted">{{ STATUS_LABELS[game.status] ?? game.status }}</span>
        </dd>
        <template v-if="address">
          <dt class="font-bold text-muted">מקום</dt>
          <dd class="space-y-2">
            <p class="break-words">{{ address }}</p>
            <GameLocationLinks :address="address" />
          </dd>
        </template>
      </dl>
      <GameStatsLink :game="game" class="btn-secondary" />
    </section>

    <section v-if="game.description" class="card space-y-2">
      <h2 class="section-title">על המשחק</h2>
      <p class="max-w-prose whitespace-pre-line">{{ game.description }}</p>
    </section>
  </div>
</template>
