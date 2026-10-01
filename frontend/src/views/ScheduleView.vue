<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import GameLocationLinks from '../components/GameLocationLinks.vue'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { formatGameDate } from '../lib/format'
import { gameStatsRoute, homeFirst, played, result, splitGames, STATUS_LABELS } from '../lib/games'

const games = ref([])
const team = ref(null)
const loading = ref(false)

// DefaultLayout picks the default team; this view only follows the selection.
const { selectedTeamId } = useSelectedTeam()

const upcoming = computed(() => splitGames(games.value).upcoming)
const past = computed(() => splitGames(games.value).past)
const withDate = (gs) => {
  const us = { name: team.value?.name, logo: team.value?.logo_url, url: team.value?.ibasketball_team_url }
  return gs.map((g) => {
    const them = { name: g.opponent.name, logo: g.opponent.logo_url, url: g.opponent.source_url }
    return { ...g, d: formatGameDate(g.scheduled_at), sides: homeFirst(g, us, them) }
  })
}
const sections = computed(() => [
  { title: 'משחקים קרובים', games: withDate(upcoming.value), empty: 'אין משחקים קרובים.' },
  { title: 'תוצאות', games: withDate(past.value), empty: 'אין תוצאות עדיין.' },
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

const addressOf = (g) => (g.is_home ? team.value?.home_court_address : g.opponent?.address)
const edge = (g) => ({ W: 'border-win', L: 'border-loss' })[result(g)] ?? 'border-transparent'
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
          <li v-for="game in s.games" :key="game.id" :class="['flex items-center gap-3 border-s-4 px-4 py-3 sm:gap-4 sm:px-5', edge(game)]">
            <div v-if="game.d" class="w-11 shrink-0 text-center leading-none">
              <span class="block text-2xl font-black tabular-nums">{{ game.d.day }}</span>
              <span class="block text-xs font-bold text-muted">{{ game.d.month }}</span>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <template v-for="(side, i) in game.sides" :key="i">
                <img v-if="side.logo" :src="side.logo" alt="" class="size-10 shrink-0 object-contain" />
                <span v-else class="size-10 shrink-0 rounded-full bg-sunken"></span>
              </template>
            </div>
            <div class="min-w-0 flex-1">
              <p class="break-words font-bold">
                <template v-for="(side, i) in game.sides" :key="i">
                  <span v-if="i" class="font-normal text-muted"> - </span>
                  <a v-if="side.url" :href="side.url" target="_blank" rel="noopener" class="hover:underline">{{ side.name }}</a>
                  <template v-else>{{ side.name }}</template>
                </template>
              </p>
              <p v-if="game.d" class="text-sm text-muted">{{ game.d.weekday }} · {{ game.d.time }} · <span class="badge badge-muted">{{ game.is_home ? 'בית' : 'חוץ' }}</span></p>
              <RouterLink v-if="game.has_stats" :to="gameStatsRoute(game)" class="section-link" :aria-label="'חמישיות המשחק נגד ' + game.opponent.name">חמישיות</RouterLink>
            </div>
            <div class="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
              <GameLocationLinks v-if="addressOf(game)" :address="addressOf(game)" />
              <template v-if="played(game)">
                <span class="text-xl font-black tabular-nums">{{ homeFirst(game, game.team_score, game.opponent_score).join(' : ') }}</span>
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
