<script setup>
import { computed, ref, watch } from 'vue'

import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { splitGames } from '../lib/games'

const STATUS_LABELS = {
  scheduled: 'מתוכנן',
  final: 'הסתיים',
  postponed: 'נדחה',
  cancelled: 'בוטל',
}

const games = ref([])
const team = ref(null)

// DefaultLayout picks the default team; this view only follows the selection.
const { selectedTeamId } = useSelectedTeam()

const upcoming = computed(() => splitGames(games.value).upcoming)
const past = computed(() => splitGames(games.value).past)

async function loadGames() {
  if (!selectedTeamId.value) {
    games.value = []
    team.value = null
    return
  }
  ;[team.value, games.value] = await Promise.all([
    apiFetch(`/teams/${selectedTeamId.value}`),
    apiFetch(`/teams/${selectedTeamId.value}/games`),
  ])
}

watch(selectedTeamId, loadGames, { immediate: true })
</script>

<template>
  <section class="space-y-8">
    <h1 class="page-title">לוח משחקים</h1>
    <a v-if="team?.ibasketball_team_url" :href="team.ibasketball_team_url" target="_blank" rel="noopener" class="hover:underline">{{ team.name }}</a>

    <p v-if="!games.length" class="empty-state">אין משחקים עדיין.</p>

    <template v-else>
      <section class="space-y-2">
        <h2 class="section-title">משחקים קרובים</h2>
        <table v-if="upcoming.length" class="w-full text-start">
          <thead>
            <tr class="table-header-row">
              <th class="py-2 text-start">יריבה</th>
              <th class="py-2 text-start">תאריך</th>
              <th class="py-2 text-start">בית/חוץ</th>
              <th class="py-2 text-start">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="game in upcoming" :key="game.id" class="table-row">
              <td class="py-2">
                <a v-if="game.opponent.source_url" :href="game.opponent.source_url" target="_blank" rel="noopener" class="hover:underline">{{ game.opponent.name }}</a>
                <template v-else>{{ game.opponent.name }}</template>
              </td>
              <td class="py-2">{{ formatDateTime(game.scheduled_at) }}</td>
              <td class="py-2">{{ game.is_home ? 'בית' : 'חוץ' }}</td>
              <td class="py-2">{{ STATUS_LABELS[game.status] ?? game.status }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-state">אין משחקים קרובים.</p>
      </section>

      <section class="space-y-2">
        <h2 class="section-title">תוצאות</h2>
        <table v-if="past.length" class="w-full text-start">
          <thead>
            <tr class="table-header-row">
              <th class="py-2 text-start">יריבה</th>
              <th class="py-2 text-start">תאריך</th>
              <th class="py-2 text-start">בית/חוץ</th>
              <th class="py-2 text-start">סטטוס</th>
              <th class="py-2 text-start">תוצאה</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="game in past" :key="game.id" class="table-row">
              <td class="py-2">
                <a v-if="game.opponent.source_url" :href="game.opponent.source_url" target="_blank" rel="noopener" class="hover:underline">{{ game.opponent.name }}</a>
                <template v-else>{{ game.opponent.name }}</template>
              </td>
              <td class="py-2">{{ formatDateTime(game.scheduled_at) }}</td>
              <td class="py-2">{{ game.is_home ? 'בית' : 'חוץ' }}</td>
              <td class="py-2">{{ STATUS_LABELS[game.status] ?? game.status }}</td>
              <td class="py-2">
                <span v-if="game.team_score !== null && game.opponent_score !== null">
                  {{ game.team_score }} : {{ game.opponent_score }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-state">אין תוצאות עדיין.</p>
      </section>
    </template>
  </section>
</template>
