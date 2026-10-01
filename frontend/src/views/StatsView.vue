<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import LineupStats from '../components/LineupStats.vue'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { formatGameDate } from '../lib/format'

const route = useRoute()
const router = useRouter()
// DefaultLayout picks the default team; this view only follows the selection.
const { selectedTeamId } = useSelectedTeam()

const players = ref([])
const games = ref([])
const loading = ref(false)
const error = ref(false)

async function load() {
  if (!selectedTeamId.value) return
  loading.value = true
  error.value = false
  try {
    const id = selectedTeamId.value
    ;[players.value, games.value] = await Promise.all([apiFetch(`/teams/${id}/players`), apiFetch(`/teams/${id}/games`)])
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

watch(selectedTeamId, load, { immediate: true })

// The URL (?game=) is the single source of truth for the picker.
const statsGames = computed(() =>
  games.value.filter((g) => g.has_stats).sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at)),
)
const requestedId = computed(() => Number(route.query.game) || null)
const selectedGame = computed(() => statsGames.value.find((g) => g.id === requestedId.value) ?? null)
const fellBack = computed(() => requestedId.value && !selectedGame.value && !loading.value)

function optionLabel(g) {
  const { day, month } = formatGameDate(g.scheduled_at)
  return `נגד ${g.opponent.name} · ${day} ${month}`
}

const pick = (event) => router.push({ query: event.target.value ? { game: event.target.value } : {} })
</script>

<template>
  <section v-if="selectedTeamId" class="space-y-6">
    <div class="page-header">
      <h1 class="page-title">סטטיסטיקה</h1>
    </div>

    <div v-if="loading" class="space-y-4" aria-busy="true">
      <div class="skeleton h-11" />
      <div class="skeleton h-44" />
      <div class="skeleton h-44" />
    </div>
    <div v-else-if="error" class="space-y-3">
      <p class="error-text" role="alert">שגיאה בטעינת הסטטיסטיקה</p>
      <button type="button" class="btn-secondary" @click="load">נסה שוב</button>
    </div>
    <p v-else-if="!statsGames.length" class="empty-state">עדיין אין נתונים לקבוצה</p>
    <template v-else>
      <div class="sm:max-w-sm">
        <label for="stats-game" class="field-label">משחק</label>
        <select id="stats-game" class="field-input" :value="selectedGame?.id ?? ''" @change="pick">
          <option value="">כל המשחקים</option>
          <option v-for="g in statsGames" :key="g.id" :value="g.id">{{ optionLabel(g) }}</option>
        </select>
      </div>
      <p v-if="fellBack" class="text-sm text-muted" role="status">המשחק המבוקש לא נמצא — מוצגים כל המשחקים</p>
      <p class="text-sm text-muted">{{ selectedGame ? '+/- של כל הרכב במשחק הזה' : '+/- של כל הרכב לאורך העונה, לפי נתוני המשחקים' }}</p>
      <LineupStats :team-id="Number(selectedTeamId)" :players="players" :game-id="selectedGame?.id ?? null" />
    </template>
  </section>
</template>
