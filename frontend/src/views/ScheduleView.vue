<script setup>
import { computed, onMounted, ref, watch } from 'vue'

import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'

const STATUS_LABELS = {
  scheduled: 'מתוכנן',
  final: 'הסתיים',
  postponed: 'נדחה',
  cancelled: 'בוטל',
}

const teams = ref([])
const games = ref([])

const { selectedTeamId, ensureDefault } = useSelectedTeam()

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

onMounted(async () => {
  teams.value = await apiFetch('/teams')
  ensureDefault(teams.value)
  await loadGames()
})

watch(selectedTeamId, loadGames)
</script>

<template>
  <section class="space-y-8">
    <h1 class="text-2xl font-bold">לוח משחקים</h1>

    <p v-if="!games.length" class="text-sm text-neutral-500">אין משחקים עדיין.</p>

    <template v-else>
      <section class="space-y-2">
        <h2 class="text-lg font-bold">משחקים קרובים</h2>
        <table v-if="upcoming.length" class="w-full text-start">
          <thead>
            <tr class="border-b border-neutral-200 text-sm dark:border-neutral-700">
              <th class="py-2 text-start">יריבה</th>
              <th class="py-2 text-start">תאריך</th>
              <th class="py-2 text-start">בית/חוץ</th>
              <th class="py-2 text-start">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="game in upcoming" :key="game.id" class="border-b border-neutral-100 dark:border-neutral-800">
              <td class="py-2">{{ game.opponent.name }}</td>
              <td class="py-2">{{ game.scheduled_at }}</td>
              <td class="py-2">{{ game.is_home ? 'בית' : 'חוץ' }}</td>
              <td class="py-2">{{ STATUS_LABELS[game.status] ?? game.status }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-sm text-neutral-500">אין משחקים קרובים.</p>
      </section>

      <section class="space-y-2">
        <h2 class="text-lg font-bold">תוצאות</h2>
        <table v-if="past.length" class="w-full text-start">
          <thead>
            <tr class="border-b border-neutral-200 text-sm dark:border-neutral-700">
              <th class="py-2 text-start">יריבה</th>
              <th class="py-2 text-start">תאריך</th>
              <th class="py-2 text-start">בית/חוץ</th>
              <th class="py-2 text-start">סטטוס</th>
              <th class="py-2 text-start">תוצאה</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="game in past" :key="game.id" class="border-b border-neutral-100 dark:border-neutral-800">
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
        <p v-else class="text-sm text-neutral-500">אין תוצאות עדיין.</p>
      </section>
    </template>
  </section>
</template>
