<script setup>
import { computed, ref, watch } from 'vue'

import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'

const STATUS_LABELS = {
  scheduled: 'מתוכנן',
  final: 'הסתיים',
  postponed: 'נדחה',
  cancelled: 'בוטל',
}

const games = ref([])

// DefaultLayout picks the default team; this view only follows the selection.
const { selectedTeamId } = useSelectedTeam()

const upcoming = computed(() =>
  games.value
    .filter((g) => new Date(g.scheduled_at) >= new Date())
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)),
)
const past = computed(() =>
  games.value
    .filter((g) => new Date(g.scheduled_at) < new Date())
    .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at)),
)

async function loadGames() {
  if (!selectedTeamId.value) {
    games.value = []
    return
  }
  games.value = await apiFetch(`/teams/${selectedTeamId.value}/games`)
}

watch(selectedTeamId, loadGames, { immediate: true })
</script>

<template>
  <section class="space-y-8">
    <h1 class="page-title">לוח משחקים</h1>

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
              <td class="py-2">{{ game.opponent.name }}</td>
              <td class="py-2">{{ game.scheduled_at }}</td>
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
              <td class="py-2">{{ game.opponent.name }}</td>
              <td class="py-2">{{ game.scheduled_at }}</td>
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
