<script setup>
import { computed, ref, watch } from 'vue'

import AppIcon from '../components/AppIcon.vue'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { result, splitGames, STATUS_LABELS } from '../lib/games'

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
  loading.value = true
  try {
    ;[team.value, games.value] = await Promise.all([
      apiFetch(`/teams/${selectedTeamId.value}`),
      apiFetch(`/teams/${selectedTeamId.value}/games`),
    ])
  } finally {
    loading.value = false
  }
}

watch(selectedTeamId, loadGames, { immediate: true })

const scored = (g) => g.team_score !== null && g.opponent_score !== null
</script>

<template>
  <section class="space-y-8">
    <div class="page-header">
      <h1 class="page-title">לוח משחקים</h1>
      <a v-if="team?.ibasketball_team_url" :href="team.ibasketball_team_url" target="_blank" rel="noopener" class="section-link">{{ team.name }}<AppIcon name="external" /></a>
    </div>

    <div v-if="loading" class="space-y-3" aria-busy="true">
      <div class="skeleton h-16" />
      <div class="skeleton h-16" />
      <div class="skeleton h-16" />
    </div>

    <p v-else-if="!games.length" class="empty-state">אין משחקים עדיין.</p>

    <template v-else>
      <section v-for="s in sections" :key="s.title" class="space-y-2">
        <h2 class="section-title">{{ s.title }}</h2>
        <ol v-if="s.games.length" class="divide-y rounded-xl border bg-white dark:divide-neutral-700 dark:border-neutral-700 dark:bg-neutral-800">
          <li v-for="game in s.games" :key="game.id" class="flex items-center gap-3 px-4 py-3">
            <img v-if="game.opponent.logo_url" :src="game.opponent.logo_url" alt="" class="size-10 shrink-0 object-contain" />
            <span v-else class="size-10 shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-700"></span>
            <div class="min-w-0">
              <p class="font-semibold">
                <a v-if="game.opponent.source_url" :href="game.opponent.source_url" target="_blank" rel="noopener" class="hover:underline">{{ game.opponent.name }}</a>
                <template v-else>{{ game.opponent.name }}</template>
              </p>
              <p class="text-sm text-neutral-500">{{ formatDateTime(game.scheduled_at) }} · {{ game.is_home ? 'בית' : 'חוץ' }}</p>
            </div>
            <div class="ms-auto flex shrink-0 items-center gap-2 text-end">
              <template v-if="scored(game)">
                <span class="text-lg font-bold tabular-nums" dir="ltr">{{ game.team_score }} : {{ game.opponent_score }}</span>
                <span v-if="result(game)" :class="['badge', result(game) === 'W' ? 'badge-win' : 'badge-loss']">{{ result(game) === 'W' ? 'ניצחון' : 'הפסד' }}</span>
              </template>
              <span v-else class="badge badge-muted">{{ STATUS_LABELS[game.status] ?? game.status }}</span>
            </div>
          </li>
        </ol>
        <p v-else class="empty-state">{{ s.empty }}</p>
      </section>
    </template>
  </section>
</template>
